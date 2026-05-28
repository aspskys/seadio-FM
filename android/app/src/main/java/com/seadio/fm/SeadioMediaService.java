package com.seadio.fm;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;

public class SeadioMediaService extends Service {

    public static final int NOTIF_ID = 7301;
    public static final String CHANNEL_ID = "seadio_playback";

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm =
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm.getNotificationChannel(CHANNEL_ID) == null) {
                NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID,
                    "Seadio playback",
                    NotificationManager.IMPORTANCE_LOW
                );
                ch.setShowBadge(false);
                nm.createNotificationChannel(ch);
            }
        }

        Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        int pendingFlag = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
            ? PendingIntent.FLAG_IMMUTABLE : 0;
        PendingIntent tap = PendingIntent.getActivity(this, 0, launchIntent, pendingFlag);

        Notification notif = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle("Seadio FM")
            .setContentText("Playing in background")
            .setOngoing(true)
            .setContentIntent(tap)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();

        startForeground(NOTIF_ID, notif);
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            //noinspection deprecation
            stopForeground(true);
        }
        super.onDestroy();
    }
}
