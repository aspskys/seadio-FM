package com.seadio.fm;

import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SeadioMedia")
public class SeadioMediaPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        android.content.Context ctx = getContext();
        Intent intent = new Intent(ctx, SeadioMediaService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(intent);
        } else {
            ctx.startService(intent);
        }
        JSObject r = new JSObject();
        r.put("started", true);
        call.resolve(r);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), SeadioMediaService.class));
        JSObject r = new JSObject();
        r.put("stopped", true);
        call.resolve(r);
    }
}
