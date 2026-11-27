package io.github.nixsar.fraitube

import android.Manifest
import android.app.Activity
import android.app.PictureInPictureParams
import android.content.Context
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.util.Rational
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.widget.FrameLayout

/**
 * A web view that keeps its page running while it is not on screen, for as long as a video plays:
 * with the screen off, behind another app, or shrunk into picture-in-picture.
 */
internal class BackgroundWebView(context: Context) : WebView(context) {
    var keepRunning = false

    override fun onWindowVisibilityChanged(visibility: Int) {
        super.onWindowVisibilityChanged(if (keepRunning) View.VISIBLE else visibility)
    }
}

/**
 * What the phone does around a playing video: fullscreen with the fitting rotation, a screen that
 * stays awake, picture-in-picture, and the notification that keeps playback going out of sight.
 * The page reports the video's state; this class never plays anything itself.
 */
internal class PlayerWindow(
    private val activity: Activity,
    private val container: FrameLayout,
    private val webView: BackgroundWebView
) {
    private var hasVideo = false
    private var playing = false
    private var width = 16
    private var height = 9
    private var title = ""
    private var askedForNotifications = false

    private var fullscreenView: View? = null
    private var fullscreenCallback: WebChromeClient.CustomViewCallback? = null

    /** True while the video fills the screen or the app is shrunk into picture-in-picture: the page then needs no room kept for the system bars. */
    val coversScreen: Boolean
        get() = fullscreenView != null || activity.isInPictureInPictureMode

    /** Handles the page's wish to show one of its parts fullscreen. */
    val chromeClient = object : WebChromeClient() {
        override fun onShowCustomView(view: View, callback: CustomViewCallback) {
            if (fullscreenView != null) {
                callback.onCustomViewHidden()
                return
            }
            fullscreenView = view
            fullscreenCallback = callback
            view.setBackgroundColor(Color.BLACK)
            container.addView(view, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
            activity.window.insetsController?.let {
                it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                it.hide(WindowInsets.Type.systemBars())
            }
            applyRotation()
            container.requestApplyInsets()
        }

        override fun onHideCustomView() {
            val view = fullscreenView ?: return
            container.removeView(view)
            fullscreenView = null
            fullscreenCallback = null
            activity.window.insetsController?.show(WindowInsets.Type.systemBars())
            applyRotation()
            container.requestApplyInsets()
        }
    }

    /** The page's report: whether it shows a video, whether that plays, its picture's shape and its title. Call on the main thread. */
    fun onPlayerState(hasVideo: Boolean, playing: Boolean, width: Int, height: Int, title: String) {
        this.hasVideo = hasVideo
        this.playing = hasVideo && playing
        if (width > 0 && height > 0) {
            this.width = width
            this.height = height
        }
        this.title = title

        webView.keepRunning = this.playing
        if (this.playing) {
            activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
            activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
        applyRotation()
        activity.setPictureInPictureParams(pictureInPictureParams())

        if (!hasVideo) {
            PlaybackService.stop(activity)
        } else {
            if (this.playing) {
                askForNotificationsOnce()
            }
            try {
                PlaybackService.show(activity, title, this.playing)
            } catch (error: IllegalStateException) {
                // Android refuses to start the service while the app is out of sight; the next report in sight starts it.
            }
        }
    }

    /** Leaves fullscreen. True when the video was fullscreen. */
    fun leaveFullscreen(): Boolean {
        if (fullscreenView == null) {
            return false
        }
        webView.evaluateJavascript("document.exitFullscreen()", null)
        return true
    }

    /** Shrinks the app into a small floating video. True when it did. */
    fun enterPictureInPicture(): Boolean = hasVideo && activity.enterPictureInPictureMode(pictureInPictureParams())

    /** The user leaves the app: a playing video carries on in picture-in-picture. Android 12 and newer do this by themselves. */
    fun onUserLeaveHint() {
        if (playing && Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            enterPictureInPicture()
        }
    }

    /** Tells the page whether only the video should show. */
    fun onPictureInPictureChanged(inPictureInPicture: Boolean) {
        webView.evaluateJavascript("window.fraitubeAndroid && window.fraitubeAndroid.setPictureInPicture($inPictureInPicture)", null)
        container.requestApplyInsets()
    }

    /** The notification's button: asks the page to play or pause. */
    fun setPlaying(play: Boolean) {
        webView.evaluateJavascript("window.fraitubeAndroid && window.fraitubeAndroid.setPlaying($play)", null)
    }

    fun release() {
        PlaybackService.stop(activity)
    }

    /** A wide video turns the screen to landscape while fullscreen; a tall one, and everything else, follows how the phone is held. */
    private fun applyRotation() {
        activity.requestedOrientation = if (fullscreenView != null && width > height) {
            ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        } else {
            ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        }
    }

    private fun pictureInPictureParams(): PictureInPictureParams {
        // Android accepts shapes between about 1:2.39 and 2.39:1.
        val ratio = (width.toDouble() / height).coerceIn(0.42, 2.39)
        val builder = PictureInPictureParams.Builder().setAspectRatio(Rational((ratio * 1000).toInt(), 1000))
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            builder.setAutoEnterEnabled(playing)
        }
        return builder.build()
    }

    /** From Android 13 on, showing the notification needs the user's yes; playback goes on either way. */
    private fun askForNotificationsOnce() {
        if (askedForNotifications || Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return
        }
        askedForNotifications = true
        if (activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            activity.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), NOTIFICATIONS_REQUEST)
        }
    }

    private companion object {
        const val NOTIFICATIONS_REQUEST = 4201
    }
}
