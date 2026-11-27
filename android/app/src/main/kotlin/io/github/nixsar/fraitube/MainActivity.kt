package io.github.nixsar.fraitube

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.WindowInsets
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
    private lateinit var webView: WebView
    private lateinit var hidden: HiddenPage
    private lateinit var requests: NativeRequests
    private lateinit var userAgent: String
    private lateinit var database: AppDatabase
    private lateinit var sponsorRequests: NativeRequests
    private lateinit var feedFile: FeedFile
    private lateinit var files: OneTimeFiles
    private lateinit var fileChooser: FileChooser

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // No web view of the app keeps cookies, so nothing ties one request to the next.
        CookieManager.getInstance().setAcceptCookie(false)

        userAgent = desktopUserAgent(this)
        requests = NativeRequests(userAgent, ::isYoutubeAddress)
        hidden = HiddenPage(this, userAgent)
        database = AppDatabase(this)
        // SponsorBlock's server is only ever asked to list segments.
        sponsorRequests = NativeRequests(userAgent, ::isSegmentsAddress, methods = setOf("GET"))
        feedFile = FeedFile(this)
        files = OneTimeFiles(cacheDir)
        fileChooser = FileChooser(this, files, ::deliver)

        webView = WebView(this)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.mediaPlaybackRequiresUserGesture = false
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
        }

        // From Android 15 on an app draws under the status and navigation bars, so the page is kept clear of them and of the keyboard.
        val container = FrameLayout(this)
        container.setBackgroundColor(Color.BLACK)
        container.addView(webView, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        container.setOnApplyWindowInsetsListener { view, insets ->
            val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout() or WindowInsets.Type.ime())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
        setContentView(container)

        // From Android 13 on, Back reaches the app through this handler; newer versions no longer call onBackPressed.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    // On the first page Back leaves the app, which stays open behind the home screen.
                    moveTaskToBack(true)
                }
            }
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

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            @Suppress("DEPRECATION")
            super.onBackPressed()
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (!fileChooser.onResult(requestCode, resultCode, data)) {
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
        hidden.destroy()
        webView.destroy()
        database.close()
        super.onDestroy()
    }

    private inner class Bridge {
        @JavascriptInterface
        fun request(details: String, bodyBase64: String): String = requests.register(details, bodyBase64)

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
            }
        }

        private fun names(json: String): List<String> {
            val array = JSONArray(json)
            return List(array.length()) { array.getString(it) }
        }

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
    }
}
