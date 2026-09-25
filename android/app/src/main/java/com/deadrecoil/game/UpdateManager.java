package com.deadrecoil.game;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Arrays;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Checks GitHub releases when the game opens.
 *
 * Flow:
 * 1) Detect a newer release.
 * 2) Ask the player before downloading anything.
 * 3) Stable releases named DeadRecoil.apk are downloaded and verified in-app.
 * 4) QA/prerelease builds open the official GitHub asset/release page instead,
 *    because Android only allows an in-place update when both APKs use the same signing key.
 */
final class UpdateManager {
    private static final String RELEASES =
            "https://api.github.com/repos/JornalOlhe/untitled-zombiegame/releases?per_page=20";
    private static final String ASSET_PREFIX =
            "https://github.com/JornalOlhe/untitled-zombiegame/releases/download/";
    private static final long MAX_APK_BYTES = 200L * 1024 * 1024;

    private final Activity activity;
    private boolean awaitingInstallPermission;
    private volatile boolean busy;
    private volatile boolean cancelled;
    private volatile boolean promptVisible;
    private long lastCheck;
    private int promptedVersion = -1;
    private String releaseNotes = "";
    private String releaseName = "";
    private String releasePage = "";

    UpdateManager(Activity activity) {
        this.activity = activity;
    }

    synchronized void check() {
        if (busy || promptVisible || System.currentTimeMillis() - lastCheck < 15 * 60 * 1000) return;
        busy = true;
        lastCheck = System.currentTimeMillis();

        new Thread(() -> {
            try {
                final int installed = installedVersion();
                final String installedName = installedVersionName();

                HttpURLConnection connection = open(RELEASES);
                try {
                    if (connection.getResponseCode() != 200) return;
                    byte[] body = readLimited(connection.getInputStream(), 2 * 1024 * 1024);
                    JSONArray releases = new JSONArray(new String(body, "UTF-8"));
                    JSONObject newest = newestRelease(releases, installed);
                    if (newest == null) return;

                    final int version = releaseVersion(newest);
                    if (version <= installed || version == promptedVersion) return;

                    final boolean prerelease = newest.optBoolean("prerelease");
                    final String name = newest.optString("name", newest.optString("tag_name", "Nova versão"));
                    final String notes = trimNotes(newest.optString("body", "Melhorias e correções."));
                    final String page = newest.optString("html_url", "");
                    final JSONObject exactAsset = findAsset(newest.optJSONArray("assets"), "DeadRecoil.apk");
                    final JSONObject anyApk = exactAsset != null
                            ? exactAsset
                            : findFirstApk(newest.optJSONArray("assets"));

                    releaseName = name;
                    releaseNotes = notes;
                    releasePage = page;

                    activity.runOnUiThread(() ->
                            showUpdatePrompt(installedName, version, prerelease, exactAsset, anyApk));
                } finally {
                    connection.disconnect();
                }
            } catch (Exception ignored) {
                // Offline play must keep working.
            } finally {
                busy = false;
            }
        }, "DeadRecoil-update-check").start();
    }

    private void showUpdatePrompt(
            String installedName,
            int version,
            boolean prerelease,
            JSONObject exactAsset,
            JSONObject anyApk) {
        if (activity.isFinishing() || activity.isDestroyed() || promptVisible) return;

        promptedVersion = version;
        promptVisible = true;

        StringBuilder message = new StringBuilder();
        message.append("Sua versão ")
                .append(installedName)
                .append(" está desatualizada.\n\n")
                .append(releaseName)
                .append(" está disponível");

        if (prerelease) message.append(" como versão de testes");
        message.append(".\n\nBaixar a versão mais recente agora?");

        if (!releaseNotes.isEmpty()) {
            message.append("\n\n").append(releaseNotes);
        }

        AlertDialog dialog = new AlertDialog.Builder(activity)
                .setTitle("Atualização disponível")
                .setMessage(message.toString())
                .setPositiveButton("Baixar mais recente", (d, w) -> {
                    promptVisible = false;
                    if (!prerelease && exactAsset != null) {
                        startVerifiedDownload(version, exactAsset);
                    } else if (anyApk != null) {
                        openExternal(anyApk.optString("browser_download_url", releasePage));
                    } else {
                        openExternal(releasePage);
                    }
                })
                .setNegativeButton("Agora não", (d, w) -> promptVisible = false)
                .setOnCancelListener(d -> promptVisible = false)
                .create();

        dialog.show();
    }

    private void startVerifiedDownload(int version, JSONObject asset) {
        String url = asset.optString("browser_download_url", "");
        if (!url.startsWith(ASSET_PREFIX) || !url.endsWith("/DeadRecoil.apk")) {
            openExternal(releasePage);
            return;
        }

        String digest = asset.optString("digest", "");
        File cached = new File(activity.getCacheDir(), "verified-update.apk");
        try {
            verifyPackage(cached, version);
            ready();
        } catch (Exception missing) {
            download(version, url, digest);
        }
    }

