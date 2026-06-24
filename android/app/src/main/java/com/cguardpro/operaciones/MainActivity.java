package com.cguardpro.operaciones;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;
import android.os.Bundle;
import android.webkit.PermissionRequest;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // App-local plugins must be registered before the bridge initializes.
        registerPlugin(BackgroundAudioPlugin.class);
        super.onCreate(savedInstanceState);
        createDefaultPushChannel();
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
