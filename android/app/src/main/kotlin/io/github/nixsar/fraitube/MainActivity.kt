package io.github.nixsar.fraitube

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.ActivityNotFoundException
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ApplicationInfo
import android.content.res.Configuration
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.view.WindowInsets
import android.webkit.RenderProcessGoneDetail
import android.window.OnBackInvokedDispatcher
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import java.io.IOException
import org.json.JSONArray
import org.json.JSONObject

/**
 * The app's only screen: a web view that shows the pages packed inside the app. The pages reach
 * YouTube through [NativeRequests], and YouTube's own scripts run in the [HiddenPage].
 */
class MainActivity : Activity() {
    private lateinit var webView: BackgroundWebView
    private lateinit var hidden: HiddenPage
    private lateinit var requests: NativeRequests
    private lateinit var userAgent: String
    private lateinit var database: AppDatabase
    private lateinit var sponsorRequests: NativeRequests
    private lateinit var feedFile: FeedFile
    private lateinit var files: OneTimeFiles
    private lateinit var fileChooser: FileChooser
    private lateinit var playerWindow: PlayerWindow
    private lateinit var syncPort: SyncPort

    @Volatile
    private var pendingLink: String? = null

    /** When the app itself last opened another screen, in uptime milliseconds. */
    private var openedSomethingAt = 0L

    /** True once Android ended the page's process and the screen is being built anew. */
    private var pageLost = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // No web view of the app keeps cookies, so nothing ties one request to the next.
        CookieManager.getInstance().setAcceptCookie(false)

        // Only the test build lets a computer look inside its pages.
        if (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) {
            WebView.setWebContentsDebuggingEnabled(true)
        }

        userAgent = desktopUserAgent(this)
        requests =NativeRequests(userAgent, ::isYoutubeAddress)
        hidden = HiddenPage(this, userAgent)
        database = AppDatabase(this)
        // SponsorBlock's server is only ever asked to list segments.
        sponsorRequests = NativeRequests(userAgent, ::isSegmentsAddress, methods = setOf("GET"))
        feedFile = FeedFile(this)
        // Files left in the cache by an import, backup or upload that never finished are removed.
        if (savedInstanceState == null) {
            cacheDir.listFiles()?.forEach { if (it.isFile) it.delete() }
        }
        files = OneTimeFiles(cacheDir)
        fileChooser = FileChooser(this, files, ::deliver)
        syncPort = SyncPort(this, ::deliver)

        // The link the app was opened with is handed to the page once, not again when Android rebuilds the screen.
        if (savedInstanceState == null) {
            pendingLink = linkOf(intent)
        }

