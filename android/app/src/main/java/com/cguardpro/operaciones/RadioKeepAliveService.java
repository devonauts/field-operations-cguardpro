package com.cguardpro.operaciones;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;

/**
 * Foreground service that keeps the app process — and therefore the live radio's
 * socket.io connection + Web Audio receive path — alive while the channel is
 * connected and the app is backgrounded. This is the Android counterpart of the
 * iOS BackgroundAudioPlugin keep-alive: on Android the process is killed/Dozed in
 * the background, dropping the socket, unless a foreground service is running.
 *
 * The service is declared with microphone + mediaPlayback foreground types so the
 * WebView's getUserMedia (PTT transmit) and audio playback (receive) keep working
 * in the background on Android 14+. Started/stopped by BackgroundAudioPlugin,
 * which RadioContext drives on duty change.
 */
public class RadioKeepAliveService extends Service {
    private static final String CHANNEL_ID = "radio_keepalive";
    private static final int NOTIF_ID = 4781;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        createChannel();
        Notification notif = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Radio activa")
            .setContentText("Canal de radio conectado en segundo plano")
            .setSmallIcon(getApplicationInfo().icon)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) { // Android 14 (API 34)
            int type = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                     | ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK;
            startForeground(NOTIF_ID, notif, type);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) { // Android 10 (API 29)
            startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        } else {
            startForeground(NOTIF_ID, notif);
        }
        // Restart if the OS kills us while the channel should still be alive; the
        // plugin's stop() is what truly ends it (off duty).
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null && nm.getNotificationChannel(CHANNEL_ID) == null) {
                NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, "Radio en segundo plano", NotificationManager.IMPORTANCE_LOW);
                ch.setDescription("Mantiene el canal de radio conectado cuando la app está en segundo plano.");
                ch.setShowBadge(false);
                ch.setSound(null, null);
                nm.createNotificationChannel(ch);
            }
        }
    }
}
