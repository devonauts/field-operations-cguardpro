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
 * Foreground service for the two-way radio (push-to-talk). The radio is a VOICE
 * COMMUNICATION session — NOT media playback — so the service is typed
 * `microphone`: that one type keeps the whole comms session (transmit over
 * getUserMedia + receive over WebRTC) alive while the app is backgrounded/Dozed.
 * This is the correct model and the Play-safe one (media-playback FGS is for
 * media apps and a frequent rejection reason).
 *
 * IMPORTANT: this service does NOT touch the Android audio mode or routing.
 * The radio now runs on LiveKit (WebRTC in the WebView), which manages its OWN
 * audio mode (communication), echo-cancellation/noise-suppression, and output
 * routing. A native setMode(MODE_IN_COMMUNICATION) + setCommunicationDevice here
 * FOUGHT with LiveKit and SILENCED background reception — the supervisor app,
 * which does no native audio manipulation at all, received in the background just
 * fine. So we keep only the process keep-alive and let LiveKit own the audio.
 * (The old raw-PCM/Web-Audio radio needed the native mode; LiveKit does not.)
 *
 * Started/stopped by BackgroundAudioPlugin, which RadioContext drives on
 * channel connect/disconnect.
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

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) { // Android 10 (API 29)+
            startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        } else {
            startForeground(NOTIF_ID, notif);
        }

        // NOT sticky: if the OS kills the app process, resurrecting this service
        // alone is useless (the radio lives in the WebView, which is gone) and
        // leaves a misleading "Radio activa" notification with no radio behind
        // it. RadioContext restarts the service when the app reconnects.
        return START_NOT_STICKY;
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