        webView = BackgroundWebView(this)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.mediaPlaybackRequiresUserGesture = false
        // The page keeps its size: it lays itself out for the screen, also after picture-in-picture.
        webView.settings.setSupportZoom(false)
        webView.settings.allowFileAccess = false
        webView.settings.allowContentAccess = false
        webView.addJavascriptInterface(Bridge(), "FraiTubeNative")
        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                if (request.url.host != APP_HOST) {
                    return null
                }
                val path = request.url.path ?: "/"
                return when {
                    path.startsWith(NET_PATH) -> requests.answer(path.removePrefix(NET_PATH))
                    path.startsWith(SPONSOR_PATH) -> sponsorRequests.answer(path.removePrefix(SPONSOR_PATH))
                    path.startsWith(FILE_PATH) -> files.answer(path.removePrefix(FILE_PATH))
                    else -> assetResponse(this@MainActivity, path)
                }
            }

            // The web view only ever shows the app's own page; links to outside sites open in the browser.
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.host == APP_HOST) {
                    return false
                }
                if (request.url.scheme == "https" || request.url.scheme == "http") {
                    try {
                        startActivity(Intent(Intent.ACTION_VIEW, request.url))
                    } catch (error: ActivityNotFoundException) {
                        // No app on the phone opens web addresses.
                    }
                }
                return true
            }

            // Android ended the process that draws the page, for lack of memory or after a crash in it.
            // The screen is built anew; left alone, Android would close the whole app.
            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                rebuildAfterPageLoss()
                return true
            }
        }

        // From Android 15 on an app draws under the status and navigation bars, so the page is kept clear of them and of the keyboard.
        val container = FrameLayout(this)
        container.setBackgroundColor(Color.BLACK)
        container.addView(webView, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        playerWindow = PlayerWindow(this, container, webView)
        webView.webChromeClient = playerWindow.chromeClient
        container.setOnApplyWindowInsetsListener { view, insets ->
            if (playerWindow.coversScreen) {
                view.setPadding(0, 0, 0, 0)
            } else {
                val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout() or WindowInsets.Type.ime())
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            }
            insets
        }
        setContentView(container)

        // From Android 13 on, Back reaches the app through this handler; newer versions no longer call onBackPressed.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) {
                if (!goBack()) {
                    // On the first page Back leaves the app, which stays open behind the home screen.
                    moveTaskToBack(true)
                }
            }
        }

        // The playback notification's button asks through this for play or pause.
        // Only a sender holding the app's own permission is heard, so no other app can play or pause the video.
        val filter = IntentFilter(PlaybackService.ACTION_SET_PLAYING)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(playbackReceiver, filter, INTERNAL_PERMISSION, null, RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            registerReceiver(playbackReceiver, filter, INTERNAL_PERMISSION, null)
        }

        if (savedInstanceState == null) {
            webView.loadUrl(START_PAGE)
        } else {
            webView.restoreState(savedInstanceState)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    /** Back leaves fullscreen first, then goes back a page. False on the first page. */
    private fun goBack(): Boolean {
        if (playerWindow.leaveFullscreen()) {
            return true
        }
        if (webView.canGoBack()) {
            webView.goBack()
            return true
        }
        return false
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (!goBack()) {
            @Suppress("DEPRECATION")
            super.onBackPressed()
        }
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        playerWindow.onUserLeaveHint(SystemClock.uptimeMillis() - openedSomethingAt < OPENED_BY_APP_MS)
    }

    /** Every picker, permission question and outside link the app opens passes here. */
    override fun startActivityForResult(intent: Intent, requestCode: Int, options: Bundle?) {
        openedSomethingAt = SystemClock.uptimeMillis()
        super.startActivityForResult(intent, requestCode, options)
    }

    override fun onResume() {
        super.onResume()
        playerWindow.onResume()
    }

    /** Builds the screen anew after Android ended the process that draws the page. */
    private fun rebuildAfterPageLoss() {
        if (pageLost) {
            return
        }
        pageLost = true
        (webView.parent as? FrameLayout)?.removeView(webView)
        webView.destroy()
        hidden.destroy()
        recreate()
    }

    override fun onPictureInPictureModeChanged(isInPictureInPictureMode: Boolean, newConfig: Configuration) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        playerWindow.onPictureInPictureChanged(isInPictureInPictureMode)
    }

    /** A YouTube link opened or shared while the app runs goes straight to the page. */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        val link = linkOf(intent) ?: return
        webView.evaluateJavascript("window.fraitubeAndroid && window.fraitubeAndroid.openLink(${JSONObject.quote(link)})", null)
    }

    /** The link an intent carries: the address it opens, or the text shared with it. */
    private fun linkOf(intent: Intent?): String? = when (intent?.action) {
        Intent.ACTION_VIEW -> intent.dataString
        Intent.ACTION_SEND -> intent.getStringExtra(Intent.EXTRA_TEXT)
        else -> null
    }

    private val playbackReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            playerWindow.setPlaying(intent.getBooleanExtra(PlaybackService.EXTRA_PLAYING, false))
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (!fileChooser.onResult(requestCode, resultCode, data) && !syncPort.onResult(requestCode, resultCode, data)) {
            @Suppress("DEPRECATION")
            super.onActivityResult(requestCode, resultCode, data)
        }
    }

    /** Hands the page the answer to a call it made. Call on the main thread. */
    private fun deliver(callId: String, ok: Boolean, value: String) {
        webView.evaluateJavascript(
            "window.fraitubeNativeResult(${JSONObject.quote(callId)}, $ok, ${JSONObject.quote(value)})",
            null
        )
    }

    override fun onDestroy() {
        unregisterReceiver(playbackReceiver)
        playerWindow.release()
        if (!pageLost) {
            hidden.destroy()
            webView.destroy()
        }
        database.close()
        super.onDestroy()
    }

    private inner class Bridge {
        @JavascriptInterface
        fun request(details: String, bodyBase64: String): String = requests.register(details, bodyBase64)

        /** The page's report about its video: whether there is one, whether it plays, its picture's shape and its title. */
        @JavascriptInterface
        fun playerState(hasVideo: Boolean, playing: Boolean, width: Int, height: Int, title: String) {
            runOnUiThread { playerWindow.onPlayerState(hasVideo, playing, width, height, title) }
        }

        /** Shrinks the app into a small floating video. */
        @JavascriptInterface
        fun enterPictureInPicture() {
            runOnUiThread { playerWindow.enterPictureInPicture() }
        }

        /** The YouTube link the app was opened with, handed out once, or an empty text. */
        @JavascriptInterface
        fun takeLink(): String {
            val link = pendingLink.orEmpty()
            pendingLink = null
            return link
        }

        @JavascriptInterface
        fun db(sql: String, params: String, wantRows: Boolean): String = database.run(sql, params, wantRows)

        @JavascriptInterface
        fun sponsorRequest(details: String, bodyBase64: String): String = sponsorRequests.register(details, bodyBase64)

        @JavascriptInterface
        fun readFeed(): String = feedFile.read()

        @JavascriptInterface
        fun writeFeed(text: String) = feedFile.write(text)

        @JavascriptInterface
        fun userAgent(): String = userAgent

        @JavascriptInterface
        fun version(): String = packageManager.getPackageInfo(packageName, 0).versionName ?: ""

        @JavascriptInterface
        fun run(callId: String, kind: String, payload: String) {
            hidden.run(kind, payload) { ok, value -> deliver(callId, ok, value) }
        }

        @JavascriptInterface
        fun chooseFile(callId: String, kind: String, sql: String, params: String) {
            runOnUiThread { fileChooser.choose(callId, kind, sql, params) }
        }

        @JavascriptInterface
        fun saveFile(callId: String, uploadId: String, name: String, mimeType: String) {
            runOnUiThread { fileChooser.save(callId, uploadId, name, mimeType) }
        }

        @JavascriptInterface
        fun uploadStart(): String = files.startUpload()

        @JavascriptInterface
        fun uploadChunk(uploadId: String, base64: String) = files.append(uploadId, base64)

        /** A consistent copy of the database for a backup: JSON with the ID it is fetched with, or the error. */
        @JavascriptInterface
        fun backupCopy(): String = try {
            val copy = files.newFile("backup")
            database.copyTo(copy)
            JSONObject().put("id", files.offer(copy)).toString()
        } catch (error: IOException) {
            JSONObject().put("error", error.message ?: "The database could not be copied").toString()
        }

        /** Puts the database the page sent in the place of this phone's. Answers with an empty text, or the error. */
        @JavascriptInterface
        fun restoreDatabase(uploadId: String, keepTables: String, clearTables: String): String {
            val restored = files.takeUpload(uploadId) ?: return "The backup could not be restored"
            return try {
                database.restore(restored, names(keepTables), names(clearTables))
                ""
            } catch (error: IOException) {
                error.message ?: "The backup could not be restored"
            } catch (error: IllegalArgumentException) {
                error.message ?: "The backup could not be restored"
            } catch (error: RuntimeException) {
                // A file made to look like a database without being a sound one.
                "The database in this backup is damaged"
            } finally {
                restored.delete()
            }
        }

        private fun names(json: String): List<String> {
            val array = JSONArray(json)
            return List(array.length()) { array.getString(it) }
        }

        /** One file call of the sync engine on the app's private sync folder: JSON with the value, or the error. */
        @JavascriptInterface
        fun syncFile(op: String, path: String, arg: String): String = syncPort.files.run(op, path, arg)

        @JavascriptInterface
        fun chooseSyncFolder(callId: String) {
            runOnUiThread { syncPort.chooseFolder(callId) }
        }

        /** Saves the WebDAV password for an address; an empty password removes it. Answers with an empty text, or the error. */
        @JavascriptInterface
        fun setSyncPassword(address: String, password: String): String = syncPort.setPassword(address, password)

        /** Whether a password is saved for this very address. */
        @JavascriptInterface
        fun hasSyncPassword(address: String): Boolean = syncPort.hasPassword(address)

        /** Copies sync files in or out of the place the phone syncs through. */
        @JavascriptInterface
        fun syncTransfer(callId: String, direction: String, details: String) = syncPort.transfer(callId, direction, details)

        /** Asks a yes or no question in a dialog. The answer is "yes", or an empty text. */
        @JavascriptInterface
        fun confirm(callId: String, title: String, message: String, yesLabel: String) {
            runOnUiThread {
                AlertDialog.Builder(this@MainActivity)
                    .setTitle(title)
                    .setMessage(message)
                    .setPositiveButton(yesLabel) { _, _ -> deliver(callId, true, "yes") }
                    .setNegativeButton(android.R.string.cancel) { _, _ -> deliver(callId, true, "") }
                    .setOnCancelListener { deliver(callId, true, "") }
                    .show()
            }
        }

        /** Loads the app's page anew, for example over a restored database. */
        @JavascriptInterface
        fun reload() {
            runOnUiThread { webView.loadUrl(START_PAGE) }
        }
    }

    private companion object {
        /** The address the packed pages are served under. It exists only inside the app. */
        const val APP_HOST = "app.fraitube.invalid"
        const val NET_PATH = "/_net/"
        const val SPONSOR_PATH = "/_sb/"
        const val FILE_PATH = "/_file/"
        const val START_PAGE = "https://$APP_HOST/index.html"

        /** A permission only this app holds, asked of whoever sends it a play or pause wish. */
        const val INTERNAL_PERMISSION = "io.github.nixsar.fraitube.permission.INTERNAL"

        /** Leaving the app this soon after it opened another screen itself is that screen showing. */
        const val OPENED_BY_APP_MS = 1_500L
    }
}
