package com.deadrecoil.game;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.browser.customtabs.CustomTabsIntent;

import org.json.JSONObject;

public class MainActivity extends Activity {
    private static final String AUTH_SCHEME = "untitledzombie";
    private WebView webView;
    private UpdateManager updateManager;
    // An OAuth / e-mail deep link that arrived before the page was ready to receive it.
    private volatile String pendingAuthUrl;

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED, WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED);
        immersive();

        webView = new WebView(this);
        webView.setBackgroundColor(0xFF05080B);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setSupportZoom(false);
        s.setLoadWithOverviewMode(false);
        s.setUseWideViewPort(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);

        webView.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String url) { deliverAuthUrl(); }
        });
        pendingAuthUrl = authUrlFrom(getIntent());
        webView.setWebChromeClient(new WebChromeClient());
        webView.addJavascriptInterface(new NativeBridge(), "DeadRecoilNative");
        setContentView(webView);
        webView.loadUrl("file:///android_asset/index.html?native=1&platform=android");
        updateManager = new UpdateManager(this);
        updateManager.check();
    }

    // untitledzombie://auth/callback?code=… — Google OAuth, e-mail confirmation and password reset
    // all come back here; the game exchanges the PKCE code for a session.
    private String authUrlFrom(Intent intent) {
        if (intent == null || intent.getData() == null) return null;
        Uri data = intent.getData();
        if (!AUTH_SCHEME.equals(data.getScheme()) || !"auth".equals(data.getHost())) return null;
        return data.toString();
    }

    private void deliverAuthUrl() {
        final String url = pendingAuthUrl;
        if (url == null || webView == null) return;
        pendingAuthUrl = null;
        webView.evaluateJavascript("window.DeadRecoilAuthCallback && window.DeadRecoilAuthCallback(" + JSONObject.quote(url) + ")", null);
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String url = authUrlFrom(intent);
        if (url != null) {
            pendingAuthUrl = url;
            deliverAuthUrl();
        }
    }

    private void immersive() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY |
                View.SYSTEM_UI_FLAG_FULLSCREEN |
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION |
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    @Override protected void onResume() { super.onResume(); immersive(); if (webView != null) webView.onResume(); if (updateManager != null) updateManager.resumeInstall(); }
    @Override protected void onPause() { if (webView != null) { webView.evaluateJavascript("document.dispatchEvent(new Event('deadrecoil-native-pause'));", null); webView.onPause(); } super.onPause(); }
    @Override public void onBackPressed() {
        if (webView != null) webView.evaluateJavascript("document.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape',key:'Escape'}));", null);
        else super.onBackPressed();
    }

    public class NativeBridge {
        @JavascriptInterface public void quit() { runOnUiThread(() -> finishAndRemoveTask()); }

        // Official Google sign-in page in a Chrome Custom Tab (never inside the WebView).
        @JavascriptInterface public void openAuthUrl(String url) {
            if (url == null || !url.startsWith("https://")) return;
            runOnUiThread(() -> {
                try {
                    CustomTabsIntent tab = new CustomTabsIntent.Builder().setShowTitle(true).build();
                    tab.launchUrl(MainActivity.this, Uri.parse(url));
                } catch (Exception e) {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                }
            });
        }

        @JavascriptInterface public String takePendingAuthUrl() {
            String url = pendingAuthUrl;
            pendingAuthUrl = null;
            return url;
        }
    }
}
