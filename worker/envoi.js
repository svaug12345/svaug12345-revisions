/* =====================================================================
   « BOÎTE AUX LETTRES » DE MES RÉVISIONS — Cloudflare Worker
   ---------------------------------------------------------------------
   Rôle : recevoir depuis l'appli et ranger dans le dépôt GitHub PRIVÉ svaug12345/revisions-demandes :
     (1) les demandes de leçon : photos ET/OU description du besoin (bouton « 📸 Ajouter une leçon ») ;
     (2) les remarques 💬 sur une leçon            -> remarques/<date>/…json ;
     (3) les demandes d'ajustement 🛠️ d'une leçon   -> ajustements/<enfant>/<date>.json (depuis la v1.22.0) ;
     (4) les profils d'élèves créés dans l'appli ➕ -> eleves/<id>.json (depuis la v1.22.0),
         et (5) les renvoyer pour retrouver un élève sur un autre téléphone (« retrouver-eleve »).
   Une demande de leçon = un dossier :

     demandes/titouan/2026-11-03-1842-a1b2/
       ├── demande.json   (enfant, matière, petit mot, date, statut « à traiter »)
       ├── photo-1.jpg
       └── photo-2.jpg

   Ensuite, le robot « Leçon immédiate » du dépôt privé (Claude) lit ces dossiers
   et publie les leçons dans lecons.json en quelques minutes.

   Pourquoi un Worker ? L'appli est un site statique (GitHub Pages) : elle ne
   peut pas garder de secret. Le jeton GitHub qui a le droit d'écrire dans le
   dépôt privé reste donc ici, côté serveur, jamais dans l'appli.

   Secrets (posés par le robot .github/workflows/worker.yml, jamais écrits dans le code) :
     - DEMANDES_TOKEN : jeton GitHub limité au dépôt revisions-demandes (Contents: read & write)
     - CODE_FAMILLE   : le code demandé une fois dans l'appli, pour que des inconnus
                        ne puissent pas remplir la boîte aux lettres
   Réglages (wrangler.toml, [vars]) : DEPOT, BRANCHE, ORIGINES.
   ===================================================================== */

// Limites de sécurité : de quoi envoyer une leçon de plusieurs pages, pas plus
const MAX_PHOTOS = 8;
const MAX_TAILLE_PHOTO = 3_000_000;   // caractères base64 (≈ 2,2 Mo) — l'appli envoie ≈ 300 Ko par photo
const PREFIXE_JPEG = 'data:image/jpeg;base64,';
const MIN_DESCRIPTION = 10;           // sans photo, la description du besoin doit faire au moins 10 caractères