    private void ready() {
        if (activity.isFinishing() || activity.isDestroyed()) return;
        new AlertDialog.Builder(activity)
                .setTitle(releaseName + " · pronta para instalar")
                .setMessage("Download concluído e verificado.\n\nSeu progresso será mantido.")
                .setPositiveButton("Instalar atualização", (d, w) -> install())
                .setNegativeButton("Jogar agora", null)
                .show();
    }

    private void download(int version, String url, String digest) {
        if (activity.isFinishing() || activity.isDestroyed()) return;

        busy = true;
        cancelled = false;

        AlertDialog progress = new AlertDialog.Builder(activity)
                .setTitle(releaseName + " · baixando")
                .setMessage("Baixando atualização…")
                .setNegativeButton("Cancelar", (d, w) -> cancelled = true)
                .setCancelable(false)
                .create();
        progress.show();

        new Thread(() -> {
            File temp = new File(activity.getCacheDir(), "update-downloading.apk");
            try {
                HttpURLConnection connection = open(url);
                try {
                    if (connection.getResponseCode() != 200) throw new Exception("Download indisponível");

                    long total = connection.getContentLengthLong();
                    if (total > MAX_APK_BYTES) throw new Exception("Arquivo muito grande");

                    MessageDigest sha = MessageDigest.getInstance("SHA-256");
                    long received = 0;
                    int lastPercent = -1;

                    try (InputStream input = connection.getInputStream();
                         FileOutputStream output = new FileOutputStream(temp)) {
                        byte[] buffer = new byte[32768];
                        int count;

                        while ((count = input.read(buffer)) != -1) {
                            if (cancelled) throw new Exception("Download cancelado");

                            received += count;
                            if (received > MAX_APK_BYTES) throw new Exception("Arquivo muito grande");

                            sha.update(buffer, 0, count);
                            output.write(buffer, 0, count);

                            int percent = total > 0 ? (int) (received * 100 / total) : -1;
                            if (percent >= lastPercent + 5) {
                                lastPercent = percent;
                                final String label = percent >= 0
                                        ? "Baixando atualização: " + percent + "%"
                                        : "Baixando atualização…";

                                activity.runOnUiThread(() -> {
                                    if (!activity.isFinishing() && !activity.isDestroyed()) {
                                        progress.setMessage(label);
                                    }
                                });
                            }
                        }
                    }

                    if (received == 0 || (total > 0 && received != total)) {
                        throw new Exception("Download incompleto");
                    }

                    if (digest.startsWith("sha256:")
                            && !digest.substring(7).equalsIgnoreCase(hex(sha.digest()))) {
                        throw new Exception("Arquivo não passou na verificação");
                    }

                    verifyPackage(temp, version);

                    File verified = new File(activity.getCacheDir(), "verified-update.apk");
                    if (verified.exists() && !verified.delete()) {
                        throw new Exception("Falha ao substituir atualização");
                    }
                    if (!temp.renameTo(verified)) {
                        throw new Exception("Falha ao preparar atualização");
                    }

                    activity.runOnUiThread(() -> {
                        if (!activity.isFinishing() && !activity.isDestroyed()) {
                            progress.dismiss();
                            ready();
                        }
                    });
                } finally {
                    connection.disconnect();
                }
            } catch (Exception e) {
                temp.delete();
                activity.runOnUiThread(() -> {
                    if (activity.isFinishing() || activity.isDestroyed()) return;
                    progress.dismiss();
                    if (cancelled) return;

                    new AlertDialog.Builder(activity)
                            .setTitle("Não foi possível atualizar automaticamente")
                            .setMessage((e.getMessage() == null
                                    ? "Não foi possível validar a atualização."
                                    : e.getMessage())
                                    + "\n\nVocê pode abrir a release oficial no GitHub.")
                            .setPositiveButton("Abrir GitHub", (d, w) -> openExternal(releasePage))
                            .setNegativeButton("Voltar ao jogo", null)
                            .show();
                });
            } finally {
                busy = false;
            }
        }, "DeadRecoil-update-download").start();
    }

    private JSONObject newestRelease(JSONArray releases, int installed) {
        JSONObject newest = null;
        int newestVersion = installed;

        for (int i = 0; i < releases.length(); i++) {
            JSONObject release = releases.optJSONObject(i);
            if (release == null || release.optBoolean("draft")) continue;

            int version = releaseVersion(release);
            if (version > newestVersion) {
                newestVersion = version;
                newest = release;
            }
        }

        return newest;
    }

    private static int releaseVersion(JSONObject release) {
        String tag = release.optString("tag_name", "");
        if (!tag.matches("v[0-9]+")) return -1;

        try {
            return Integer.parseInt(tag.substring(1));
        } catch (NumberFormatException ignored) {
            return -1;
        }
    }

