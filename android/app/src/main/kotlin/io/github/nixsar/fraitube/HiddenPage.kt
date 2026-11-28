package io.github.nixsar.fraitube

import android.annotation.SuppressLint
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import java.net.URL
import org.json.JSONObject

/**
 * A web view that is never shown. Its page has the address https://www.youtube.com/ and holds nothing
 * of the app: YouTube's playback token is made there, and YouTube's player script runs there. The
 * page is loaded anew for every task, and every request it makes goes through [NativeRequests].
 */
internal class HiddenPage(private val context: Context, userAgent: String) {
    private class Task(val kind: String, val payload: String, val done: (Boolean, String) -> Unit) {
        /** Handed to the page with the task, and expected back with its answer. */
        val id: String = java.util.UUID.randomUUID().toString()
        var taken = false
    }

    private val main = Handler(Looper.getMainLooper())
    private val queue = ArrayDeque<Task>()

    @Volatile
    private var current: Task? = null

    private val requests = NativeRequests(userAgent, ::isAllowed, extraHeaders = { url ->
        if (url.host == YOUTUBE_HOST) YOUTUBE_HEADERS else emptyMap()
    })

    private val html: String by lazy {
        context.assets.open("$WEB_ASSETS/hidden.html").bufferedReader().use { it.readText() }.replace("\"./", "\"$ASSET_PATH")
    }

    private val webView: WebView by lazy { createWebView(userAgent) }

    /** Runs a task in a freshly loaded page, after the tasks already waiting. The answer arrives on the main thread. */
    fun run(kind: String, payload: String, done: (Boolean, String) -> Unit) {
        main.post {
            queue.addLast(Task(kind, payload, done))
            next()
        }
    }

    fun destroy() {
        main.removeCallbacksAndMessages(null)
        current = null
        queue.clear()
        webView.destroy()
    }

    private fun next() {
        if (current != null) {
            return
        }
        val task = queue.removeFirstOrNull()
        if (task == null) {
            webView.loadUrl("about:blank")
            return
        }
        current = task
        webView.loadDataWithBaseURL(BASE_URL, html, "text/html", "utf-8", null)
        main.postDelayed({ finish(task, false, "The hidden page did not answer in time") }, TIMEOUT_MS)
    }

    private fun finish(task: Task, ok: Boolean, value: String) {
        if (current !== task) {
            return
        }
        current = null
        task.done(ok, value)
        next()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun createWebView(userAgent: String): WebView {
        val view = WebView(context)
        view.settings.javaScriptEnabled = true
        view.settings.userAgentString = userAgent
        view.settings.allowFileAccess = false
        view.settings.allowContentAccess = false
        // The size of a desktop screen, as on the desktop app.
        view.layout(0, 0, 1920, 1080)
        view.addJavascriptInterface(Bridge(), "FraiTubeHidden")
        view.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                val path = request.url.path ?: ""
                return when {
                    // The page itself, which is handed to the web view as text.
                    request.isForMainFrame && request.url.scheme != "https" && request.url.scheme != "http" -> null
                    request.url.host != YOUTUBE_HOST -> emptyResponse(403, "Blocked")
                    path.startsWith(NET_PATH) -> requests.answer(path.removePrefix(NET_PATH))
                    path.startsWith(ASSET_PATH) -> assetResponse(context, path.removePrefix(ASSET_PATH))
                    else -> emptyResponse(403, "Blocked")
                }
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = true

            // Android ended the process that runs the page. The task in hand fails; the app's screen
            // rebuilds everything. Left alone, Android would close the whole app.
            override fun onRenderProcessGone(view: WebView, detail: android.webkit.RenderProcessGoneDetail): Boolean {
                current?.let { task -> main.post { finish(task, false, "The hidden page was closed by Android") } }
                return true
            }
        }
        return view
    }

    private inner class Bridge {
        @JavascriptInterface
        fun takeTask(): String {
            val task = current ?: return ""
            synchronized(task) {
                if (task.taken) {
                    return ""
                }
                task.taken = true
            }
            return JSONObject().put("id", task.id).put("kind", task.kind).put("payload", task.payload).toString()
        }

        /** The answer of the task with this ID. An answer that arrives after its task ended is dropped. */
        @JavascriptInterface
        fun done(id: String, ok: Boolean, value: String) {
            val task = current ?: return
            if (task.id == id) {
                main.post { finish(task, ok, value) }
            }
        }

        @JavascriptInterface
        fun request(details: String, bodyBase64: String): String = requests.register(details, bodyBase64)
    }

    private companion object {
        const val YOUTUBE_HOST = "www.youtube.com"
        const val BASE_URL = "https://$YOUTUBE_HOST/"
        const val ASSET_PATH = "/_fraitube/"
        const val NET_PATH = "/_fraitube/net/"
        const val TIMEOUT_MS = 60_000L

        /** What youtube.com's own pages send with their requests. */
        val YOUTUBE_HEADERS = mapOf(
            "Origin" to "https://$YOUTUBE_HOST",
            "Referer" to BASE_URL,
            "X-Youtube-Bootstrap-Logged-In" to "false"
        )

        /** YouTube itself, the script of the token maker, and the service that signs the token. */
        fun isAllowed(url: URL): Boolean =
            url.protocol == "https" && url.port == -1 && url.userInfo == null && (
                url.host == YOUTUBE_HOST ||
                    url.host == "www.google.com" && url.path.startsWith("/js/") ||
                    url.host == "jnn-pa.googleapis.com"
                )
    }
}
