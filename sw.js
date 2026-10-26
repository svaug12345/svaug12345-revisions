// =============================================================
//  SERVICE WORKER — fait marcher l'appli sans internet
//  -------------------------------------------------------------
//  Stratégie « réseau d'abord » : à chaque ouverture, si le
//  téléphone a internet, on prend la DERNIÈRE version des fichiers
//  sur GitHub (donc tes nouvelles leçons apparaissent tout de
//  suite) et on en garde une copie. Sans internet, on sert la copie.
// =============================================================
importScripts('version.js');            // récupère la variable VERSION
const CACHE = 'revisions-' + VERSION;   // un cache par version

// Fichiers mis de côté dès l'installation, pour le mode hors-ligne
const FICHIERS = [
  './', 'index.html', 'style.css', 'app.js', 'version.js', 'lecons.json',
  'manifest.json', 'audio/index.json', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'
];

// Installation : on remplit le cache puis on s'active sans attendre
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FICHIERS)));
  self.skipWaiting();
});

// Activation : on supprime les caches des anciennes versions
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Chaque requête de la page passe par ici
self.addEventListener('fetch', (e) => {
  // On ne gère que nos propres fichiers (pas Google Fonts, etc.)
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;

  // Les MP3 ne changent jamais (leur nom = empreinte du texte) : « cache d'abord ».
  // On télécharge le fichier en entier (sans « Range »), car le cache refuse les morceaux (réponses 206).
  if (e.request.url.endsWith('.mp3')) {
    const url = e.request.url;
    e.respondWith(
      caches.match(url).then((enCache) => enCache || fetch(url).then((reponse) => {
        if (reponse.ok) { const copie = reponse.clone(); caches.open(CACHE).then((c) => c.put(url, copie)); }
        return reponse;
      }))
    );
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((reponse) => {
        // Réseau OK : on met à jour la copie de secours
        if (reponse.ok) {
          const copie = reponse.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copie));
        }
        return reponse;
      })
      // Pas de réseau : on sert la copie
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
