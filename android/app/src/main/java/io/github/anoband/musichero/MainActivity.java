package io.github.anoband.musichero;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // this app's own plugins (npm plugins are registered by Capacitor)
        registerPlugin(UpdaterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
