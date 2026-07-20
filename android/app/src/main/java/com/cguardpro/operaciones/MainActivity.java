package com.cguardpro.operaciones;

import android.app.AlertDialog;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.PermissionRequest;

import androidx.webkit.WebViewCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // App-local plugins must be registered before the bridge initializes.
        registerPlugin(BackgroundAudioPlugin.class);
        super.onCreate(savedInstanceState);
        createDefaultPushChannel();
        enforceMinWebView();
    }

    /**
     * The web bundle (Tailwind v4 + layered Ionic CSS) requires a modern
     * WebView: below Chromium 99 every @layer block is discarded and the app
     * renders a PERMANENT BLACK SCREEN after the splash; 99-110 renders with
     * ~160 broken color-mix() declarations. Floor = 111 (Tailwind v4's own
     * browser baseline). Devices without Play-updated WebView (AOSP,
     * enterprise, emulators) would otherwise fail silently.
     */
    private static final int MIN_WEBVIEW_MAJOR = 111;

    private void enforceMinWebView() {
        try {
            PackageInfo wv = WebViewCompat.getCurrentWebViewPackage(this);
            if (wv == null || wv.versionName == null) return; // unknown → don't false-block
            int major = 0;
            try { major = Integer.parseInt(wv.versionName.split("\\.")[0]); } catch (Exception ignored) {}
            if (major > 0 && major < MIN_WEBVIEW_MAJOR) {
                final String pkg = wv.packageName;
                new AlertDialog.Builder(this)
                    .setTitle("Actualización requerida")
                    .setMessage("CGuardPro necesita Android System WebView " + MIN_WEBVIEW_MAJOR
                        + " o superior (instalado: " + wv.versionName
                        + "). Actualízalo desde Play Store y vuelve a abrir la app.")
                    .setCancelable(false)
                    .setPositiveButton("Actualizar", (d, w) -> {
                        try {
                            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + pkg)));
                        } catch (Exception e) {
                            startActivity(new Intent(Intent.ACTION_VIEW,
                                Uri.parse("https://play.google.com/store/apps/details?id=" + pkg)));
                        }
                    })
                    .show();
            }
        } catch (Exception ignored) { /* never block launch on the guard itself */ }
    }

    /**
     * The backend sends FCM pushes (incl. the pase de novedades) on channel id
     * "default". On Android 8+ a notification only pops as a heads-up banner with
     * sound when its channel has HIGH importance — so we must create that channel
     * ourselves; otherwise the OS falls back to a silent default. This is the
     * Android equivalent of the iOS time-sensitive interruption level.
     */
    private void createDefaultPushChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null && nm.getNotificationChannel("default") == null) {
                NotificationChannel ch = new NotificationChannel(
                    "default", "Avisos", NotificationManager.IMPORTANCE_HIGH);
                ch.setDescription("Pases de novedades y avisos operativos.");
                ch.enableVibration(true);
                nm.createNotificationChannel(ch);
            }
        }
    }

    @Override
    public void onStart() {
        super.onStart();

        // Allow the in-app WebView to use the camera/mic via getUserMedia()
        // (the geo-stamped clock-in selfie). Without granting the WebView's
        // PermissionRequest, Android silently denies getUserMedia and the
        // camera never opens. We keep all other BridgeWebChromeClient behaviour
        // (file pickers, etc.) by extending it.
        getBridge().getWebView().setWebChromeClient(new BridgeWebChromeClient(getBridge()) {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> request.grant(request.getResources()));
            }
        });
    }
}
