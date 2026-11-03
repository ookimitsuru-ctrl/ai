package com.aetherlance.game;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.util.Log;
import android.webkit.ConsoleMessage;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Full-screen landscape WebView that runs the single-file web build from the APK's assets.
 *
 * The page is served from https://appassets.androidplatform.net/ (intercepted here, never fetched from the
 * network) so it gets a proper secure origin: localStorage saves, WebAudio and WebGL2 all behave exactly as in a
 * browser. The app needs no network permission.
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + HOST + "/index.html";
    private static final String TAG = "AetherLance";

    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = w.getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            w.setAttributes(lp);
        }
        createWebView();
        hideSystemBars();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void createWebView() {
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) WebView.setWebContentsDebuggingEnabled(true);
        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setHapticFeedbackEnabled(false);
        web.setLongClickable(false);
        web.setOnLongClickListener(v -> true);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);                 // localStorage: settings, high scores, replays
        s.setMediaPlaybackRequiresUserGesture(false); // let WebAudio start without an extra tap
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);                           // ignore the system font size; the game scales itself
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);    // assets come from the APK; never serve a stale copy

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                // automated test reports ("ALTEST {json}", see src/scenes/autotest.ts) go to logcat for a host script
                String t = m.message();
                if (t != null && t.startsWith("ALTEST ")) { Log.i(TAG, t); return true; }
                if (m.messageLevel() == ConsoleMessage.MessageLevel.ERROR) Log.w(TAG, "JSERR " + t + " @" + m.sourceId() + ":" + m.lineNumber());
                return false;
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (!HOST.equals(u.getHost())) return null;
                return serveAsset(u.getPath());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (HOST.equals(u.getHost())) return false;
                // any outside link opens in the browser instead of replacing the game
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                // the renderer was killed (low memory): rebuild the WebView instead of crashing the app
                if (web == view) {
                    ((android.view.ViewGroup) view.getParent()).removeView(view);
                    view.destroy();
                    createWebView();
                }
                return true;
            }
        });
        setContentView(web);
        web.requestFocus();
        web.loadUrl(START_URL + startQuery());
    }

    /**
     * Optional query string from the launch intent, e.g. for the automated device test:
     *   adb shell am start -n com.aetherlance.game/.MainActivity --es query "autotest=60&diff=normal,hard"
     * Only plain parameter characters are accepted.
     */
    private String startQuery() {
        Intent i = getIntent();
        String q = i != null ? i.getStringExtra("query") : null;
        if (q == null || q.isEmpty() || !q.matches("[A-Za-z0-9=&,.\\-]{1,200}")) return "";
        return "?" + q;
    }

    /** Serve /path from assets/www/path. */
    private WebResourceResponse serveAsset(String path) {
        if (path == null || path.isEmpty() || path.equals("/")) path = "/index.html";
        if (path.contains("..")) return notFound();
        try {
            InputStream in = getAssets().open("www" + path);
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-cache");
            return new WebResourceResponse(mimeOf(path), "utf-8", 200, "OK", headers, in);
        } catch (IOException e) {
            return notFound();
        }
    }

    private static WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", new HashMap<>(), null);
    }

    private static String mimeOf(String path) {
        String p = path.toLowerCase(Locale.ROOT);
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "text/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json") || p.endsWith(".webmanifest")) return "application/json";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".txt")) return "text/plain";
        return "application/octet-stream";
    }

    @SuppressWarnings("deprecation")
    private void hideSystemBars() {
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            w.setDecorFitsSystemWindows(false);
            WindowInsetsController c = w.getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            w.getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) { web.onResume(); web.resumeTimers(); }
        hideSystemBars();
    }

    @Override
    protected void onPause() {
        // the page sees visibilitychange → the game pauses itself and suspends audio
        if (web != null) { web.onPause(); web.pauseTimers(); }
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (web != null) { web.destroy(); web = null; }
        super.onDestroy();
    }

    /** Back = the game's cancel / pause key; on the title screen it leaves the app. */
    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        if (web == null) { super.onBackPressed(); return; }
        web.evaluateJavascript(
                "(function(){try{return !!(window.AetherLance&&window.AetherLance.back());}catch(e){return false;}})()",
                value -> { if (!"true".equals(value)) finish(); });
    }
}
