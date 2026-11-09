package com.seventhday.panelve;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Pantalla dividida: a la izquierda el panel de prompts (assets/panel.html),
 * a la derecha VideoExpress. El panel inserta texto en la casilla que el
 * usuario tocó por última vez dentro de VideoExpress (assets/helper.js).
 */
public class MainActivity extends Activity {

    static final String DEFAULT_URL = "https://app.videoexpress.ai";
    static final String DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            + "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
    static final int FILE_REQ = 7;

    WebView panel;
    WebView ve;
    SharedPreferences prefs;
    String helper = "";
    String mobileUA = "";
    boolean collapsed = false;
    boolean desktop = true;
    ValueCallback<Uri[]> fileCb;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN,
                WindowManager.LayoutParams.FLAG_FULLSCREEN);

        prefs = getSharedPreferences("panel", MODE_PRIVATE);
        helper = readAsset("helper.js");

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.HORIZONTAL);
        root.setBackgroundColor(0xFF14161C);

        panel = new WebView(this);
        ve = new WebView(this);
        View divider = new View(this);
        divider.setBackgroundColor(0xFF2A2F3A);

        root.addView(panel, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 2f));
        root.addView(divider, new LinearLayout.LayoutParams(dp(1), LinearLayout.LayoutParams.MATCH_PARENT));
        root.addView(ve, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 8f));
        setContentView(root);

        setup(panel);
        setup(ve);
        mobileUA = ve.getSettings().getUserAgentString();

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(ve, true);

        panel.addJavascriptInterface(new PanelBridge(), "Android");
        ve.addJavascriptInterface(new VeBridge(), "PVE");

        panel.setWebViewClient(new WebViewClient());
        ve.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                view.evaluateJavascript(helper, null);
            }
        });

        JSONObject cfg = cfg();
        desktop = !"0".equals(cfg.optString("desktop", "1"));
        applyDesktop();
        collapsed = prefs.getBoolean("col", false);
        applyWidth();

        panel.loadUrl("file:///android_asset/panel.html");
        ve.loadUrl(cfg.optString("veUrl", DEFAULT_URL));
    }

    void setup(WebView w) {
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        w.setWebChromeClient(new Chrome());
    }

    JSONObject cfg() {
        try {
            String s = prefs.getString("k_cfg", null);
            return s == null ? new JSONObject() : new JSONObject(s);
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    int panelTenths() {
        int w = 2;
        try {
            w = Integer.parseInt(cfg().optString("width", "2"));
        } catch (Exception ignored) {
        }
        if (w < 2) w = 2;
        if (w > 5) w = 5;
        return w;
    }

    void applyWidth() {
        int w = panelTenths();
        LinearLayout.LayoutParams lp = (LinearLayout.LayoutParams) panel.getLayoutParams();
        LinearLayout.LayoutParams lv = (LinearLayout.LayoutParams) ve.getLayoutParams();
        if (collapsed) {
            lp.width = dp(52);
            lp.weight = 0f;
            lv.weight = 1f;
        } else {
            lp.width = 0;
            lp.weight = w;
            lv.weight = 10 - w;
        }
        panel.setLayoutParams(lp);
        ve.setLayoutParams(lv);
    }

    void applyDesktop() {
        WebSettings s = ve.getSettings();
        s.setUserAgentString(desktop ? DESKTOP_UA : mobileUA);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
    }

    int dp(int v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v,
                getResources().getDisplayMetrics());
    }

    String readAsset(String name) {
        try (InputStream in = getAssets().open(name)) {
            return new String(readAll(in), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return "";
        }
    }

    static byte[] readAll(InputStream in) throws java.io.IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        return out.toByteArray();
    }

    void callPanel(final String js) {
        runOnUiThread(() -> panel.evaluateJavascript(js, null));
    }

    void runVe(final String call) {
        runOnUiThread(() -> ve.evaluateJavascript(helper + "\n;" + call,
                r -> panel.evaluateJavascript("onInsertResult(" + (r == null ? "null" : r) + ")", null)));
    }

    /** Métodos que el panel puede llamar como Android.xxx() */
    class PanelBridge {
        @JavascriptInterface
        public void insert(String text) {
            runVe("window.__pve.insert(" + JSONObject.quote(text) + ")");
        }

        @JavascriptInterface
        public void insertSelect(String text) {
            runVe("window.__pve.insertSelect(" + JSONObject.quote(text) + ")");
        }

        @JavascriptInterface
        public void configVoice(String tipo, String idioma, String nombre) {
            runVe("window.__pve.configVoice(" + JSONObject.quote(tipo) + "," + JSONObject.quote(idioma) + ","
                    + JSONObject.quote(nombre) + ")");
        }

        @JavascriptInterface
        public void undo() {
            runVe("window.__pve.undo()");
        }

        @JavascriptInterface
        public void save(String key, String value) {
            prefs.edit().putString("k_" + key, value).apply();
        }

        @JavascriptInterface
        public String load(String key) {
            return prefs.getString("k_" + key, null);
        }

        @JavascriptInterface
        public boolean isCollapsed() {
            return collapsed;
        }

        @JavascriptInterface
        public void setCollapsed(final boolean c) {
            runOnUiThread(() -> {
                collapsed = c;
                prefs.edit().putBoolean("col", c).apply();
                applyWidth();
            });
        }

        @JavascriptInterface
        public void applyConfig() {
            runOnUiThread(() -> {
                JSONObject c = cfg();
                boolean d = !"0".equals(c.optString("desktop", "1"));
                applyWidth();
                if (d != desktop) {
                    desktop = d;
                    applyDesktop();
                    ve.reload();
                }
            });
        }

        @JavascriptInterface
        public void openVe(final String url) {
            runOnUiThread(() -> ve.loadUrl(url));
        }

        @JavascriptInterface
        public void reloadVe() {
            runOnUiThread(() -> ve.reload());
        }

        @JavascriptInterface
        public void toast(final String msg) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show());
        }

        @JavascriptInterface
        public void fetch(final String url, final String cb) {
            new Thread(() -> {
                boolean ok = false;
                String body;
                HttpURLConnection c = null;
                try {
                    c = (HttpURLConnection) new URL(url).openConnection();
                    c.setConnectTimeout(15000);
                    c.setReadTimeout(20000);
                    c.setUseCaches(false);
                    c.setRequestProperty("Cache-Control", "no-cache");
                    int code = c.getResponseCode();
                    if (code >= 200 && code < 300) {
                        try (InputStream in = c.getInputStream()) {
                            body = new String(readAll(in), StandardCharsets.UTF_8);
                        }
                        ok = true;
                    } else {
                        body = "HTTP " + code;
                    }
                } catch (Exception e) {
                    body = e.getClass().getSimpleName() + ": " + e.getMessage();
                } finally {
                    if (c != null) c.disconnect();
                }
                callPanel(cb + "(" + ok + "," + JSONObject.quote(body) + ")");
            }).start();
        }
    }

    /** Métodos que el ayudante dentro de VideoExpress puede llamar como PVE.xxx() */
    class VeBridge {
        @JavascriptInterface
        public void report(String msg) {
            callPanel("onReport(" + JSONObject.quote(msg) + ")");
        }
    }

    class Chrome extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
            if (fileCb != null) fileCb.onReceiveValue(null);
            fileCb = cb;
            try {
                Intent i = params.createIntent();
                if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) {
                    i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                }
                startActivityForResult(i, FILE_REQ);
            } catch (Exception e) {
                fileCb = null;
                return false;
            }
            return true;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_REQ || fileCb == null) return;
        Uri[] res = null;
        if (resultCode == RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                int n = data.getClipData().getItemCount();
                res = new Uri[n];
                for (int k = 0; k < n; k++) res[k] = data.getClipData().getItemAt(k).getUri();
            } else if (data.getData() != null) {
                res = new Uri[]{data.getData()};
            }
        }
        fileCb.onReceiveValue(res);
        fileCb = null;
    }

    @Override
    public void onBackPressed() {
        if (ve.canGoBack()) ve.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }
}
