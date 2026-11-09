package br.loja.painel;
import android.app.Activity;
import android.content.*;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.print.*;
import android.provider.Settings;
import android.webkit.*;
import android.widget.*;
import android.graphics.Color;
import java.io.*;
import java.net.URL;
import java.security.MessageDigest;
import java.security.cert.*;
import java.util.Locale;
import javax.net.ssl.*;

public final class MainActivity extends Activity {
    private static final String origin="https://kyrexn.github.io/painel-da-loja";
    private WebView browser;
    private ValueCallback<Uri[]> pending;
    private boolean updating;
    private int version;
    private final int dark=Color.rgb(19,20,24);
    @Override public void onCreate(Bundle state){
        super.onCreate(state);getWindow().setStatusBarColor(dark);
        version=getApplicationInfoVersion();
        open();
    }
    private int getApplicationInfoVersion(){
        try{return (int)getPackageManager().getPackageInfo(getPackageName(),0).getLongVersionCode();}
        catch(Exception e){throw new IllegalStateException(e);}
    }
    private void offline(){
        browser=null;LinearLayout panel=new LinearLayout(this);panel.setOrientation(1);panel.setPadding(40,64,40,32);panel.setBackgroundColor(dark);
        TextView title=new TextView(this);title.setText("Não foi possível conectar");title.setTextSize(24);
        Button retry=new Button(this);retry.setText("Tentar novamente");retry.setOnClickListener(v->open());
        panel.addView(title);panel.addView(retry);setContentView(panel);
    }
    private boolean sameOrigin(String raw){
        Uri uri=Uri.parse(raw);
        return "https".equals(uri.getScheme()) && "kyrexn.github.io".equals(uri.getHost()) && ("/painel-da-loja/".equals(uri.getPath()) || uri.getPath().startsWith("/painel-da-loja/"));
    }
    private void open(){
        WebView view=new WebView(this);browser=view;
        view.setBackgroundColor(dark);view.getSettings().setJavaScriptEnabled(true);
        view.getSettings().setAllowFileAccess(false);
        view.getSettings().setDomStorageEnabled(true);
        view.getSettings().setUserAgentString(view.getSettings().getUserAgentString()+" LojaAndroid/"+version);
        view.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return !sameOrigin(r.getUrl().toString());}
            @Override public void onReceivedError(WebView v,WebResourceRequest r,WebResourceError e){
                if(r.isForMainFrame()&&v==browser)offline();
            }
        });
        view.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onShowFileChooser(WebView v,ValueCallback<Uri[]> result,FileChooserParams params){
                if(pending!=null)pending.onReceiveValue(null);pending=result;
                Intent pick=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/pdf");
                try{startActivityForResult(pick,401);}catch(ActivityNotFoundException e){pending.onReceiveValue(null);pending=null;}
                return true;
            }
        });
        view.addJavascriptInterface(new Bridge(),"GondolaAndroid");setContentView(view);view.loadUrl(origin+"/");
    }
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);
        if(request==401&&pending!=null){Uri uri=result==RESULT_OK&&data!=null?data.getData():null;pending.onReceiveValue(uri==null?null:new Uri[]{uri});pending=null;}
        if(request==402&&getPackageManager().canRequestPackageInstalls())downloadUpdate();
    }
    private final class Bridge {
        @JavascriptInterface public void printList(){runOnUiThread(()->{
            if(browser==null||!sameOrigin(browser.getUrl()))return;
            ((PrintManager)getSystemService(PRINT_SERVICE)).print("Checklist de gôndola",browser.createPrintDocumentAdapter("Painel da loja"),new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build());
        });}
        @JavascriptInterface public void updateApp(){runOnUiThread(()->{
            if(browser==null||!sameOrigin(browser.getUrl()))return;
            if(!getPackageManager().canRequestPackageInstalls()){
                startActivityForResult(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+getPackageName())),402);
            }else downloadUpdate();
        });}
    }
    private void downloadUpdate(){
        if(updating)return;updating=true;
        Toast.makeText(this,"Baixando atualização…",Toast.LENGTH_SHORT).show();
        new Thread(()->{
            HttpsURLConnection connection=null;
            try{
                URL url=new URL(origin+"/Painel-da-loja.apk");
                connection=(HttpsURLConnection)url.openConnection();connection.setConnectTimeout(10000);connection.setReadTimeout(30000);
                connection.setInstanceFollowRedirects(false);

                if(connection.getResponseCode()!=200)throw new IOException();
                File file=new File(getCacheDir(),"update.apk");
                try(InputStream in=connection.getInputStream();FileOutputStream out=new FileOutputStream(file)){
                    byte[] buf=new byte[16384];int n;while((n=in.read(buf))!=-1)out.write(buf,0,n);
                }
                android.content.pm.PackageInfo pkg=getPackageManager().getPackageArchiveInfo(file.getPath(),0);
                if(pkg==null||!getPackageName().equals(pkg.packageName)||pkg.getLongVersionCode()<=version)throw new IOException();
                runOnUiThread(()->{
                    try{startActivity(new Intent(Intent.ACTION_VIEW).setDataAndType(UpdateFile.APK,"application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));}
                    catch(ActivityNotFoundException e){Toast.makeText(this,"Instalador indisponível.",Toast.LENGTH_LONG).show();}
                });
            }catch(Exception e){runOnUiThread(()->Toast.makeText(this,"Falha na atualização. Confira o servidor e tente novamente.",Toast.LENGTH_LONG).show());}
            finally{if(connection!=null)connection.disconnect();runOnUiThread(()->updating=false);}
        }).start();
    }
}
