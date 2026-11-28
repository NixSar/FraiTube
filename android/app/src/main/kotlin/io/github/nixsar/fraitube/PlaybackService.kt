package io.github.nixsar.fraitube

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.drawable.Icon
import android.os.Build
import android.os.IBinder

/**
 * Keeps the app running while a video plays with the screen off or another app in front, and shows
 * the video's title with a play or pause button in a notification. The video itself plays in the
 * app's page; the button sends its wish to the app, which passes it to the page.
 */
class PlaybackService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // The service ends through a command of its own. It arrives after the command that started the
        // service, so Android never sees a started service that did not show its notification.
        if (intent?.getBooleanExtra(EXTRA_STOP, false) == true) {
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }
        val title = intent?.getStringExtra(EXTRA_TITLE).orEmpty()
        val playing = intent?.getBooleanExtra(EXTRA_PLAYING, false) ?: false
        val notification = notification(title, playing)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
        return START_NOT_STICKY
    }

    private fun notification(title: String, playing: Boolean): Notification {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, "Playback", NotificationManager.IMPORTANCE_LOW))

        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE
        )
        val toggle = PendingIntent.getBroadcast(
            this, if (playing) 1 else 2,
            Intent(ACTION_SET_PLAYING).setPackage(packageName).putExtra(EXTRA_PLAYING, !playing),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val action = Notification.Action.Builder(
            Icon.createWithResource(this, if (playing) R.drawable.ic_pause else R.drawable.ic_play),
            if (playing) "Pause" else "Play",
            toggle
        ).build()

        return Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_play)
            .setContentTitle(title.ifEmpty { "FraiTube" })
            .setContentText(if (playing) "Playing" else "Paused")
            .setContentIntent(open)
            .setOngoing(playing)
            .setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_TRANSPORT)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .addAction(action)
            .setStyle(Notification.MediaStyle().setShowActionsInCompactView(0))
            .build()
    }

    companion object {
        /** Sent by the notification's button, with EXTRA_PLAYING saying whether the video should play. */
        const val ACTION_SET_PLAYING = "io.github.nixsar.fraitube.SET_PLAYING"
        const val EXTRA_PLAYING = "playing"
        private const val EXTRA_TITLE = "title"
        private const val CHANNEL_ID = "playback"
        private const val NOTIFICATION_ID = 1

        /** Shows the notification for a video, starting the service when it is not running. Call while the app is in front. */
        fun show(context: Context, title: String, playing: Boolean) {
            val intent = Intent(context, PlaybackService::class.java).putExtra(EXTRA_TITLE, title).putExtra(EXTRA_PLAYING, playing)
            context.startForegroundService(intent)
            started = true
        }

        /** Ends the service, when this app started it. */
        fun stop(context: Context) {
            if (!started) {
                return
            }
            started = false
            try {
                context.startService(Intent(context, PlaybackService::class.java).putExtra(EXTRA_STOP, true))
            } catch (error: IllegalStateException) {
                // Android takes no command while the app is out of sight and the service is already gone.
                context.stopService(Intent(context, PlaybackService::class.java))
            }
        }

        private const val EXTRA_STOP = "stop"

        @Volatile
        private var started = false
    }
}
