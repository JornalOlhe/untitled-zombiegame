package com.deadrecoil.game;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;

/** Exposes only the verified APK in the app's private update cache to the installer. */
public final class UpdateFileProvider extends ContentProvider {
    @Override public boolean onCreate() { return true; }
    @Override public String getType(Uri uri) { return "application/vnd.android.package-archive"; }
    @Override public Cursor query(Uri uri, String[] projection, String selection,
                                  String[] args, String sortOrder) {
        File file = verifiedFile(uri);
        if (file == null) return null;
        MatrixCursor result = new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE});
        result.addRow(new Object[]{"DeadRecoil.apk", file.length()});
        return result;
    }
    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File file = verifiedFile(uri);
        if (file == null || !"r".equals(mode)) throw new FileNotFoundException("Update unavailable");
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
    }
    private File verifiedFile(Uri uri) {
        if (getContext() == null || !"com.deadrecoil.game.updates".equals(uri.getAuthority()) ||
                !"/DeadRecoil.apk".equals(uri.getPath())) return null;
        File file = new File(getContext().getCacheDir(), "verified-update.apk");
        return file.isFile() ? file : null;
    }
    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException(); }
    @Override public int delete(Uri uri, String selection, String[] args) { throw new UnsupportedOperationException(); }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] args) { throw new UnsupportedOperationException(); }
}
