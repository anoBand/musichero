package io.github.anoband.musichero;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Updates for APKs installed from GitHub Releases (not the Play Store, which updates apps itself).
 * JS (js/native.js) finds a newer release; this downloads its APK and opens Android's installer.
 * Android only installs it over this app when it is signed with the same key.
 */
@CapacitorPlugin(name = "Updater")
public class UpdaterPlugin extends Plugin {
    /** Only APKs from this repository's releases are downloaded. */
    private static final String ALLOWED = "https://github.com/anoband/musichero/releases/download/";

    /** installer: who installed the app (com.android.vending = Play Store); canInstall: "install unknown apps" allowed. */
    @PluginMethod
    public void info(PluginCall call) {
        Context c = getContext();
        PackageManager pm = c.getPackageManager();
        String installer = null;
        try {
            if (Build.VERSION.SDK_INT >= 30) installer = pm.getInstallSourceInfo(c.getPackageName()).getInstallingPackageName();
            else installer = pm.getInstallerPackageName(c.getPackageName());
        } catch (Exception ignored) {
        }
        JSObject r = new JSObject();
        r.put("installer", installer);
        r.put("canInstall", Build.VERSION.SDK_INT < 26 || pm.canRequestPackageInstalls());
        call.resolve(r);
    }

    /** Opens the system setting that lets this app install updates. */
    @PluginMethod
    public void allowInstall(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    /** Downloads { url } and opens the installer. Sends "progress" events { percent }. */
    @PluginMethod
    public void install(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !url.startsWith(ALLOWED) || !url.endsWith(".apk")) {
            call.reject("not an app release");
            return;
        }
        new Thread(() -> {
            try {
                File dir = new File(getContext().getCacheDir(), "updates");
                if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("no cache folder");
                File[] old = dir.listFiles();
                if (old != null) for (File f : old) f.delete();
                File apk = new File(dir, "update.apk");
                download(url, apk);
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                Intent i = new Intent(Intent.ACTION_VIEW);
                i.setDataAndType(uri, "application/vnd.android.package-archive");
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
                call.resolve();
            } catch (Exception e) {
                call.reject("download failed: " + e.getMessage());
            }
        }).start();
    }

    /** GitHub answers with redirects to its file host; follows up to five of them. */
    private void download(String from, File to) throws IOException {
        URL u = new URL(from);
        HttpURLConnection conn = null;
        for (int hops = 0; ; hops++) {
            conn = (HttpURLConnection) u.openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(30000);
            int code = conn.getResponseCode();
            if (code >= 300 && code < 400 && hops < 5) {
                String next = conn.getHeaderField("Location");
                conn.disconnect();
                if (next == null) throw new IOException("redirect without location");
                u = new URL(u, next);
                if (!"https".equals(u.getProtocol())) throw new IOException("not https");
                continue;
            }
            if (code != 200) throw new IOException("HTTP " + code);
            break;
        }
        long total = conn.getContentLengthLong();
        long got = 0;
        int lastPercent = -1;
        try (InputStream in = conn.getInputStream(); OutputStream out = new FileOutputStream(to)) {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                got += n;
                if (total > 0) {
                    int p = (int) (got * 100 / total);
                    if (p != lastPercent) {
                        lastPercent = p;
                        JSObject ev = new JSObject();
                        ev.put("percent", p);
                        notifyListeners("progress", ev);
                    }
                }
            }
        } finally {
            conn.disconnect();
        }
    }
}
