package com.cguardpro.operaciones;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;

/**
 * Foreground service for the two-way radio (push-to-talk). The radio is a VOICE
 * COMMUNICATION session — NOT media playback — so the service is typed
 * `microphone`: that one type keeps the whole comms session (transmit over
 * getUserMedia + receive over Web Audio, both on the radio socket) alive while the
 * app is backgrounded/Dozed. This is the correct model and the Play-safe one
 * (media-playback FGS is for media apps and a frequent rejection reason).
 *
 * While active it also puts the device audio into communication mode
 * (MODE_IN_COMMUNICATION) so the platform applies hardware echo-cancellation /
 * noise-suppression and comms routing, and routes to a connected headset or the
 * loudspeaker so a pocketed phone is still audible — like a real radio.
 * Everything is restored on stop.
 *
 * Started/stopped by BackgroundAudioPlugin, which RadioContext drives on
 * channel connect/disconnect.
 */
public class RadioKeepAliveService extends Service {
    private static final String CHANNEL_ID = "radio_keepalive";
    private static final int NOTIF_ID = 4781;

    private AudioManager audioManager;
    private int previousMode = AudioManager.MODE_NORMAL;
    private boolean audioConfigured = false;

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

        configureCommunicationAudio();

        // Restart if the OS kills us while the channel should still be alive; the
        // plugin's stop() is what truly ends it (off duty / channel disconnect).
        return START_STICKY;
    }

    /** Put audio into communication mode + route to a headset (preferred) or speaker. */
    private void configureCommunicationAudio() {
        try {
            audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (audioManager == null) return;
            previousMode = audioManager.getMode();
            audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) { // API 31+: modern routing
                AudioDeviceInfo chosen = null, speaker = null;
                for (AudioDeviceInfo d : audioManager.getAvailableCommunicationDevices()) {
                    int t = d.getType();
                    if (t == AudioDeviceInfo.TYPE_BLUETOOTH_SCO
                            || t == AudioDeviceInfo.TYPE_WIRED_HEADSET
                            || t == AudioDeviceInfo.TYPE_WIRED_HEADPHONES
                            || t == AudioDeviceInfo.TYPE_USB_HEADSET) {
                        chosen = d; // a headset wins — hands-free / discreet
                        break;
                    }
                    if (t == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) speaker = d;
                }
                if (chosen == null) chosen = speaker; // no headset → loudspeaker
                if (chosen != null) audioManager.setCommunicationDevice(chosen);
            } else {
                // Older devices: force loudspeaker so a pocketed phone is audible.
                audioManager.setSpeakerphoneOn(true);
            }
            audioConfigured = true;
        } catch (Exception e) {
            // Never let audio routing crash the keep-alive service.
        }
    }

    private void restoreAudio() {
        if (!audioConfigured || audioManager == null) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                audioManager.clearCommunicationDevice();
            } else {
                audioManager.setSpeakerphoneOn(false);
            }
            audioManager.setMode(previousMode);
        } catch (Exception e) {
            // ignore
        }
        audioConfigured = false;
    }

    @Override
    public void onDestroy() {
        restoreAudio();
        super.onDestroy();
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
