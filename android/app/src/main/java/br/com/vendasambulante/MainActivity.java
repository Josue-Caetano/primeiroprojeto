package br.com.vendasambulante;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Abre o app web (pasta assets/www) num WebView.
 *
 * - Os arquivos são servidos por WebViewAssetLoader num endereço https "de mentira"
 *   (appassets.androidplatform.net). Assim o app funciona como num site: scripts em módulo,
 *   IndexedDB e a proteção da senha (crypto.subtle) funcionam, sem internet.
 * - "Restaurar backup": o seletor de arquivos do Android abre pelo onShowFileChooser.
 * - "Baixar backup": o WebView não salva downloads sozinho; um pequeno script intercepta o
 *   download e entrega o conteúdo para o Android, que abre "Salvar como" (sem pedir permissão).
 */
public class MainActivity extends Activity {

    private static final String START_URL = "https://appassets.androidplatform.net/assets/www/index.html";
    private static final int REQ_PICK_FILE = 1;
    private static final int REQ_SAVE_FILE = 2;

    /** Intercepta downloads de "blob:" (backup) e manda o texto para o Android salvar. */
    private static final String DOWNLOAD_BRIDGE_JS =
            "(function(){" +
            "  if (window.__downloadBridge) return; window.__downloadBridge = true;" +
            "  var click = HTMLAnchorElement.prototype.click;" +
            "  HTMLAnchorElement.prototype.click = function(){" +
            "    if (this.download && this.href && this.href.indexOf('blob:') === 0) {" +
            "      var name = this.download;" +
            "      fetch(this.href).then(function(r){ return r.text(); })" +
            "        .then(function(t){ AndroidBridge.saveFile(name, t); })" +
            "        .catch(function(e){ alert('Não foi possível salvar o backup: ' + e); });" +
            "      return;" +
            "    }" +
            "    return click.call(this);" +
            "  };" +
            "})();";

    private WebView webView;
    private ValueCallback<Uri[]> pendingFileCallback;
    private String pendingSaveContent;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView = new WebView(this);
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true); // localStorage (lembra o desbloqueio do dia)
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);

        webView.addJavascriptInterface(new Bridge(), "AndroidBridge");

        webView.setWebViewClient(new WebViewClientCompat() {
            @Override
            public WebResourceResponse shouldInterceptRequest(@NonNull WebView view, @NonNull WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                view.evaluateJavascript(DOWNLOAD_BRIDGE_JS, null);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                view.evaluateJavascript(DOWNLOAD_BRIDGE_JS, null); // garante, caso o início tenha escapado
            }
        });

        // WebChromeClient: mostra alert()/confirm() (ex.: "Excluir esta venda?") e abre o seletor de arquivos.
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pendingFileCallback != null) pendingFileCallback.onReceiveValue(null);
                pendingFileCallback = callback;
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*"); // ".json" nem sempre é reconhecido como tipo; deixa escolher qualquer arquivo
                try {
                    startActivityForResult(Intent.createChooser(intent, "Escolha o backup"), REQ_PICK_FILE);
                } catch (Exception e) {
                    pendingFileCallback = null;
                    callback.onReceiveValue(null);
                    return false;
                }
                return true;
            }
        });

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(START_URL);
        }
    }

    /** Métodos chamados pelo JavaScript da página. */
    private class Bridge {
        @JavascriptInterface
        public void saveFile(final String fileName, final String content) {
            runOnUiThread(() -> {
                pendingSaveContent = content;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/json");
                intent.putExtra(Intent.EXTRA_TITLE, fileName);
                startActivityForResult(intent, REQ_SAVE_FILE);
            });
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_PICK_FILE) {
            if (pendingFileCallback != null) {
                Uri uri = (resultCode == RESULT_OK && data != null) ? data.getData() : null;
                pendingFileCallback.onReceiveValue(uri != null ? new Uri[]{uri} : null);
                pendingFileCallback = null;
            }
        } else if (requestCode == REQ_SAVE_FILE) {
            String content = pendingSaveContent;
            pendingSaveContent = null;
            if (resultCode != RESULT_OK || data == null || data.getData() == null || content == null) return;
            try (OutputStream out = getContentResolver().openOutputStream(data.getData())) {
                if (out == null) throw new IllegalStateException("sem acesso ao arquivo");
                out.write(content.getBytes(StandardCharsets.UTF_8));
                Toast.makeText(this, "Backup salvo", Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                Toast.makeText(this, "Erro ao salvar o backup: " + e.getMessage(), Toast.LENGTH_LONG).show();
            }
        }
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        if (webView != null) webView.destroy();
        super.onDestroy();
    }
}
