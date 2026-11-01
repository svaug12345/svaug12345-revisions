/*
 * Modèle Bubblewrap (Google, licence Apache 2.0).
 * L'écran de démarrage de l'appli : toute la logique (ouvrir le site en plein écran dans Chrome)
 * est dans la classe parente de la bibliothèque androidbrowserhelper.
 */
package io.github.svaug12345.revisions;

import android.content.pm.ActivityInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;

public class LauncherActivity
        extends com.google.androidbrowserhelper.trusted.LauncherActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Orientation « non précisée » : portrait ou paysage, comme le site.
        // (Bubblewrap ne la fixe qu'à partir d'Android 8.1, car la fixer plante Android 8.0.)
        if (Build.VERSION.SDK_INT > Build.VERSION_CODES.O) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        }
    }

    @Override
    protected Uri getLaunchingUrl() {
        // L'adresse ouverte au lancement (celle du manifeste, ou celle d'un lien touché)
        return super.getLaunchingUrl();
    }
}
