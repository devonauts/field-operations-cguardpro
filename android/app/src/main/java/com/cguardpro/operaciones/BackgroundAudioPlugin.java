package com.cguardpro.operaciones;

import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * BackgroundAudio (Android) — start/stop the radio keep-alive foreground service.
 * Shares the JS name "BackgroundAudio" with the iOS plugin so the single JS
 * wrapper (src/lib/backgroundAudio.ts) drives both platforms. Registered in
 * MainActivity.onCreate (app-local plugins are not auto-discovered).
 */
@CapacitorPlugin(name = "BackgroundAudio")
public class BackgroundAudioPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        Intent intent = new Intent(getContext(), RadioKeepAliveService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
        JSObject ret = new JSObject();
        ret.put("running", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), RadioKeepAliveService.class));
        JSObject ret = new JSObject();
        ret.put("running", false);
        call.resolve(ret);
    }
}