    private static JSONObject findAsset(JSONArray assets, String name) {
        if (assets == null) return null;
        for (int i = 0; i < assets.length(); i++) {
            JSONObject asset = assets.optJSONObject(i);
            if (asset != null && name.equals(asset.optString("name"))) return asset;
        }
        return null;
    }

    private static JSONObject findFirstApk(JSONArray assets) {
        if (assets == null) return null;
        for (int i = 0; i < assets.length(); i++) {
            JSONObject asset = assets.optJSONObject(i);
            if (asset == null) continue;

            String name = asset.optString("name", "").toLowerCase();
            String url = asset.optString("browser_download_url", "");
            if (name.endsWith(".apk") && url.startsWith(ASSET_PREFIX)) return asset;
        }
        return null;
    }

    private static String trimNotes(String value) {
        if (value == null) return "";
        value = value.trim();
        if (value.length() > 650) return value.substring(0, 650) + "…";
        return value;
    }

    private void verifyPackage(File file, int expectedVersion) throws Exception {
        if (!file.exists() || file.length() == 0) throw new Exception("Atualização ainda não foi baixada");

        PackageManager manager = activity.getPackageManager();
        PackageInfo archive = manager.getPackageArchiveInfo(
                file.getAbsolutePath(), PackageManager.GET_SIGNATURES);
        PackageInfo installed = manager.getPackageInfo(
                activity.getPackageName(), PackageManager.GET_SIGNATURES);

        if (archive == null
                || !activity.getPackageName().equals(archive.packageName)
                || archive.versionCode != expectedVersion
                || archive.versionCode <= installed.versionCode
                || archive.signatures == null
                || installed.signatures == null
                || archive.signatures.length != 1
                || installed.signatures.length != 1
                || !Arrays.equals(
                        archive.signatures[0].toByteArray(),
                        installed.signatures[0].toByteArray())) {
            throw new Exception("O APK não corresponde à assinatura e versão do jogo instalado");
        }
    }

    private void install() {
        if (Build.VERSION.SDK_INT >= 26
                && !activity.getPackageManager().canRequestPackageInstalls()) {
            awaitingInstallPermission = true;

            new AlertDialog.Builder(activity)
                    .setTitle("Permitir atualização")
                    .setMessage("O Android precisa de sua permissão para instalar a atualização baixada pelo jogo.")
                    .setPositiveButton("Abrir configurações", (d, w) -> {
                        Intent settings = new Intent(
                                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                Uri.parse("package:" + activity.getPackageName()));
                        activity.startActivity(settings);
                    })
                    .setNegativeButton("Depois", (d, w) -> awaitingInstallPermission = false)
                    .show();
            return;
        }

        awaitingInstallPermission = false;

        try {
            Intent intent = new Intent(Intent.ACTION_INSTALL_PACKAGE);
            intent.setDataAndType(
                    Uri.parse("content://com.deadrecoil.game.updates/DeadRecoil.apk"),
                    "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            activity.startActivity(intent);
        } catch (Exception e) {
            new AlertDialog.Builder(activity)
                    .setTitle("Não foi possível abrir a instalação")
                    .setMessage(e.getMessage())
                    .setPositiveButton("OK", null)
                    .show();
        }
    }

    void resumeInstall() {
        if (awaitingInstallPermission
                && activity.getPackageManager().canRequestPackageInstalls()) {
            install();
        } else if (!awaitingInstallPermission) {
            check();
        }
    }

    private void openExternal(String address) {
        if (address == null || address.isEmpty()) return;
        try {
            Uri uri = Uri.parse(address);
            if (!"https".equalsIgnoreCase(uri.getScheme())) return;
            activity.startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception ignored) {
            // The game remains usable even when no browser is available.
        }
    }

    private int installedVersion() throws Exception {
        return activity.getPackageManager()
                .getPackageInfo(activity.getPackageName(), 0)
                .versionCode;
    }

    private String installedVersionName() throws Exception {
        PackageInfo info = activity.getPackageManager()
                .getPackageInfo(activity.getPackageName(), 0);
        return info.versionName == null ? "atual" : info.versionName;
    }

    private static HttpURLConnection open(String address) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(address).openConnection();
        connection.setConnectTimeout(8000);
        connection.setReadTimeout(20000);
        connection.setRequestProperty("Accept", "application/vnd.github+json");
        connection.setRequestProperty("User-Agent", "DeadRecoil-Android-Updater");
        return connection;
    }

    private static byte[] readLimited(InputStream input, int limit) throws Exception {
        java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int count;

        while ((count = input.read(buffer)) != -1) {
            if (output.size() + count > limit) throw new Exception("Resposta grande demais");
            output.write(buffer, 0, count);
        }

        return output.toByteArray();
    }

    private static String hex(byte[] bytes) {
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) {
            result.append(String.format("%02x", value & 255));
        }
        return result.toString();
    }
}
