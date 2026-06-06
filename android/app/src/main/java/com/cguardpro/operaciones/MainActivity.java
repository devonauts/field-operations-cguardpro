package com.cguardpro.operaciones;

import android.webkit.PermissionRequest;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {

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
