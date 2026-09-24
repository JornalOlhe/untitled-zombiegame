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

/** Checks a public release at launch, downloads it inside the app, then opens Android's installer. */
final class UpdateManager {
    private static final String RELEASE = "https://api.github.com/repos/JornalOlhe/untitled-zombiegame/releases/latest";
    private static final String ASSET_PREFIX = "https://github.com/JornalOlhe/untitled-zombiegame/releases/download/";
    private static final long MAX_APK_BYTES = 200L * 1024 * 1024;
    private final Activity activity;
    private boolean awaitingInstallPermission;
    private volatile boolean busy;
    private volatile boolean cancelled;
    private long lastCheck;
    private String releaseNotes = "";
    private String releaseName = "";

    UpdateManager(Activity activity) { this.activity = activity; }

    synchronized void check() {
        if (busy || System.currentTimeMillis() - lastCheck < 15 * 60 * 1000) return;
        busy = true;
        lastCheck = System.currentTimeMillis();
        new Thread(() -> {
            try {
                HttpURLConnection connection = open(RELEASE);
                try {
                    if (connection.getResponseCode() != 200) return; // No release yet, or offline.
                    byte[] body = readLimited(connection.getInputStream(), 1024 * 1024);
                    JSONObject release = new JSONObject(new String(body, "UTF-8"));
                    if (release.optBoolean("draft") || release.optBoolean("prerelease")) return;
                    String tag = release.optString("tag_name");
                    releaseName = release.optString("name", tag);
                    releaseNotes = release.optString("body", "Melhorias e correções.");
                    if (releaseNotes.length() > 1200) releaseNotes = releaseNotes.substring(0, 1200) + "…";
                    if (!tag.matches("v[0-9]+")) return;
                    int version = Integer.parseInt(tag.substring(1));
                    if (version <= installedVersion()) return;
                    JSONArray assets = release.optJSONArray("assets");
                    if (assets == null) return;
                    for (int i = 0; i < assets.length(); i++) {
                        JSONObject asset = assets.getJSONObject(i);
                        if (!"DeadRecoil.apk".equals(asset.optString("name"))) continue;
                        String url = asset.optString("browser_download_url");
                        if (!url.startsWith(ASSET_PREFIX) || !url.endsWith("/DeadRecoil.apk")) return;
                        String digest = asset.optString("digest");
                        activity.runOnUiThread(() -> {
                            if (activity.isFinishing() || activity.isDestroyed()) return;
                            File cached = new File(activity.getCacheDir(), "verified-update.apk");
                            try {
                                verifyPackage(cached, version);
                                ready();
                            } catch (Exception missing) { download(version, url, digest); }
                        });
                        return;
                    }
                } finally { connection.disconnect(); }
            } catch (Exception ignored) { /* Offline play remains available. */ }
            finally { busy = false; }
        }, "DeadRecoil-update-check").start();
    }

    private void ready() {
        if (activity.isFinishing() || activity.isDestroyed()) return;
        new AlertDialog.Builder(activity)
            .setTitle(releaseName + " · pronta para instalar")
            .setMessage(releaseNotes + "\n\nSeu progresso será mantido. Confirme a instalação para atualizar.")
            .setPositiveButton("Instalar atualização", (d, w) -> install())
            .setNegativeButton("Jogar agora", null)
            .show();
    }