export default {
  async fetch(requete, env) {
    // --- CORS : seule l'appli (baiji.fr) a le droit d'appeler ce service depuis un navigateur
    const origine = requete.headers.get('Origin') || '';
    const autorisees = (env.ORIGINES || 'https://baiji.fr').split(',').map((o) => o.trim());
    const cors = {
      'Access-Control-Allow-Origin': autorisees.includes(origine) ? origine : autorisees[0],
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };
    const repondre = (corps, statut = 200) => new Response(JSON.stringify(corps), {
      status: statut, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
    });

    // Le navigateur demande d'abord la permission (requête « préliminaire » OPTIONS)
    if (requete.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    // GET : petit test « le service est-il en ligne ? » (utilisé par le robot après déploiement)
    if (requete.method === 'GET') return repondre({ ok: true, service: 'Mes Révisions — envoi de leçons' });
    if (requete.method !== 'POST') return repondre({ ok: false, erreur: 'methode' }, 405);

    // --- Lecture et vérification de la demande
    let d;
    try { d = await requete.json(); } catch { return repondre({ ok: false, erreur: 'json', message: 'Demande illisible' }, 400); }

    // Code famille : comparaison sans tenir compte des majuscules ni des espaces autour
    const propre = (s) => String(s || '').trim().toLowerCase();
    if (!env.CODE_FAMILLE || propre(d.code) !== propre(env.CODE_FAMILLE)) {
      return repondre({ ok: false, erreur: 'code', message: 'Code famille incorrect' }, 403);
    }
    // Identifiant d'enfant : lettres minuscules, chiffres, tirets (sert de nom de dossier)
    if (!/^[a-z0-9-]{1,30}$/.test(d.enfant || '')) return repondre({ ok: false, erreur: 'enfant' }, 400);

    // --- 💬 Une REMARQUE sur une leçon (pas de photo) : un petit fichier JSON dans remarques/<date>/
    if (d.type === 'remarque') return recevoirRemarque(d, env, repondre);
    if (d.type === 'ajustement') return recevoirAjustement(d, env, repondre);
    if (d.type === 'eleve') return recevoirEleve(d, env, repondre);
    if (d.type === 'retrouver-eleve') return retrouverEleve(d, env, repondre);

    // --- 📸 Une DEMANDE DE LEÇON : des photos, ou seulement une description du besoin (dans « note »)
    const photos = Array.isArray(d.photos) ? d.photos : [];
    const note = String(d.note || '').slice(0, 1500);
    if (photos.length > MAX_PHOTOS) return repondre({ ok: false, erreur: 'photos', message: `${MAX_PHOTOS} photos au maximum` }, 400);
    if (!photos.length && note.trim().length < MIN_DESCRIPTION) {
      return repondre({ ok: false, erreur: 'vide', message: 'Ajoute une photo, ou décris ce qu’il faut réviser' }, 400);
    }
    for (const p of photos) {
      if (typeof p !== 'string' || !p.startsWith(PREFIXE_JPEG) || p.length > MAX_TAILLE_PHOTO) {
        return repondre({ ok: false, erreur: 'photo', message: 'Photo trop lourde ou dans un format inattendu' }, 400);
      }
    }
    const matiere = String(d.matiere || 'Autre').slice(0, 40);

    // --- Nom du dossier : date et heure de Paris + 4 caractères au hasard (deux envois à la même minute)
    const maintenant = new Date();
    const paris = heureDeParis(maintenant);
    const hasard = crypto.randomUUID().slice(0, 4);
    const dossier = `demandes/${d.enfant}/${paris.year}-${paris.month}-${paris.day}-${paris.hour}${paris.minute}-${hasard}`;

    const fiche = {
      enfant: d.enfant, matiere, note,
      envoyeeLe: maintenant.toISOString(),
      photos: photos.map((_, i) => `photo-${i + 1}.jpg`),
      source: photos.length ? 'photos' : 'description',   // sans photo : la leçon est fabriquée d'après « note »
      versionAppli: String(d.version || '').slice(0, 20),
      statut: 'à traiter',          // Claude passe ce champ à « traitée » (+ id des leçons créées)
    };
    // Élève créé dans l'appli : son profil voyage avec la demande (au cas où eleves/<id>.json manquerait)
    const eleve = profilPropre(d.eleve, d.enfant);
    if (eleve) fiche.eleve = eleve;
    const fichiers = [
      { chemin: `${dossier}/demande.json`, base64: versBase64(JSON.stringify(fiche, null, 2) + '\n') },
      ...photos.map((p, i) => ({ chemin: `${dossier}/photo-${i + 1}.jpg`, base64: p.slice(PREFIXE_JPEG.length) })),
    ];

    // --- Écriture dans le dépôt privé, en UN seul commit
    try {
      await commiter(env, fichiers, `📸 Demande de leçon : ${d.enfant} · ${matiere} (${photos.length
        ? `${photos.length} photo${photos.length > 1 ? 's' : ''}` : 'description'})`);
    } catch (e) {
      console.log('Échec GitHub :', e.message);   // visible dans le tableau de bord Cloudflare
      return repondre({ ok: false, erreur: 'github', message: 'La boîte aux lettres est momentanément indisponible' }, 502);
    }
    return repondre({ ok: true, dossier });
  },
};

/** Date et heure de Paris, découpées : { year, month, day, hour, minute } */
function heureDeParis(date) {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(date).reduce((o, p) => ({ ...o, [p.type]: p.value }), {});
}

/**
 * 💬 Remarque sur une leçon, envoyée depuis la bulle d'un bloc de fiche ou d'une question.
 * Rangée dans remarques/AAAA-MM-JJ/HHMM-<enfant>-xxxx.json, avec l'endroit exact.
 * Claude les rassemble chaque soir dans un ticket récapitulatif pour Papa (statut « nouvelle » -> « signalée »).
 */
async function recevoirRemarque(d, env, repondre) {
  const court = (x, n) => String(x ?? '').slice(0, n);
  if (!/^[a-z0-9-]{1,100}$/.test(d.lecon || '')) return repondre({ ok: false, erreur: 'lecon' }, 400);
  const motifs = (Array.isArray(d.motifs) ? d.motifs : []).slice(0, 6).map((m) => court(m, 40));
  const texte = court(d.texte, 1000).trim();
  if (!motifs.length && !texte) return repondre({ ok: false, erreur: 'vide', message: 'Remarque vide' }, 400);
  const e = d.endroit || {};
  const remarque = {
    enfant: d.enfant, lecon: d.lecon, titreLecon: court(d.titreLecon, 120),
    endroit: { type: e.type === 'question' ? 'question' : 'bloc', numero: Number(e.numero) || 0, titre: court(e.titre, 200) },
    motifs, texte,
    envoyeeLe: new Date().toISOString(),
    versionAppli: court(d.version, 20),
    statut: 'nouvelle',
  };
  const p = heureDeParis(new Date());
  const chemin = `remarques/${p.year}-${p.month}-${p.day}/${p.hour}${p.minute}-${d.enfant}-${crypto.randomUUID().slice(0, 4)}.json`;
  try {
    await commiter(env, [{ chemin, base64: versBase64(JSON.stringify(remarque, null, 2) + '\n') }],
      `💬 Remarque : ${d.enfant} · ${remarque.titreLecon || d.lecon}`);
  } catch (err) {
    console.log('Échec GitHub (remarque) :', err.message);
    return repondre({ ok: false, erreur: 'github', message: 'Envoi momentanément impossible' }, 502);
  }
  return repondre({ ok: true, fichier: chemin });
}

/**
 * Profil d'élève reçu de l'appli, nettoyé : seulement les champs attendus, textes raccourcis.
 * Renvoie null s'il n'y a pas de profil (enfant de la famille, décrit dans lecons.json).
 */
function profilPropre(e, id) {
  if (!e || typeof e !== 'object') return null;
  const court = (x, n) => (x === undefined || x === null ? undefined : String(x).trim().slice(0, n) || undefined);
  const age = Number(e.age);
  return {
    id, nom: court(e.nom, 40) || '?', age: age >= 2 && age <= 20 ? Math.round(age) : undefined,
    classe: court(e.classe, 20), avatar: court(e.avatar, 8), couleur: /^#[0-9a-f]{6}$/i.test(e.couleur || '') ? e.couleur : undefined,
    copains: court(e.copains, 600), passions: court(e.passions, 600), forces: court(e.forces, 600),
    difficultes: court(e.difficultes, 600), envies: court(e.envies, 600),
  };
}

/** ➕ Profil d'élève créé ou modifié dans l'appli -> eleves/<id>.json (remplace l'ancien) */
async function recevoirEleve(d, env, repondre) {
  const eleve = profilPropre(d.eleve, d.enfant);
  if (!eleve || eleve.nom === '?') return repondre({ ok: false, erreur: 'eleve', message: 'Profil incomplet' }, 400);
  eleve.misAJourLe = new Date().toISOString();
  try {
    await commiter(env, [{ chemin: `eleves/${d.enfant}.json`, base64: versBase64(JSON.stringify(eleve, null, 2) + '\n') }],
      `➕ Profil d'élève : ${eleve.nom} (${d.enfant})`);
  } catch (err) {
    console.log('Échec GitHub (élève) :', err.message);
    return repondre({ ok: false, erreur: 'github', message: 'Enregistrement momentanément impossible' }, 502);
  }
  return repondre({ ok: true, id: d.enfant });
}

/** 📲 Retrouver un élève sur un autre téléphone : on relit eleves/<id>.json dans le dépôt privé */
async function retrouverEleve(d, env, repondre) {
  try {
    const f = await github(env, 'GET', `/contents/eleves/${d.enfant}.json?ref=${env.BRANCHE || 'main'}`);
    const octets = Uint8Array.from(atob(f.content.replace(/\n/g, '')), (c) => c.charCodeAt(0));
    const eleve = profilPropre(JSON.parse(new TextDecoder().decode(octets)), d.enfant);
    return repondre({ ok: true, eleve });
  } catch (err) {
    if (err.statut === 404) return repondre({ ok: false, erreur: 'inconnu', message: 'Aucun élève avec ce code 🤔' }, 404);
    console.log('Échec GitHub (retrouver) :', err.message);
    return repondre({ ok: false, erreur: 'github', message: 'Recherche momentanément impossible' }, 502);
  }
}

/**
 * 🛠️ Demande d'ajustement d'une leçon (« plus facile », « une erreur »…) -> ajustements/<enfant>/<date>.json.
 * Contrairement aux remarques, le robot « Leçon immédiate » l'applique tout de suite.
 */
async function recevoirAjustement(d, env, repondre) {
  const court = (x, n) => String(x ?? '').slice(0, n);
  if (!/^[a-z0-9-]{1,100}$/.test(d.lecon || '')) return repondre({ ok: false, erreur: 'lecon' }, 400);
  const choix = (Array.isArray(d.choix) ? d.choix : []).slice(0, 8).map((m) => court(m, 50));
  const texte = court(d.texte, 1000).trim();
  if (!choix.length && texte.length < 5) return repondre({ ok: false, erreur: 'vide', message: 'Dis ce qu’il faut changer' }, 400);
  const ajustement = {
    enfant: d.enfant, lecon: d.lecon, titreLecon: court(d.titreLecon, 120),
    choix, texte,
    envoyeeLe: new Date().toISOString(),
    versionAppli: court(d.version, 20),
    statut: 'à traiter',          // le robot passe ce champ à « traité » (+ ce qui a été changé)
  };
  const eleve = profilPropre(d.eleve, d.enfant);
  if (eleve) ajustement.eleve = eleve;
  const p = heureDeParis(new Date());
  const chemin = `ajustements/${d.enfant}/${p.year}-${p.month}-${p.day}-${p.hour}${p.minute}-${crypto.randomUUID().slice(0, 4)}.json`;
  try {
    await commiter(env, [{ chemin, base64: versBase64(JSON.stringify(ajustement, null, 2) + '\n') }],
      `🛠️ Ajustement : ${d.enfant} · ${ajustement.titreLecon || d.lecon}`);
  } catch (err) {
    console.log('Échec GitHub (ajustement) :', err.message);
    return repondre({ ok: false, erreur: 'github', message: 'Envoi momentanément impossible' }, 502);
  }
  return repondre({ ok: true, fichier: chemin });
}

/** Texte (UTF-8, donc avec accents) -> base64 */
function versBase64(texte) {
  const octets = new TextEncoder().encode(texte);
  let binaire = '';
  for (const o of octets) binaire += String.fromCharCode(o);
  return btoa(binaire);
}

/** Appel à l'API REST de GitHub avec le jeton du dépôt privé */
async function github(env, methode, chemin, corps) {
  const rep = await fetch(`https://api.github.com/repos/${env.DEPOT}${chemin}`, {
    method: methode,
    headers: {
      'Authorization': `Bearer ${env.DEMANDES_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'mes-revisions-envoi',      // GitHub refuse les requêtes sans User-Agent
      ...(corps ? { 'Content-Type': 'application/json' } : {}),
    },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  if (!rep.ok) throw Object.assign(new Error(`${methode} ${chemin} -> ${rep.status} ${await rep.text()}`), { statut: rep.status });
  return rep.json();
}

/**
 * Ajoute plusieurs fichiers en un seul commit, avec l'API « Git Data » de GitHub :
 *   1. on lit le dernier commit de la branche (et son arbre de fichiers) ;
 *   2. on envoie chaque fichier (« blob ») ;
 *   3. on fabrique un nouvel arbre = l'ancien + nos fichiers ;
 *   4. on crée le commit, puis on avance la branche dessus.
 * Si quelqu'un a écrit entre-temps (étape 4 refusée), on recommence (3 essais).
 */
async function commiter(env, fichiers, message) {
  const branche = env.BRANCHE || 'main';
  // Les blobs ne dépendent pas de l'état de la branche : on les envoie une seule fois
  const blobs = await Promise.all(fichiers.map((f) =>
    github(env, 'POST', '/git/blobs', { content: f.base64, encoding: 'base64' })
      .then((b) => ({ path: f.chemin, mode: '100644', type: 'blob', sha: b.sha }))));
  for (let essai = 1; ; essai++) {
    const ref = await github(env, 'GET', `/git/ref/heads/${branche}`);
    const parent = await github(env, 'GET', `/git/commits/${ref.object.sha}`);
    const arbre = await github(env, 'POST', '/git/trees', { base_tree: parent.tree.sha, tree: blobs });
    const commit = await github(env, 'POST', '/git/commits', { message, tree: arbre.sha, parents: [ref.object.sha] });
    try {
      await github(env, 'PATCH', `/git/refs/heads/${branche}`, { sha: commit.sha });
      return;
    } catch (e) {
      if (e.statut !== 422 || essai >= 3) throw e;   // 422 = la branche a bougé : on réessaie
    }
  }
}
