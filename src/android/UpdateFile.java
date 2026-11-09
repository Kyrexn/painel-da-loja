package br.loja.painel;
import android.content.*;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.*;

public final class UpdateFile extends ContentProvider {
    public static final Uri APK=Uri.parse("content://br.loja.painel.updates/app.apk");
    private File file(Uri u) {
        if (!APK.equals(u)) throw new IllegalArgumentException();
        return new File(getContext().getCacheDir(),"update.apk");
    }
    public boolean onCreate(){return true;}
    public String getType(Uri u){file(u);return "application/vnd.android.package-archive";}
    public ParcelFileDescriptor openFile(Uri u,String mode)throws FileNotFoundException{
        if(!"r".equals(mode))throw new FileNotFoundException();
        return ParcelFileDescriptor.open(file(u),ParcelFileDescriptor.MODE_READ_ONLY);
    }
    public Cursor query(Uri u,String[] p,String s,String[] a,String o){
        File f=file(u);
        String[] cols=p==null?new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE}:p;
        MatrixCursor c=new MatrixCursor(cols);MatrixCursor.RowBuilder row=c.newRow();
        for(String col:cols)row.add(OpenableColumns.DISPLAY_NAME.equals(col)?"Painel-da-loja.apk":OpenableColumns.SIZE.equals(col)?f.length():null);
        return c;
    }
    public Uri insert(Uri u,ContentValues v){throw new UnsupportedOperationException();}
    public int delete(Uri u,String s,String[] a){throw new UnsupportedOperationException();}
    public int update(Uri u,ContentValues v,String s,String[] a){throw new UnsupportedOperationException();}
}