    private void download(int version, String url, String digest) {
        if (activity.isFinishing() || activity.isDestroyed()) return;
        busy = true;
        cancelled = false;
        AlertDialog progress = new AlertDialog.Builder(activity)
                .setTitle(releaseName + " · atualização disponível")
                .setMessage("Baixando automaticamente…\n\n" + releaseNotes)
                .setNegativeButton("Baixar depois", (d, w) -> cancelled = true)
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
                    try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(temp)) {
                        byte[] buffer = new byte[32768];
                        int count;
                        while ((count = input.read(buffer)) != -1) {
                            if (cancelled) throw new Exception("Download adiado");
                            received += count;
                            if (received > MAX_APK_BYTES) throw new Exception("Arquivo muito grande");
                            sha.update(buffer, 0, count);
                            output.write(buffer, 0, count);
                            int percent = total > 0 ? (int) (received * 100 / total) : -1;
                            if (percent >= lastPercent + 5) {
                                lastPercent = percent;
                                String label = percent >= 0 ? "Baixando: " + percent + "%" : "Baixando…";
                                activity.runOnUiThread(() -> {
                                    if (!activity.isFinishing() && !activity.isDestroyed())
                                        progress.setMessage(label + "\n\n" + releaseNotes);
                                });
                            }
                        }
                    }
                    if (received == 0 || (total > 0 && received != total)) throw new Exception("Download incompleto");
                    if (digest.startsWith("sha256:") && !digest.substring(7).equalsIgnoreCase(hex(sha.digest())))
                        throw new Exception("Arquivo não passou na verificação");
                    verifyPackage(temp, version);
                    File verified = new File(activity.getCacheDir(), "verified-update.apk");
                    if (verified.exists() && !verified.delete()) throw new Exception("Falha ao substituir atualização");
                    if (!temp.renameTo(verified)) throw new Exception("Falha ao preparar atualização");
                    activity.runOnUiThread(() -> {
                        if (!activity.isFinishing() && !activity.isDestroyed()) { progress.dismiss(); ready(); }
                    });
                } finally { connection.disconnect(); }
            } catch (Exception e) {
                temp.delete();
                activity.runOnUiThread(() -> {
                    if (activity.isFinishing() || activity.isDestroyed()) return;
                    progress.dismiss();
                    if (cancelled) return;
                    new AlertDialog.Builder(activity)
                        .setTitle("Não foi possível atualizar")
                        .setMessage(e.getMessage() == null ? "Verifique sua conexão e tente novamente." : e.getMessage())
                        .setPositiveButton("Tentar novamente", (d, w) -> download(version, url, digest))
                        .setNegativeButton("Voltar ao jogo", null)
                        .show();
                });
            } finally { busy = false; }
        }, "DeadRecoil-update-download").start();
    }

    private void verifyPackage(File file, int expectedVersion) throws Exception {
        PackageManager manager = activity.getPackageManager();
        PackageInfo archive = manager.getPackageArchiveInfo(file.getAbsolutePath(), PackageManager.GET_SIGNATURES);
        PackageInfo installed = manager.getPackageInfo(activity.getPackageName(), PackageManager.GET_SIGNATURES);
        if (archive == null || !activity.getPackageName().equals(archive.packageName) ||
                archive.versionCode != expectedVersion || archive.versionCode <= installed.versionCode ||
                archive.signatures == null || installed.signatures == null ||
                archive.signatures.length != 1 || installed.signatures.length != 1 ||
                !Arrays.equals(archive.signatures[0].toByteArray(), installed.signatures[0].toByteArray()))
            throw new Exception("O APK não corresponde à assinatura e versão do jogo instalado");
    }

    private void install() {
        if (Build.VERSION.SDK_INT >= 26 && !activity.getPackageManager().canRequestPackageInstalls()) {
            awaitingInstallPermission = true;
            new AlertDialog.Builder(activity)
                .setTitle("Permitir atualização")
                .setMessage("O Android precisa de sua permissão para instalar a atualização baixada pelo jogo.")
                .setPositiveButton("Abrir configurações", (d, w) -> {
                    Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
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
            intent.setDataAndType(Uri.parse("content://com.deadrecoil.game.updates/DeadRecoil.apk"),
                    "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            activity.startActivity(intent);
        } catch (Exception e) {
            new AlertDialog.Builder(activity).setMessage("Não foi possível abrir a instalação: " + e.getMessage())
                    .setPositiveButton("OK", null).show();
        }
    }

    void resumeInstall() {
        if (awaitingInstallPermission && activity.getPackageManager().canRequestPackageInstalls()) install();
        else if (!awaitingInstallPermission) check();
    }

    private int installedVersion() throws Exception {
        return activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0).versionCode;
    }

    private static HttpURLConnection open(String address) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(address).openConnection();
        connection.setConnectTimeout(8000);
        connection.setReadTimeout(20000);
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
        for (byte value : bytes) result.append(String.format("%02x", value & 255));
        return result.toString();
    }
}
