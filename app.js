/* =============================================================
   MES RÉVISIONS — moteur de l'appli
   -------------------------------------------------------------
   Ce fichier ne contient AUCUNE leçon : il lit lecons.json et
   fabrique les écrans. Pour ajouter du contenu, on ne touche
   qu'à lecons.json.

   Plan du fichier :
     1. Outils (créer des éléments, mélanger, comparer des réponses…)
     2. Progrès des enfants (étoiles, sauvegardées dans le téléphone)
     3. Sons, voix et confettis (+ 3 bis : Alex, le coach vocal)
     4. Navigation (pile d'écrans + bouton retour d'Android)
     5. Les écrans : accueil, liste des leçons, fiche, quiz, résultat
     6. Les types d'activités (qcm, vraifaux, saisie, trous, paires, ordre, carte)
     7. Démarrage
   ============================================================= */
'use strict';

/* ---------- 1. OUTILS ---------------------------------------- */

const $ = (sel) => document.querySelector(sel);
const ecran = $('#ecran');

// État global de l'appli : les données chargées et l'enfant choisi
const etat = { donnees: null, enfant: null };

/**
 * Crée un élément HTML en une ligne.
 *   el('button', { class: 'choix', onclick: f }, 'Texte')
 * - les propriétés "onXxx" deviennent des écouteurs d'événements
 * - "html" injecte du HTML déjà préparé (à n'utiliser qu'avec du texte sûr)
 * - les enfants peuvent être du texte, des éléments ou des tableaux
 */
function el(tag, props = {}, ...enfants) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of enfants.flat()) {
    if (c === null || c === undefined || c === false) continue;
    e.append(c.nodeType ? c : String(c)); // texte -> nœud texte (donc pas d'injection HTML)
  }
  return e;
}

// Mélange un tableau (algorithme de Fisher-Yates) sans modifier l'original
function melanger(tableau) {
  const t = [...tableau];
  for (let i = t.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [t[i], t[j]] = [t[j], t[i]];
  }
  return t;
}

const auHasard = (t) => t[Math.floor(Math.random() * t.length)];

/**
 * Rend une réponse tapée « comparable » : minuscules, sans ponctuation,
 * espaces simplifiés. Ainsi "Évaporation !" = "evaporation".
 * - strict = false (par défaut) : les accents sont ignorés
 * - strict = true : les accents comptent (dictée, conjugaison…)
 * Les espaces dans les nombres sont retirés : "1 000" = "1000".
 */
function normaliser(texte, strict = false) {
  let t = String(texte).toLowerCase().normalize('NFC'); // NFC : une lettre accentuée = un seul caractère
  if (!strict) t = t.normalize('NFD').replace(/[̀-ͯ]/g, ''); // enlève les accents
  return t
    .replace(/(\d)\s+(?=\d)/g, '$1')        // "1 000" -> "1000" (fait AVANT la ponctuation pour ne pas coller "7,5")
    .replace(/[.,;:!?'’"«»()\-\s]+/g, ' ')  // ponctuation -> espace
    .trim();
}

// Protège un texte avant de l'insérer comme HTML (< devient &lt; etc.)
function echapper(texte) {
  return String(texte).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/**
 * Mini mise en forme pour les fiches de leçon :
 *   "# Titre"      -> sous-titre
 *   "- élément"    -> liste à puces
 *   "**gras**"     -> gras
 *   autre ligne    -> paragraphe
 */
function miseEnForme(texte) {
  let html = '';
  let dansListe = false;
  for (const brute of echapper(texte).split('\n')) {
    const ligne = brute
      .replace(MOT_ETRANGER, (_, affiche, dit) => // {{mot}} ou {{mot affiché|texte prononcé}}
        `<button class="mot" data-dit="${(dit || affiche).replace(/\*\*/g, '')}">${affiche}</button>`)
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    if (ligne.startsWith('- ')) {
      if (!dansListe) { html += '<ul>'; dansListe = true; }
      html += `<li>${ligne.slice(2)}</li>`;
      continue;
    }
    if (dansListe) { html += '</ul>'; dansListe = false; }
    if (ligne.startsWith('# ')) html += `<h3>${ligne.slice(2)}</h3>`;
    else if (ligne.trim() !== '') html += `<p>${ligne}</p>`;
  }
  if (dansListe) html += '</ul>';
  return html;
}


// Leçons visibles par un enfant : "pour" absent ou contenant son id ou "tous"
function leconsDe(idEnfant) {
  return etat.donnees.lecons.filter(
    (l) => !l.pour || l.pour.includes(idEnfant) || l.pour.includes('tous')
  );
}

/** Avatar d'un enfant : soit un emoji ("🦄"), soit une image ("avatars/gaby.svg"). */
function dessinAvatar(enfant, classe = 'avatar') {
  const a = enfant?.avatar || '🙂';
  return /\.(svg|png|jpe?g|webp)$/i.test(a)
    ? el('img', { class: classe + ' avatar-img', src: a, alt: enfant.nom })
    : el('span', { class: classe }, a);
}

/** Remplace le contenu d'un élément (l'écran par défaut). Contrairement à replaceChildren,
    les valeurs null / false / undefined sont ignorées : replaceChildren(null) écrirait « null » à l'écran. */
function afficher(...enfants) {
  ecran.replaceChildren(...enfants.flat().filter((c) => c !== null && c !== undefined && c !== false));
}

const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;

/**
 * Date d'ajout d'une leçon, écrite discrètement : "ajoutee": "2026-10-26" -> « ajoutée le 26 oct. »
 * La date se modifie à la main dans lecons.json (format AAAA-MM-JJ). Absente ou invalide -> rien.
 * (On ajoute « T12:00 » pour que le fuseau horaire ne fasse pas reculer d'un jour.)
 */
function dateAjout(lecon) {
  if (!lecon.ajoutee) return null;
  const d = new Date(lecon.ajoutee + 'T12:00');
  if (isNaN(d)) return null;
  const memeAnnee = d.getFullYear() === new Date().getFullYear();
  return 'ajoutée le ' + d.toLocaleDateString('fr-FR',
    memeAnnee ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ---------- 2. PROGRÈS (sauvegardés dans le téléphone) ------- */
// localStorage garde les données même quand on ferme l'appli.
// Structure : { tom: { "table-7": { etoiles: 2, meilleur: 80, fois: 3 } }, ... }

const CLE_PROGRES = 'revisions-progres';

function lireProgres() {
  try { return JSON.parse(localStorage.getItem(CLE_PROGRES)) || {}; }
  catch { return {}; }
}

function enregistrerScore(idEnfant, idLecon, etoiles, pourcentage, ratees = []) {
  const p = lireProgres();
  p[idEnfant] ??= {};
  const ancien = p[idEnfant][idLecon] || { etoiles: 0, meilleur: 0, fois: 0 };
  p[idEnfant][idLecon] = {
    etoiles: Math.max(ancien.etoiles, etoiles),      // on garde le meilleur résultat
    meilleur: Math.max(ancien.meilleur, pourcentage),
    fois: ancien.fois + 1,
    dernier: Date.now(),
    ratees,   // n° des questions ratées au dernier quiz (le mode parent les montre : « ce qui a coincé »)
  };
  try { localStorage.setItem(CLE_PROGRES, JSON.stringify(p)); } catch { /* stockage plein ou bloqué */ }
}

/* --- Archives : leçons rangées (plus affichées dans la liste principale) ---
   Par défaut, une leçon est archivée si lecons.json contient "archive": true.
   L'enfant (ou Papa) peut archiver / désarchiver depuis l'appli : ce choix est
   gardé dans le téléphone et passe AVANT la valeur du fichier.
   Structure : { gaby: { "id-lecon": true (archivée) / false (sortie des archives) } } */
const CLE_ARCHIVES = 'revisions-archives';
function lireArchives() {
  try { return JSON.parse(localStorage.getItem(CLE_ARCHIVES)) || {}; } catch { return {}; }
}
const estArchivee = (idEnfant, lecon) => lireArchives()[idEnfant]?.[lecon.id] ?? !!lecon.archive;
function changerArchive(idEnfant, lecon, archiver) {
  const a = lireArchives();
  a[idEnfant] ??= {};
  a[idEnfant][lecon.id] = archiver;
  try { localStorage.setItem(CLE_ARCHIVES, JSON.stringify(a)); } catch { /* stockage bloqué */ }
}

/* Une « série » = tous les modules d'un même parcours (même matière, même nom de parcours),
   ou la leçon seule si elle n'est pas dans un parcours. Depuis la v1.23.0, on archive et on
   ressort toujours une série entière : archiver une seule étape laissait un parcours à trous. */
function serieDe(idEnfant, lecon) {
  if (!lecon.parcours) return [lecon];
  return leconsDe(idEnfant).filter((l) => l.parcours === lecon.parcours && l.matiere === lecon.matiere)
    .sort((a, b) => (a.etape || 0) - (b.etape || 0));
}
function archiverSerie(idEnfant, lecon, archiver) {
  serieDe(idEnfant, lecon).forEach((l) => changerArchive(idEnfant, l, archiver));
}

const etoilesDe = (idEnfant, idLecon) => lireProgres()[idEnfant]?.[idLecon]?.etoiles || 0;
const dessinEtoiles = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);

/* ---------- 3. SONS, VOIX, CONFETTIS ------------------------- */

let sonActif = localStorage.getItem('revisions-son') !== 'non';
let audio; // créé au premier son (les navigateurs l'exigent après un geste de l'utilisateur)

/** Petits bruitages synthétisés (pas de fichier audio à télécharger). */
function son(type) {
  if (!sonActif) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    const notes = {
      bon: [523, 659, 784],          // do-mi-sol joyeux
      petit: [880],                  // une paire trouvée
      faux: [220, 175],              // deux notes qui descendent
      fin: [523, 659, 784, 1047],    // fanfare
    }[type] || [440];
    notes.forEach((freq, i) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = type === 'faux' ? 'square' : 'triangle';
      osc.frequency.value = freq;
      const t = audio.currentTime + i * 0.11;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(type === 'faux' ? 0.08 : 0.2, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      osc.connect(gain).connect(audio.destination);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  } catch { /* pas de son possible : tant pis */ }
}

/* --- VOIX ---------------------------------------------------
   Deux voix possibles :
   1. la voix de Papa (MP3 générés avec ElevenLabs, dans le dossier audio/) ;
   2. sinon, la synthèse vocale du téléphone.
   Chaque MP3 est nommé d'après une « empreinte » du texte (ex. audio/3fa2c9e1.mp3).
   Ainsi, si un texte change dans lecons.json, son empreinte change aussi :
   l'ancien MP3 n'est plus utilisé et on retombe sur la voix du téléphone. */

let audiosDispo = new Set(); // empreintes des MP3 présents (lu dans audio/index.json au démarrage)
// Depuis la v1.17.1 : versions RALENTIES (étirées à l'avance, sans changer la hauteur de la voix) pour les
// tout-petits, dans audio/lent/. Utilisées par les profils "voixLente": true (Elouan) quand elles existent.
let audiosLents = new Set();
let lecteur = null;          // le MP3 en cours de lecture

/** Empreinte FNV-1a 32 bits du texte (encodé en UTF-8), en 8 caractères hexadécimaux.
    Le script Python qui génère les MP3 calcule exactement la même chose. */
function empreinte(texte) {
  let h = 0x811c9dc5;
  for (const octet of new TextEncoder().encode(texte)) {
    h ^= octet;
    h = Math.imul(h, 0x01000193) >>> 0; // multiplication 32 bits (>>> 0 = reste un entier positif)
  }
  return h.toString(16).padStart(8, '0');
}

// Arrête toute voix en cours (MP3 ou téléphone)
function couperVoix() {
  window.speechSynthesis?.cancel();
  if (lecteur) { lecteur.pause(); lecteur = null; }
}

// Voix de secours : la synthèse vocale du téléphone
function voixDuTelephone(texte, langue = 'fr-FR', vitesse = 0.95) {
  if (!('speechSynthesis' in window)) return;
  const phrase = new SpeechSynthesisUtterance(texte);
  phrase.lang = langue;
  phrase.rate = vitesse;
  speechSynthesis.speak(phrase);
}

/* ---- LIRE À VOIX HAUTE (seulement là où c'est utile) ----
   Depuis la v1.15.0, plus de 🔊 partout : la voix ne sert que quand elle fait partie de l'exercice
     - les profils "lectureAuto": true (CP, ne lit pas encore) : la question est lue toute seule,
       avec UN bouton 🔊 pour la réécouter ; les activités des sons et des nombres parlent aussi ;
     - les dictées (visuel "dictee" de visuels.js) ;
     - les mots étrangers des leçons de langues (voir prononcer(), plus bas).
   La voix est celle d'ElevenLabs, enregistrée à l'avance en MP3 (dossier audio/) : le fichier s'appelle
   empreinte("fr|" + texte), comme pour les langues. Si un MP3 manque, on se rabat sur la voix du
   téléphone (moins jolie) et la console le signale : il suffit alors de générer le MP3 manquant. */

/** Prépare un texte pour la voix : sans emojis ni **, et les signes dits en mots (« 8 − 2 » -> « 8 moins 2 »). */
function pourLaVoix(texte) {
  return String(texte)
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu, ' ')
    .replace(/\*\*/g, '').replace(/[«»"]/g, '')
    .replace(/\s[−-]\s/g, ' moins ').replace(/\s\+\s/g, ' plus ').replace(/\s=\s/g, ' égale ')
    .replace(/\s×\s/g, ' fois ').replace(/…/g, '...')
    .replace(/\s+/g, ' ').trim();
}

let fileVoix = [];  // morceaux de phrase qui attendent leur tour (une question puis ses réponses, par ex.)

/**
 * Lit un ou plusieurs textes en français, l'un après l'autre (coupe d'abord ce qui était lu).
 *   lireAVoixHaute('Dans quel mot entends-tu a ?')
 *   lireAVoixHaute(['Dans quel mot entends-tu a ?', 'chat', 'hibou'])   -> question puis réponses
 *   lireAVoixHaute(texte, { lent: true })                                -> dictée lente (× 0,72)
 *   lireAVoixHaute(texte, { vitesse: 1 })                                -> vitesse d'origine
 */
function lireAVoixHaute(textes, { lent = false, vitesse } = {}) {
  // Vitesse de lecture des MP3 (1 = telle qu'enregistrée). La voix ElevenLabs parle vite (≈ 8 syllabes/s
  // mesurées, contre 5 à 6 pour une voix posée) : on ralentit par défaut, beaucoup en mode « lent ».
  // Un profil peut avoir sa propre vitesse ("vitesseVoix" dans lecons.json, ex. 0.75 pour Ava en CP).
  // On ne descend pas sous 0.7 : en dessous, l'étirement du son (preservesPitch) devient « métallique ».
  const normal = etat.enfant?.vitesseVoix ?? 0.9;
  const rythme = vitesse ?? (lent ? Math.min(0.72, normal) : normal);
  // Silence entre deux morceaux (question puis réponses) : plus long pour un petit lecteur ("pauseVoix", en ms)
  const pause = etat.enfant?.pauseVoix ?? 250;
  couperVoix();
  fileVoix = [].concat(textes).map(pourLaVoix).filter(Boolean);
  const suivant = () => {
    const texte = fileVoix.shift();
    if (texte === undefined) return;
    const h = empreinte('fr|' + texte);              // même calcul que le script qui fabrique les MP3
    // profil "voixLente" : on prend la version ralentie si elle existe, sinon la normale
    const lente = etat.enfant?.voixLente && audiosLents.has(h);
    if (lente || audiosDispo.has(h)) {
      lecteur = new Audio((lente ? 'audio/lent/' : 'audio/') + h + '.mp3');
      lecteur.preservesPitch = true;                 // ralenti sans voix grave
      lecteur.webkitPreservesPitch = true;           // même réglage, nom des anciennes versions de Chrome/WebView
      lecteur.playbackRate = rythme;
      lecteur.onended = () => setTimeout(suivant, pause);  // petit silence entre deux morceaux
      lecteur.play().catch(() => { voixDuTelephone(texte); });
    } else {
      console.warn('MP3 manquant (voix du téléphone en secours) :', JSON.stringify(texte), h);
      if ('speechSynthesis' in window) {
        const phrase = new SpeechSynthesisUtterance(texte);
        phrase.lang = 'fr-FR'; phrase.rate = rythme * 0.95;
        phrase.onend = () => setTimeout(suivant, pause);
        speechSynthesis.speak(phrase);
      }
    }
  };
  suivant();
}

/** Ce qui est lu pour une question : l'énoncé (ou "dire"), puis les réponses d'un QCM dans l'ordre affiché. */
function textesQuestion(act, zone) {
  const enonce = act.dire || [act.question, act.affirmation, act.consigne,
    act.texte && act.texte.replace(/\[[^\]]*\]/g, '…'), act.recto].filter(Boolean).join('. ');
  // "lireChoix": false quand la question teste justement la lecture des réponses
  const choix = act.type === 'qcm' && act.lireChoix !== false && !act.dire
    ? [...zone.querySelectorAll('.choix')].map(texteSans) : [];
  return [enonce, ...choix];
}

/** Lecture d'une question qui vient d'être dessinée : seulement pour les profils "lectureAuto" (CP).
    Elle est lue toute seule, et UN bouton 🔊 permet de la réécouter. */
function lectureQuestion(act, carte, zone) {
  if (!etat.enfant?.lectureAuto) return;
  carte.querySelector('.type-question')?.append(el('button', {
    class: 'btn-lire petit', type: 'button', 'aria-label': 'Réécouter la question',
    onclick: (e) => { e.stopPropagation(); lireAVoixHaute(textesQuestion(act, zone)); },
  }, '🔊'));
  setTimeout(() => lireAVoixHaute(textesQuestion(act, zone)), 400);
}

/* ---- ORTHOGRAPHE SOUPLE ("orthographeSouple": true) ----
   Une réponse tapée avec une petite faute (une lettre de trop, en moins ou échangée) est acceptée :
   on vérifie ce que l'enfant a COMPRIS, pas son orthographe. */
function distance(a, b) { // distance de Levenshtein : nombre de lettres à changer pour passer de a à b
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
/** Texte d'un bouton de réponse sans le 🔈 ajouté par la lecture audio.
    (textContent inclurait « 🔈 » : une réponse juste serait alors comptée fausse !) */
function texteSans(b) {
  return [...b.childNodes].filter((n) => !n.classList?.contains('lire-choix')).map((n) => n.textContent).join('');
}
const procheOrtho = (attendu, tape) => distance(attendu, tape) <= (attendu.length >= 7 ? 2 : attendu.length >= 4 ? 1 : 0);


/* ---------- MOTS ÉTRANGERS : écouter et répéter -------------
   Dans lecons.json, une leçon de langue a "langue": "en" ou "de",
   et ses mots étrangers sont entourés de doubles accolades :
     {{der Vater}}                    -> on affiche et on prononce "der Vater"
     {{he / she / it is|he is. she is. it is.}}
                                      -> on affiche avant le |, on prononce après
   Toucher un mot ouvre une bulle : 🔊 écouter, 🐢 lentement, 🎤 à toi !
   ------------------------------------------------------------- */
const MOT_ETRANGER = /\{\{([^|}]+)(?:\|([^}]+))?\}\}/g;
const sansMots = (texte) => String(texte).replace(MOT_ETRANGER, '$1'); // texte sans les {{ }}
const motsDe = (texte) => [...String(texte).matchAll(MOT_ETRANGER)].map((m) => (m[2] || m[1]).replace(/\*\*/g, ''));

// Code de langue complet pour la voix du téléphone et la reconnaissance vocale
const LANGUES = { en: 'en-GB', de: 'de-DE', es: 'es-ES', it: 'it-IT' };
let langueLecon = null; // "en", "de"… de la leçon ouverte (null = leçon en français)

// Micro : l'API de reconnaissance vocale de Chrome (préfixée "webkit" sur Android)
const Reconnaissance = window.SpeechRecognition || window.webkitSpeechRecognition;

/** Prononce un mot étranger : MP3 de la voix native s'il existe, sinon voix du téléphone dans la bonne langue.
    lent = true -> lecture ralentie (le MP3 garde la même hauteur de voix grâce à preservesPitch). */
function prononcer(dit, lent = false) {
  if (!langueLecon) return;
  couperVoix();
  const h = empreinte(langueLecon + '|' + dit); // même calcul dans le script Python qui fabrique les MP3
  const secours = () => voixDuTelephone(dit, LANGUES[langueLecon] || langueLecon, lent ? 0.55 : 0.9);
  if (audiosDispo.has(h)) {
    lecteur = new Audio('audio/' + h + '.mp3');
    lecteur.preservesPitch = true;
    lecteur.playbackRate = lent ? 0.65 : 1;
    lecteur.play().catch(secours);
  } else {
    secours();
  }
}

// Compare ce que le micro a entendu avec le mot attendu (en pardonnant les petites différences)
function ressemble(entendu, attendu) {
  const net = (t) => normaliser(t).replace(/ß/g, 'ss').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  const a = net(entendu), b = net(attendu);
  if (!a || !b) return false;
  if (a === b || a.includes(b)) return true;
  // distance de Levenshtein = nombre de lettres à changer pour passer d'un mot à l'autre
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length] / Math.max(a.length, b.length) <= 0.25; // 75 % de lettres justes suffisent
}

/* Le LECTEUR de mots étrangers : une petite barre posée en bas de l'écran.
   Il ne bloque rien (pas de fond grisé) : on peut toucher un autre mot directement,
   le lecteur se met à jour et le prononce. Il se range tout seul après quelques
   secondes sans action (sauf pendant que le micro écoute). */
let lecteurMot = null; // { panneau, mot, message, micro, dit, ecoute, minuteur }

function fermerLecteurMot() {
  if (!lecteurMot) return;
  lecteurMot.ecoute?.abort();
  clearTimeout(lecteurMot.minuteur);
  const panneau = lecteurMot.panneau;
  panneau.classList.add('sortie');                  // petite animation de sortie
  setTimeout(() => panneau.remove(), 200);
  document.body.classList.remove('avec-lecteur');
  lecteurMot = null;
}

// Relance le compte à rebours de rangement automatique (8 s sans toucher au lecteur)
function minuterieLecteur() {
  if (!lecteurMot) return;
  clearTimeout(lecteurMot.minuteur);
  lecteurMot.minuteur = setTimeout(() => { if (lecteurMot && !lecteurMot.ecoute) fermerLecteurMot(); }, 8000);
}

/** Prononce un mot et l'affiche dans le lecteur (créé au premier mot touché). */
function ouvrirBulleMot(affiche, dit) {
  if (!lecteurMot) creerLecteurMot();
  const L = lecteurMot;
  L.ecoute?.abort();
  L.dit = dit;
  L.mot.innerHTML = echapper(affiche).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  L.mot.classList.remove('pop'); void L.mot.offsetWidth; L.mot.classList.add('pop'); // relance l'animation
  L.message.className = 'bulle-message';
  L.message.textContent = Reconnaissance ? 'Écoute, puis touche 🎤 pour répéter' : 'Écoute, puis répète à voix haute';
  prononcer(dit);
  minuterieLecteur();
}

function creerLecteurMot() {
  const L = (lecteurMot = {});
  L.mot = el('p', { class: 'bulle-mot' });
  L.message = el('p', { class: 'bulle-message' });
  L.micro = Reconnaissance ? el('button', { class: 'btn-bulle micro', 'aria-label': 'Répéter au micro', onclick: essayer }, '🎤') : null;

  // Le micro écoute l'enfant et compare avec le mot attendu
  function essayer() {
    if (L.ecoute) { L.ecoute.stop(); return; } // 2e appui = j'ai fini de parler
    couperVoix();
    clearTimeout(L.minuteur);
    const ecoute = (L.ecoute = new Reconnaissance());
    ecoute.lang = LANGUES[langueLecon] || langueLecon;
    ecoute.maxAlternatives = 5;   // le micro propose plusieurs "j'ai peut-être entendu…"
    ecoute.interimResults = false;
    L.micro.classList.add('en-cours');
    L.message.className = 'bulle-message';
    L.message.textContent = 'Parle maintenant !';
    ecoute.onresult = (e) => {
      const entendus = [...e.results[0]].map((alt) => alt.transcript);
      const reussi = entendus.some((t) => ressemble(t, L.dit));
      L.message.className = 'bulle-message ' + (reussi ? 'ok' : 'ko');
      L.message.textContent = reussi ? auHasard(['Bravo ! 🎉', 'Parfait ! 🌟', 'Super prononciation ! 👏'])
        : `J’ai entendu « ${entendus[0]} »… Réécoute et réessaie 💪`;
      son(reussi ? 'bon' : 'petit');
      if (reussi) vibrer(60);
    };
    ecoute.onerror = (e) => {
      L.message.className = 'bulle-message ko';
      L.message.textContent = e.error === 'not-allowed' ? 'Autorise le micro pour t’entendre 🎤'
        : e.error === 'no-speech' ? 'Je n’ai rien entendu… Parle plus fort !'
        : e.error === 'network' ? 'Le micro a besoin d’internet 📶' : 'Oups, réessaie !';
    };
    ecoute.onend = () => { L.ecoute = null; L.micro.classList.remove('en-cours'); minuterieLecteur(); };
    ecoute.start();
  }

  L.panneau = el('div', { id: 'bulle-mot', class: 'lecteur-mot', role: 'region', 'aria-label': 'Prononciation' },
    el('div', { class: 'lecteur-texte' }, L.mot, L.message),
    el('div', { class: 'boutons-bulle' },
      el('button', { class: 'btn-bulle', 'aria-label': 'Réécouter', onclick: () => { prononcer(L.dit); minuterieLecteur(); } }, '🔊'),
      el('button', { class: 'btn-bulle', 'aria-label': 'Lentement', onclick: () => { prononcer(L.dit, true); minuterieLecteur(); } }, '🐢'),
      L.micro,
      el('button', { class: 'fermer-bulle', 'aria-label': 'Fermer', onclick: fermerLecteurMot }, '✕')));
  document.body.append(L.panneau);
  document.body.classList.add('avec-lecteur'); // laisse de la place en bas de page pour ne rien cacher
}

// Petite vibration (si le téléphone le permet)
const vibrer = (ms) => navigator.vibrate?.(ms);

/** Pluie de confettis sur la toile #confettis pendant 3 secondes. */
function confettis() {
  const toile = $('#confettis');
  const ctx = toile.getContext('2d');
  toile.width = innerWidth;
  toile.height = innerHeight;
  const couleurs = ['#14b8a6', '#f59e0b', '#ec4899', '#6366f1', '#22c55e'];
  const morceaux = Array.from({ length: 140 }, () => ({
    x: Math.random() * toile.width,
    y: -20 - Math.random() * toile.height * 0.6,
    vx: (Math.random() - 0.5) * 3,
    vy: 2 + Math.random() * 4,
    angle: Math.random() * 6.28,
    rotation: (Math.random() - 0.5) * 0.3,
    taille: 6 + Math.random() * 7,
    couleur: auHasard(couleurs),
  }));
  const debut = performance.now();
  (function image(maintenant) {
    ctx.clearRect(0, 0, toile.width, toile.height);
    for (const m of morceaux) {
      m.x += m.vx; m.y += m.vy; m.angle += m.rotation;
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(m.angle);
      ctx.fillStyle = m.couleur;
      ctx.fillRect(-m.taille / 2, -m.taille / 4, m.taille, m.taille / 2);
      ctx.restore();
    }
    if (maintenant - debut < 3000) requestAnimationFrame(image);
    else ctx.clearRect(0, 0, toile.width, toile.height);
  })(debut);
}

// Fait trembler un élément (mauvaise réponse)
function secouer(element) {
  element.classList.remove('secoue');
  void element.offsetWidth; // astuce : force le navigateur à relancer l'animation
  element.classList.add('secoue');
}

/* ---------- 3 bis. ALEX, LE COACH VOCAL (ElevenLabs) ------------
   Sur les leçons marquées "assistant": true, une pastille discrète « 🎧 Alex »
   (à droite du titre) permet de PARLER avec un coach : poser des questions, se faire interroger,
   demander des exemples concrets.

   Comment ça marche ?
   - Il n'y a qu'UN agent ElevenLabs (son identifiant est dans lecons.json,
     rubrique "assistant"). À chaque appel, l'appli lui envoie des « variables
     dynamiques » : le prénom, l'âge, la fiche et le quiz de la leçon ouverte.
     Ses consignes (dans ElevenLabs) contiennent {{prenom}}, {{fiche}}… qui sont
     remplacés par ces valeurs : chaque leçon a donc « son » Alex, sans rien
     créer de plus quand on ajoute une leçon.
   - Le SDK officiel « @elevenlabs/client » n'est téléchargé qu'au premier appel
     (version figée, la même que sur les autres pages de baiji.fr).
   - Côté ElevenLabs : 30 appels par jour maximum (les conversations restent
     dans l'historique ElevenLabs : pas de mode « zéro conservation », choix de Papa).
   ------------------------------------------------------------- */

let alex = null; // { conversation, carte (= la pastille) } pendant un appel, sinon null

/** Transforme la fiche en texte simple pour Alex (sans ** ni {{ }}, schémas résumés en JSON). */
function texteFiche(lecon) {
  const lignes = Array.isArray(lecon.fiche) ? lecon.fiche : lecon.fiche ? [lecon.fiche] : [];
  // Enlève la mise en forme : {{mot|prononcé}} -> mot, **gras** -> gras
  const nettoyer = (t) => t.replace(MOT_ETRANGER, (_, affiche) => affiche).replace(/\*\*/g, '');
  return lignes.map((l) => {
    if (typeof l !== 'string') {
      const { visuel, ...donnees } = l; // un schéma : on donne son type et ses données brutes
      return `[Schéma « ${visuel} » : ${nettoyer(JSON.stringify(donnees))}]`;
    }
    return nettoyer(l);
  }).join('\n');
}

/** Le quiz en texte (une question par ligne, avec sa réponse) : Alex s'en sert pour interroger. */
function texteQuestions(lecon) {
  return (lecon.activites || []).map((a) => '- ' + JSON.stringify(a)).join('\n') || '(pas de quiz)';
}

/** La pastille « 🎧 Alex », discrète, à droite du titre de la leçon (null si la leçon n'a pas d'Alex).
    Pendant l'appel, elle montre qui parle et sert de bouton « raccrocher ». */
function blocAlex(lecon) {
  const agentId = etat.donnees.assistant?.agentId;
  if (!lecon.assistant || !agentId || !etat.enfant) return null;
  const pastille = el('button', {
    class: 'alex', type: 'button',
    title: 'Parler avec Alex, ton coach : questions, exemples, petite interro',
  });
  etatAlex(pastille, 'repos');
  pastille.addEventListener('click', () => (alex ? raccrocherAlex() : appelerAlex(lecon, pastille, agentId)));
  return pastille;
}

/* Ce qu'affiche la pastille dans chaque état : [icône, texte] */
const TEXTES_ALEX = {
  repos: ['🎧', 'Alex'],
  connexion: ['⏳', 'Ça sonne…'],
  parle: ['🔊', 'Alex parle'],
  ecoute: ['👂', 'À toi'],
};

/** Change l'état de la pastille : 'repos', 'connexion', 'parle' ou 'ecoute'.
    Un message éventuel (erreur, au revoir…) s'affiche dans un petit toast en bas. */
function etatAlex(pastille, mode, message) {
  const [icone, texte] = TEXTES_ALEX[mode];
  pastille.dataset.mode = mode;
  pastille.replaceChildren(...[ // filter(Boolean) : replaceChildren(null) écrirait « null » à l'écran
    el('span', { class: 'alex-icone', 'aria-hidden': 'true' }, icone),
    el('span', {}, texte),
    mode === 'repos' ? null : el('span', { class: 'alex-raccrocher', 'aria-label': 'Raccrocher' }, '✖'),
  ].filter(Boolean));
  if (message) toast(message);
}

async function appelerAlex(lecon, carte, agentId) {
  if (carte.dataset.mode === 'connexion') return; // anti double-clic
  couperVoix(); fermerLecteurMot();
  etatAlex(carte, 'connexion');
  let debut = 0; // heure de décroché, pour repérer un appel coupé aussitôt
  try {
    // 1) Le micro (le navigateur demande l'autorisation la première fois)
    await navigator.mediaDevices.getUserMedia({ audio: true });
    // 2) Le SDK ElevenLabs, chargé seulement maintenant
    const { Conversation } = await import('https://cdn.jsdelivr.net/npm/@elevenlabs/client@1.32.1/+esm');
    // 3) L'appel, avec la leçon en « variables dynamiques »
    const enfant = etat.enfant;
    const appel = { carte, conversation: null };
    alex = appel;
    const conversation = await Conversation.startSession({
      agentId,
      dynamicVariables: {
        prenom: enfant.nom,
        age: String(enfant.age || 10),
        matiere: lecon.matiere || 'Révisions',
        titre: lecon.titre,
        fiche: texteFiche(lecon),
        questions: texteQuestions(lecon),
        // Consignes d'accompagnement propres à l'enfant (lecons.json > enfants > "conseilsAlex")
        conseils: enfant.conseilsAlex || 'Aucune consigne particulière.',
      },
      onConnect: () => { debut = Date.now(); etatAlex(carte, 'parle'); },
      onModeChange: ({ mode }) => { if (alex) etatAlex(carte, mode === 'speaking' ? 'parle' : 'ecoute'); },
      onDisconnect: () => {
        if (alex !== appel) return; // c'est nous qui avons raccroché : rien à signaler
        const tropCourt = !debut || Date.now() - debut < 3000; // coupé en moins de 3 s = souci de connexion
        alex = null;
        etatAlex(carte, 'repos', tropCourt ? 'Alex n’a pas pu décrocher 😕 Réessaie dans un moment.' : null);
      },
      onError: (e) => console.warn('Alex :', e),
    });
    // Raccroché (ou écran quitté) pendant que ça sonnait : on coupe tout de suite
    if (alex !== appel) { conversation.endSession(); return; }
    appel.conversation = conversation;
  } catch (e) {
    console.warn('Alex :', e);
    alex = null;
    const micro = e && (e.name === 'NotAllowedError' || e.name === 'NotFoundError');
    etatAlex(carte, 'repos', micro ? 'Autorise le micro pour parler à Alex 🎤'
      : 'Alex n’est pas joignable (internet ?) 😕');
  }
}

/** Termine l'appel en cours (bouton Raccrocher, changement d'écran…). */
function raccrocherAlex() {
  if (!alex) return;
  const { conversation, carte, majEtat } = alex;
  alex = null;
  conversation?.endSession().catch(() => {});
  // majEtat : fonction d'affichage propre au bouton (le coach de langues a la sienne)
  if (carte.isConnected) (majEtat || etatAlex)(carte, 'repos', 'À bientôt ! 👋');
}

/* ---------- 3 ter. LE COACH DE LANGUES (anglais, allemand, espagnol) ----------
   Sur la page des leçons de Tom, Gaby et Nanon : un bloc « 🌍 Coach de langues »
   avec un bouton par langue. On touche → on PARLE avec Alex dans cette langue,
   sans leçon précise : conversation, jeux de rôle, vocabulaire…

   Le niveau (1 à 6) :
   - niveau de départ : lecons.json > enfants > "coachLangues": { "en": 3, "de": 2, "es": 1 }
     (un enfant sans "coachLangues" n'a pas de coach de langues) ;
   - quand l'enfant réussit bien, le coach propose d'aller « un cran plus loin ».
     S'il accepte, le coach appelle l'outil client « changer_niveau » (déclaré dans
     ElevenLabs) : l'appli enregistre le nouveau niveau dans le téléphone et fait la fête 🎉.
     La fois suivante, la séance reprend à ce niveau ;
   - les descriptions des niveaux sont dans lecons.json > "coachLangues" > "niveaux".

   Agent ElevenLabs à part (pas le même qu'Alex des leçons) : son identifiant est dans
   lecons.json > "coachLangues" > "agentId". La conversation est TOUJOURS réglée dans la
   langue étrangère (reconnaissance vocale et accueil) : le coach parle le plus possible
   la langue à apprendre, même au niveau 1 ; le français ne sert qu'à débloquer.
   ------------------------------------------------------------------------- */

const CLE_NIVEAUX = 'revisions-niveaux-langues'; // { gaby: { en: 4, de: 2 }, … } dans le téléphone

/** Le niveau actuel d'un enfant dans une langue : le plus haut entre celui du fichier et celui du téléphone. */
function niveauLangue(enfant, langue) {
  let enregistre = 0;
  try { enregistre = JSON.parse(localStorage.getItem(CLE_NIVEAUX))?.[enfant.id]?.[langue] || 0; } catch { /* rien */ }
  return Math.min(6, Math.max(1, enfant.coachLangues?.[langue] || 1, enregistre));
}

/** Enregistre un nouveau niveau (entre 1 et 6) dans le téléphone. Renvoie le niveau retenu.
    On l'écrit tel quel, même plus bas : si l'enfant redescend avec le coach, on le respecte
    (mais jamais sous le niveau de départ du fichier, voir niveauLangue). */
function changerNiveauLangue(enfant, langue, niveau) {
  const n = Math.min(6, Math.max(1, Math.round(Number(niveau)) || 1));
  try {
    const tous = JSON.parse(localStorage.getItem(CLE_NIVEAUX)) || {};
    tous[enfant.id] ??= {};
    tous[enfant.id][langue] = n;
    localStorage.setItem(CLE_NIVEAUX, JSON.stringify(tous));
  } catch { /* stockage bloqué : le niveau ne sera pas retenu */ }
  return niveauLangue(enfant, langue);
}

/** Le bloc « 🌍 Coach de langues » (null si l'enfant n'en a pas ou si l'agent n'est pas configuré). */
function blocCoachLangues() {
  const enfant = etat.enfant;
  const config = etat.donnees.coachLangues;
  if (!enfant?.coachLangues || !config?.agentId) return null;
  return el('section', { class: 'groupe coach-langues' },
    el('h2', {}, '🌍 Coach de langues'),
    el('p', { class: 'coach-intro' }, 'Parle avec Alex ! Si tu y arrives bien, il te proposera de monter d’un cran 🚀'),
    el('div', { class: 'coach-boutons' },
      Object.entries(config.langues).map(([code, langue]) => {
        const bouton = el('button', { class: 'coach-langue', type: 'button', style: `--c:${langue.couleur || '#6366f1'}` });
        bouton.dataset.langue = code;
        etatCoach(bouton, 'repos');
        bouton.addEventListener('click', () =>
          (alex?.carte === bouton ? raccrocherAlex() : appelerCoach(code, bouton)));
        return bouton;
      })));
}

/* Ce qu'affiche un bouton de langue selon l'état de l'appel (comme la pastille d'Alex) */
const TEXTES_COACH = {
  connexion: ['⏳', 'Ça sonne…'],
  parle: ['🔊', 'Alex parle'],
  ecoute: ['👂', 'À toi !'],
};

/** Redessine un bouton de langue : au repos, drapeau + langue + niveau ; en appel, l'état + ✖. */
function etatCoach(bouton, mode, message) {
  const code = bouton.dataset.langue;
  const langue = etat.donnees.coachLangues.langues[code];
  bouton.dataset.mode = mode;
  if (mode === 'repos') {
    const n = niveauLangue(etat.enfant, code);
    bouton.replaceChildren(
      el('span', { class: 'coach-drapeau', 'aria-hidden': 'true' }, langue.drapeau),
      el('b', {}, langue.libelle),
      // Petite jauge : ●●●○○○ = niveau 3 sur 6
      el('small', { class: 'coach-niveau', title: `Niveau ${n} sur 6` }, `Niveau ${n} `, el('span', {}, '●'.repeat(n) + '○'.repeat(6 - n))));
  } else {
    const [icone, texte] = TEXTES_COACH[mode];
    bouton.replaceChildren(
      el('span', { class: 'coach-drapeau', 'aria-hidden': 'true' }, icone),
      el('b', {}, texte),
      el('small', {}, `${langue.drapeau} ✖ raccrocher`));
  }
  if (message) toast(message);
}

async function appelerCoach(code, bouton) {
  if (bouton.dataset.mode === 'connexion') return; // anti double-clic
  raccrocherAlex();          // un seul appel à la fois (autre langue, ou Alex d'une leçon)
  couperVoix(); fermerLecteurMot();
  etatCoach(bouton, 'connexion');
  const enfant = etat.enfant;
  const config = etat.donnees.coachLangues;
  const langue = config.langues[code];
  const niveau = niveauLangue(enfant, code);
  let debut = 0;
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
    const { Conversation } = await import('https://cdn.jsdelivr.net/npm/@elevenlabs/client@1.32.1/+esm');
    const appel = { carte: bouton, conversation: null, majEtat: etatCoach };
    alex = appel;
    // Toute la séance est réglée dans la langue à apprendre (même au niveau 1).
    // Accueil : "bonjourDebutant" (phrases très simples) aux niveaux 1-2, sinon "bonjour".
    const accueil = (niveau <= 2 && langue.bonjourDebutant) || langue.bonjour;
    const conversation = await Conversation.startSession({
      agentId: config.agentId,
      overrides: {
        agent: {
          language: code,
          firstMessage: accueil.replaceAll('{prenom}', enfant.nom).replaceAll('{niveau}', String(niveau)),
        },
      },
      dynamicVariables: {
        prenom: enfant.nom,
        age: String(enfant.age || 10),
        classe: enfant.classe || `${enfant.age || 10} ans`,
        langue: langue.nom,                         // « anglais », « allemand », « espagnol »
        niveau: String(niveau),
        niveau_suivant: String(Math.min(6, niveau + 1)),
        description_niveau: config.niveaux[niveau - 1] || '',
        conseils: enfant.conseilsAlex || 'Aucune consigne particulière.',
      },
      // Outil appelé PAR LE COACH quand l'enfant accepte de monter (ou redescendre) d'un cran
      clientTools: {
        changer_niveau: ({ niveau: nouveau }) => {
          const avant = niveauLangue(enfant, code);
          const apres = changerNiveauLangue(enfant, code, nouveau);
          if (apres > avant) {
            eclats(bouton, ['🚀', '⭐', '🎉', langue.drapeau]);
            toast(`🚀 Niveau ${apres} débloqué en ${langue.nom} !`);
            son('fin'); // petite fanfare
          }
          return `Niveau enregistré : ${apres} sur 6. Continue la séance à ce niveau.`;
        },
      },
      onConnect: () => { debut = Date.now(); etatCoach(bouton, 'parle'); },
      onModeChange: ({ mode }) => { if (alex === appel) etatCoach(bouton, mode === 'speaking' ? 'parle' : 'ecoute'); },
      onDisconnect: () => {
        if (alex !== appel) return;
        const tropCourt = !debut || Date.now() - debut < 3000;
        alex = null;
        if (bouton.isConnected) etatCoach(bouton, 'repos', tropCourt ? 'Alex n’a pas pu décrocher 😕 Réessaie dans un moment.' : 'À bientôt ! 👋');
      },
      onError: (e) => console.warn('Coach de langues :', e),
    });
    if (alex !== appel) { conversation.endSession(); return; }
    appel.conversation = conversation;
  } catch (e) {
    console.warn('Coach de langues :', e);
    if (alex?.carte === bouton) alex = null;
    const micro = e && (e.name === 'NotAllowedError' || e.name === 'NotFoundError');
    if (bouton.isConnected) etatCoach(bouton, 'repos', micro ? 'Autorise le micro pour parler à Alex 🎤'
      : 'Alex n’est pas joignable (internet ?) 😕');
  }
}

/* ---------- 4. NAVIGATION ------------------------------------ */
// On garde une "pile" des écrans ouverts. Chaque nouvel écran ajoute
// une entrée dans l'historique du navigateur : ainsi le bouton retour
// d'Android (ou la flèche ←) revient à l'écran précédent.

const pile = [];

function aller(fonctionEcran, ...args) {
  pile.push([fonctionEcran, args]);
  history.pushState({ niveau: pile.length }, '');
  fonctionEcran(...args);
  scrollTo(0, 0);
}

// « ensuite » : une action à faire juste après un retour arrière (voir allerAuModuleSuivant)
let ensuite = null;

addEventListener('popstate', () => {
  if (pile.length > 1) {
    pile.pop();
    const [fonctionEcran, args] = pile.at(-1);
    fonctionEcran(...args);
    scrollTo(0, 0);
  }
  if (ensuite) { const f = ensuite; ensuite = null; f(); }
});

/** Remplace l'écran du haut de la pile (sans ajouter d'étape dans l'historique). */
function remplacerEcran(fonctionEcran, ...args) {
  pile[pile.length - 1] = [fonctionEcran, args];
  fonctionEcran(...args);
  scrollTo(0, 0);
}

// Met à jour la barre du haut pour l'écran affiché
function entete(titre) {
  $('#titre').textContent = titre;
  $('#btn-retour').hidden = pile.length <= 1;
  // Avatar cliquable -> profil de l'élève ; à côté, le bouton 👪 du mode parent (profils "modeParent": true)
  $('#badge-enfant').replaceChildren(...(etat.enfant ? [
    el('button', {
      class: 'btn-parent' + (modeParent() ? ' actif' : ''), title: 'Mode parent', 'aria-label': 'Mode parent',
      onclick: basculerModeParent, html: PICTO_PARENT,
    }),
    el('button', { class: 'btn-avatar', title: 'Voir le profil', 'aria-label': 'Voir le profil',
      onclick: () => { if (pile.at(-1)[0] !== afficherProfilEleve) aller(afficherProfilEleve, etat.enfant); } },
      dessinAvatar(etat.enfant, 'mini-avatar')),
  ].filter(Boolean) : []));
  document.body.classList.toggle('mode-parent', modeParent());
  couperVoix(); // on coupe la voix en changeant d'écran
  fermerLecteurMot(); // et on range le lecteur de mots étrangers
  raccrocherAlex();   // et on termine un éventuel appel avec Alex
  appliquerConfort();
}

/* Confort de lecture du profil choisi ("lectureFacile": true) : police Lexend, plus d'espace
   entre les lettres et les lignes, texte un peu plus grand (voir style.css, body.lecture-facile). */
function appliquerConfort() {
  const facile = !!etat.enfant?.lectureFacile;
  document.body.classList.toggle('lecture-facile', facile);
  if (facile && !document.getElementById('police-lexend')) {
    document.head.append(el('link', { id: 'police-lexend', rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Lexend:wght@400;600;800&display=swap' }));
  }
}

/* ---------- 5. LES ÉCRANS ------------------------------------ */

// --- Accueil : « Qui révise ? » ---
function afficherAccueil() {
  etat.enfant = null;
  modeParentPour = '';   // retour à l'accueil = retour au mode enfant
  memoriserEcran();   // accueil : plus d'écran à restaurer
  entete('Qui révise ?');
  const d = etat.donnees;
  afficher(
    el('p', { class: 'intro' }, 'Choisis ton profil pour commencer 👇'),
    el('div', { class: 'grille-enfants' },
      tousLesEnfants().map((enfant) => {
        const lecons = leconsDe(enfant.id).filter((l) => !estArchivee(enfant.id, l));
        const total = lecons.reduce((s, l) => s + etoilesDe(enfant.id, l.id), 0);
        return el('button', {
          class: 'carte-enfant',
          style: `--c:${enfant.couleur || '#14b8a6'}`,
          onclick: () => { etat.enfant = enfant; aller(afficherLecons); },
        },
          dessinAvatar(enfant),
          el('span', { class: 'nom' }, enfant.nom),
          el('span', { class: 'mini' }, `${pluriel(lecons.length, 'leçon')} · ⭐ ${total}`),
        );
      }),
      // ➕ Carte pour créer un nouvel élève (voir « ÉLÈVES AJOUTÉS DEPUIS L'APPLI »)
      el('button', { class: 'carte-enfant carte-ajout', onclick: () => aller(afficherProfilEleve, null) },
        el('span', { class: 'avatar' }, '➕'),
        el('span', { class: 'nom' }, 'Ajouter'),
        el('span', { class: 'mini' }, 'un élève')),
    ),
    d.maj ? el('p', { class: 'maj' }, `Leçons mises à jour le ${d.maj}`) : null,
  );
}

// --- Liste des leçons de l'enfant, rangées par matière ---
function afficherLecons() {
  const enfant = etat.enfant;
  memoriserEcran();
  // « de » devient « d' » devant une voyelle : « Leçons d'Elouan », « Leçons d'Ava »
  entete(`Leçons ${/^[aeiouyéèêàâîôû]/i.test(enfant.nom) ? 'd’' : 'de '}${enfant.nom}`);
  const toutes = leconsDe(enfant.id);
  const lecons = toutes.filter((l) => !estArchivee(enfant.id, l));
  const archivees = toutes.filter((l) => estArchivee(enfant.id, l));

  // Bloc "📦 Leçons archivées" (replié par défaut), rangé lui aussi par matière.
  // Une ligne par SÉRIE : un parcours archivé apparaît une seule fois et ressort en entier.
  const seriesArchivees = (liste) => {
    const deja = new Set();
    return liste.filter((l) => !l.parcours || (!deja.has(l.parcours) && deja.add(l.parcours)));
  };
  const nbSeries = parMatiere(archivees).reduce((n, [, liste]) => n + seriesArchivees(liste).length, 0);
  const blocArchives = archivees.length ? el('details', { class: 'archives' },
    el('summary', {}, `📦 Leçons archivées (${nbSeries})`),
    parMatiere(archivees).map(([matiere, liste]) => el('section', { class: 'groupe' },
      el('h2', {}, matiere),
      seriesArchivees(liste).map((l) => el('div', { class: 'ligne-archive' },
        l.parcours
          ? el('button', { class: 'carte-lecon archivee', onclick: () => aller(afficherLecon, l) },
            el('span', { class: 'emoji' }, '🧩'),
            el('span', { class: 'infos' }, el('b', {}, l.parcours),
              el('small', { class: 'date-ajout' }, pluriel(serieDe(enfant.id, l).length, 'étape'))))
          : carteLecon(l, 'archivee'),
        el('button', {
          class: 'btn-petit', title: 'Remettre dans mes leçons',
          onclick: () => { archiverSerie(enfant.id, l, false); afficherLecons(); toast('📤 Remis dans tes leçons'); },
        }, '📤 Ressortir')))))) : null;

  // Élève ajouté depuis l'appli : petit bouton pour modifier son profil
  const btnProfil = enfant.perso ? el('button', { class: 'btn-petit btn-profil', onclick: () => aller(afficherProfilEleve, enfant) },
    '✏️ Modifier le profil de ', enfant.nom) : null;

  if (!lecons.length && !attentesDe(enfant.id).length) {
    afficher(el('div', { class: 'vide' },
      el('div', { class: 'gros-emoji' }, '📭'),
      el('p', {}, archivees.length ? 'Toutes tes leçons sont archivées 📦'
        : enfant.perso ? 'Pas encore de leçon : envoie la première en photo, ou décris ce qu’il faut réviser 👇'
          : 'Pas encore de leçon ici. Demande à Papa d’en ajouter 😉')),
      blocCoachLangues(), boutonEnvoi(), btnProfil, blocArchives);
    return;
  }

  // ⏳ Leçons en préparation : rangées dans leur matière (ou dans un groupe à elles, en haut)
  const attentes = attentesDe(enfant.id);
  const groupeDe = (a) => (a.matiere === 'Autre' ? '⏳ En préparation' : a.matiere);
  const groupes = parMatiere(lecons);
  for (const a of attentes) if (!groupes.some(([m]) => m === groupeDe(a))) groupes.unshift([groupeDe(a), []]);

  afficher(modeParent() ? tableauDeBordParent(lecons) : blocCoachLangues(), ...groupes.map(([matiere, liste]) =>
    el('section', { class: 'groupe' },
      el('h2', {}, matiere),
      attentes.filter((a) => groupeDe(a) === matiere).map(carteAttente),
      cartesDe(liste),
    )), boutonEnvoi(), btnProfil, blocArchives);
}

/* ---- ÉLÈVES AJOUTÉS DEPUIS L'APPLI ➕ ----
   Les profils de la famille sont dans lecons.json (public). Un utilisateur peut aussi créer
   un élève lui-même : prénom, âge, classe, copains, passions, difficultés, forces, envies.
   - Le profil est gardé DANS L'APPAREIL (localStorage), comme les étoiles.
   - Il est aussi envoyé à la boîte aux lettres, qui le range dans le dépôt PRIVÉ
     (eleves/<id>.json) : Claude le lit pour fabriquer des leçons sur mesure (exemples tirés
     de ses passions, prénoms des copains dans les problèmes, niveau adapté…).
     Ces infos personnelles ne vont JAMAIS dans lecons.json, qui est public.
   - Ses leçons sont des leçons normales de lecons.json avec "pour": ["<id>"].
   - Sur un autre téléphone, on le retrouve avec son code (= son identifiant, ex. « lea-7k2f »). */

const CLE_ELEVES = 'revisions-eleves';
const CLASSES = ['Maternelle', 'CP', 'CE1', 'CE2', 'CM1', 'CM2', '6e', '5e', '4e', '3e', 'Lycée'];
const AVATARS = ['🦊', '🐼', '🦄', '🐯', '🐸', '🐙', '🦖', '🐱', '🐶', '🚀', '⚽', '🎨'];
const COULEURS = ['#14b8a6', '#6366f1', '#f59e0b', '#ec4899', '#22c55e', '#0ea5e9', '#a855f7', '#ef4444'];

function lireEleves() { try { return JSON.parse(localStorage.getItem(CLE_ELEVES)) || []; } catch { return []; } }
function ecrireEleves(liste) { try { localStorage.setItem(CLE_ELEVES, JSON.stringify(liste)); } catch { /* rien */ } }

/** Tous les profils : ceux de lecons.json + ceux créés sur cet appareil (sans doublon d'id) */
function tousLesEnfants() {
  const locaux = lireEleves();
  // Enfants de la famille (lecons.json) : on y ajoute ce qu'on a décrit dans l'appli (passions, copains…),
  // gardé dans l'appareil sous { id, famille: true, … } — sans toucher à leurs réglages
  const famille = etat.donnees.enfants.map((f) => {
    const x = locaux.find((e) => e.id === f.id);
    return x ? { ...f, ...Object.fromEntries(CHAMPS_DESCRIPTION.filter((c) => x[c]).map((c) => [c, x[c]])) } : f;
  });
  return [...famille, ...locaux.filter((e) => !e.famille && !famille.some((f) => f.id === e.id))];
}
// Les champs « description » d'un profil, qu'on peut remplir pour tous les enfants
const CHAMPS_DESCRIPTION = ['passions', 'copains', 'forces', 'difficultes', 'envies'];

/** Identifiant d'un nouvel élève : prénom sans accents + 4 caractères au hasard (« Léa » -> « lea-7k2f ») */
function nouvelId(prenom) {
  const base = normaliser(prenom).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'eleve';
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Complète un profil avec les réglages de l'appli, déduits de sa classe :
 * maternelle et CP -> questions lues à voix haute, manches courtes et 2e essai (comme Ava, Malo, Elouan).
 * Fabrique aussi les consignes pour Alex (le coach vocal), à partir de ce qu'on a décrit.
 */
function reglagesDuProfil(p) {
  const petit = ['Maternelle', 'CP'].includes(p.classe);
  const phrases = [`${p.nom}${p.age ? ` a ${p.age} ans` : ''}${p.classe ? `, en ${p.classe}` : ''}.`];
  if (p.passions) phrases.push(`Ses passions : ${p.passions} (prends tes exemples dedans).`);
  if (p.forces) phrases.push(`Ses points forts : ${p.forces}.`);
  if (p.difficultes) phrases.push(`Ce qui est plus difficile pour lui ou elle : ${p.difficultes}. Avance par petites étapes et encourage.`);
  if (p.copains) phrases.push(`Ses copains : ${p.copains}.`);
  if (p.envies) phrases.push(`Ce que ses parents souhaitent : ${p.envies}.`);
  return {
    ...p,
    perso: true,
    lectureAuto: petit || undefined,
    coupDePouce: petit || !!p.difficultes || undefined,
    questionsParManche: p.classe === 'Maternelle' ? 5 : petit ? 6 : p.difficultes ? 10 : undefined,
    conseilsAlex: phrases.join(' '),
  };
}

/** Le profil tel qu'il part vers le dépôt privé (sans les réglages calculés) */
const profilAEnvoyer = (p) => ({
  id: p.id, nom: p.nom, age: p.age, classe: p.classe, avatar: p.avatar, couleur: p.couleur,
  copains: p.copains, passions: p.passions, difficultes: p.difficultes, forces: p.forces, envies: p.envies,
});

/** Envoi à la boîte aux lettres (code famille compris). Renvoie la réponse, ou lève une erreur lisible. */
async function posterBoite(corps, code) {
  const rep = await fetch(etat.donnees.envoi.url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...corps, code, version: VERSION }),
  }).catch(() => { throw new Error('📶 Envoi impossible : vérifie internet et réessaie.'); });
  const r = await rep.json().catch(() => ({}));
  if (r.erreur === 'code') { memoriserCode(''); throw Object.assign(new Error('Ce code famille n’est pas le bon 🔑'), { code: true }); }
  if (!rep.ok || !r.ok) throw new Error(r.message || `Envoi refusé (erreur ${rep.status})`);
  memoriserCode(code);
  return r;
}

/** Champ « code famille » réutilisable : caché s'il est déjà connu dans l'appareil */
function champCodeFamille() {
  const champ = el('input', { class: 'code-envoi', type: 'password', autocomplete: 'off', placeholder: 'Code famille' });
  const bloc = el('div', { class: 'bloc-code' }, el('label', {}, '🔑 Code famille (demandé une seule fois)'), champ);
  bloc.hidden = !!codeFamille();
  return {
    bloc,
    valeur: () => champ.value.trim() || codeFamille(),
    demander: () => { bloc.hidden = false; champ.value = ''; champ.focus(); },
  };
}

// --- L'écran « Nouvel élève » / « Modifier le profil » (eleve = null pour un nouveau) ---
function afficherProfilEleve(eleve) {
  etat.enfant = eleve;
  entete(eleve ? `Profil de ${eleve.nom}` : 'Nouvel élève');
  // Enfant de la famille (lecons.json) : prénom, âge, classe, avatar viennent du fichier et ne se
  // changent pas ici ; on peut seulement compléter sa description (passions, copains…)
  const famille = !!eleve && !eleve.perso;
  const p = { avatar: AVATARS[0], couleur: COULEURS[Math.floor(Math.random() * COULEURS.length)], ...(eleve || {}) };

  const champ = (cle, label, placeholder, lignes = 2) => {
    const c = lignes > 1
      ? el('textarea', { class: 'note-envoi', rows: String(lignes), maxlength: '600', placeholder })
      : el('input', { class: 'code-envoi', maxlength: '40', placeholder });
    c.value = p[cle] ?? '';
    c.addEventListener('input', () => { p[cle] = c.value; });
    return [el('h3', {}, label), c];
  };
  // Rangée de puces à choix unique (classe, avatar, couleur)
  const puces = (cle, valeurs, dessin = (v) => v, classe = '') => {
    const rangee = el('div', { class: 'puces-matiere ' + classe }, valeurs.map((v) => el('button', {
      class: 'puce' + (p[cle] === v ? ' choisie' : ''), style: cle === 'couleur' ? `--c:${v}` : '',
      onclick: (e) => {
        p[cle] = v;
        rangee.querySelectorAll('.puce').forEach((x) => x.classList.toggle('choisie', x === e.currentTarget));
      },
    }, dessin(v))));
    return rangee;
  };

  const champAge = el('input', { class: 'code-envoi champ-age', type: 'number', min: '2', max: '20', inputmode: 'numeric', placeholder: 'Âge' });
  champAge.value = p.age ?? '';
  champAge.addEventListener('input', () => { p.age = Number(champAge.value) || undefined; });
  const code = champCodeFamille();
  const message = el('p', { class: 'message-envoi' });
  const btn = el('button', { class: 'btn-principal', onclick: enregistrer }, eleve ? '✅ Enregistrer' : '✅ Créer le profil');

  async function enregistrer() {
    p.nom = String(p.nom || '').trim();
    if (!p.nom) { message.textContent = 'Il faut au moins un prénom 🙂'; return; }
    const profil = famille ? p : reglagesDuProfil({ ...p, id: p.id || nouvelId(p.nom) });
    // 1. Gardé dans l'appareil tout de suite (l'élève apparaît même sans internet).
    //    Enfant de la famille : on ne garde que sa description (ses réglages restent ceux de lecons.json)
    const aGarder = famille ? { id: p.id, nom: p.nom, famille: true,
      ...Object.fromEntries(CHAMPS_DESCRIPTION.map((c) => [c, p[c]])) } : profil;
    ecrireEleves([...lireEleves().filter((e) => e.id !== profil.id), aGarder]);
    // 2. Envoyé au dépôt privé, pour que Claude personnalise les leçons
    if (etat.donnees.envoi?.url) {
      const c = code.valeur();
      if (!c) { code.demander(); message.textContent = 'Tape le code famille 🔑 (sinon le profil reste seulement sur ce téléphone)'; return; }
      btn.disabled = true; btn.textContent = '⏳ Enregistrement…';
      try {
        await posterBoite({ type: 'eleve', enfant: profil.id, eleve: profilAEnvoyer(profil) }, c);
      } catch (err) {
        if (err.code) code.demander();
        message.textContent = err.message + ' (le profil est gardé sur ce téléphone)';
        btn.disabled = false; btn.textContent = '✅ Réessayer';
        return;
      }
    }
    son('fin');
    toast(eleve ? '✅ Profil mis à jour' : `🎉 Bienvenue ${profil.nom} !`);
    etat.enfant = tousLesEnfants().find((e) => e.id === profil.id) || profil;
    if (eleve) history.back();             // retour à ses leçons
    else remplacerEcran(afficherLecons);   // nouvel élève : on ouvre directement sa page
  }

  // Retrouver un élève créé sur un autre appareil, grâce à son code
  const champRetrouver = el('input', { class: 'code-envoi', placeholder: 'Son code, ex. lea-7k2f', autocapitalize: 'off' });
  async function retrouver() {
    const id = champRetrouver.value.trim().toLowerCase();
    if (!/^[a-z0-9-]{3,30}$/.test(id)) { message.textContent = 'Ce code ne ressemble pas à un code d’élève 🤔'; return; }
    const c = code.valeur();
    if (!c) { code.demander(); message.textContent = 'Tape le code famille 🔑'; return; }
    try {
      const r = await posterBoite({ type: 'retrouver-eleve', enfant: id }, c);
      const profil = reglagesDuProfil(r.eleve);
      ecrireEleves([...lireEleves().filter((e) => e.id !== profil.id), profil]);
      toast(`🎉 ${profil.nom} est sur ce téléphone`);
      etat.enfant = profil;
      remplacerEcran(afficherLecons);
    } catch (err) { if (err.code) code.demander(); message.textContent = err.message; }
  }

  afficher(el('div', { class: 'page-envoi page-profil' },
    el('p', { class: 'intro' }, eleve
      ? 'Plus on en dit, plus les leçons seront faites pour lui ou pour elle ✨'
      : 'Décris un peu l’élève : ses leçons seront fabriquées sur mesure (exemples tirés de ses passions, bon niveau, encouragements) ✨'),
    // Carte d'identité (enfant de la famille) ou champs à remplir (élève ajouté dans l'appli)
    famille ? el('div', { class: 'identite', style: `--c:${eleve.couleur || '#14b8a6'}` },
      dessinAvatar(eleve), el('div', {}, el('b', {}, eleve.nom),
        el('small', {}, [eleve.age ? `${eleve.age} ans` : '', eleve.classe || ''].filter(Boolean).join(' · ')))) : null,
    ...(famille ? [] : [
      ...champ('nom', 'Prénom', 'Prénom', 1),
      el('h3', {}, 'Âge'), champAge,
      el('h3', {}, 'Classe'), puces('classe', CLASSES),
      el('h3', {}, 'Avatar'), puces('avatar', AVATARS, (v) => v, 'puces-avatar'),
      el('h3', {}, 'Couleur'), puces('couleur', COULEURS, () => '', 'puces-couleur')]),
    ...champ('passions', '💛 Ses passions', 'Ex. : les dinosaures, le foot, le dessin…'),
    ...champ('copains', '👫 Ses copains', 'Ex. : Léo, Inès (pour les histoires des problèmes)'),
    ...champ('forces', '💪 Ses points forts', 'Ex. : calcule vite de tête, adore lire…'),
    ...champ('difficultes', '🧗 Ce qui est plus difficile', 'Ex. : confond b et d, se décourage vite… (pas besoin de diagnostic)'),
    ...champ('envies', '🎯 Ce que tu aimerais', 'Ex. : prendre confiance, réviser les tables avant le contrôle…', 3),
    el('div', { class: 'info-maj' }, el('span', { class: 'emoji' }, '🔒'),
      el('p', {}, 'Ces informations restent privées : elles servent seulement à fabriquer ses leçons. Elles ne sont jamais publiées dans l’appli.')),
    code.bloc, message, btn,
    eleve && !famille ? el('p', { class: 'code-eleve' }, 'Code de cet élève (pour le retrouver sur un autre téléphone) : ', el('b', {}, eleve.id)) : null,
    famille ? null : eleve ? el('button', {
      class: 'btn-secondaire btn-retirer', onclick: () => {
        if (!confirm(`Retirer ${eleve.nom} de ce téléphone ? (ses leçons restent en ligne, on pourra le retrouver avec son code)`)) return;
        ecrireEleves(lireEleves().filter((e) => e.id !== eleve.id));
        // Retour direct à l'accueil : on recule de plusieurs écrans d'un coup. Le gestionnaire
        // « popstate » ne dépile qu'UN écran : on ne garde donc que [accueil, cet écran] dans la pile.
        const ecrans = pile.length - 1;
        pile.length = 2;
        history.go(-ecrans);
      },
    }, '🗑️ Retirer de ce téléphone') : el('details', { class: 'retrouver' },
      el('summary', {}, '📲 Déjà créé sur un autre téléphone ?'),
      el('p', {}, 'Tape son code (il est écrit en bas de sa page « Modifier le profil ») :'),
      champRetrouver, el('button', { class: 'btn-secondaire', onclick: retrouver }, '🔎 Retrouver l’élève'))));
}

/* ---- ENVOYER UNE NOUVELLE LEÇON (photos) ----
   Le bouton « 📸 Envoyer une leçon » ouvre un écran où l'on prend la leçon en photo
   (une photo par page), puis on l'envoie à la « boîte aux lettres » : un petit service
   en ligne (Cloudflare Worker, dossier worker/) qui range les photos dans un dépôt GitHub
   PRIVÉ. Claude en fait ensuite une leçon animée, que Papa valide avant sa mise en ligne.
   - L'adresse du service est dans lecons.json : "envoi": { "url": "https://…workers.dev" }.
     Sans adresse, le bouton n'apparaît pas.
   - Un « code famille » est demandé au premier envoi, puis gardé dans le téléphone. */

const CLE_CODE_FAMILLE = 'revisions-code-famille';
const MATIERES_ENVOI = ['Maths', 'Français', 'Anglais', 'Histoire-Géo', 'Sciences', 'Autre'];

// Le bouton en bas de la liste des leçons (null si l'envoi n'est pas configuré)
function boutonEnvoi() {
  if (!etat.donnees.envoi?.url) return null;
  return el('button', { class: 'btn-envoi', onclick: () => aller(afficherEnvoi) },
    el('span', { class: 'emoji' }, '📸'),
    el('span', {}, el('b', {}, 'Ajouter une nouvelle leçon'), el('small', {}, 'Prends-la en photo ou décris ce qu’il faut réviser : on en fait une leçon animée ✨')));
}

/**
 * Réduit une photo avant l'envoi : 12 Mpx (4 Mo) -> environ 1800 px de large (≈ 300 Ko),
 * largement assez pour lire un cahier, et beaucoup plus rapide à envoyer en 4G.
 * createImageBitmap(…, { imageOrientation: 'from-image' }) remet la photo à l'endroit
 * (les téléphones notent la rotation à part, dans les informations « EXIF » du fichier).
 * Renvoie une « data URL » : le texte data:image/jpeg;base64,… de l'image.
 */
async function reduirePhoto(fichier, cote = 1800, qualite = 0.82) {
  const image = await createImageBitmap(fichier, { imageOrientation: 'from-image' });
  const echelle = Math.min(1, cote / Math.max(image.width, image.height));
  const toile = el('canvas');
  toile.width = Math.round(image.width * echelle);
  toile.height = Math.round(image.height * echelle);
  toile.getContext('2d').drawImage(image, 0, 0, toile.width, toile.height);
  image.close();
  const url = toile.toDataURL('image/jpeg', qualite);
  // Encore trop lourde (photo très détaillée) ? On recommence un cran plus petit.
  return url.length > 2_500_000 && cote > 1200 ? reduirePhoto(fichier, cote - 400, 0.75) : url;
}

/** Encadré « 🕵️ quand arrive la leçon ? ».
    La leçon est fabriquée tout de suite par Claude (robot « Leçon immédiate » du dépôt privé).
    Réglable dans lecons.json : "envoi": { "delai": "10 minutes" }. */
function infoMiseAJour() {
  const { delai = '10 minutes' } = etat.donnees.envoi || {};
  const insecable = (t) => t.replace(/ /g, '\u00a0');   // espace insécable : « 10 minutes » jamais coupé en deux
  return el('div', { class: 'info-maj' },
    el('span', { class: 'emoji' }, '🕵️'),
    el('p', {}, 'Nos meilleurs analystes préparent la leçon ! ',
      el('b', {}, `Actualise d’ici ${insecable(delai)}`), ' pour la voir. En attendant, elle apparaît en gris dans ta liste ⏳'));
}

/* ---- ⏳ LEÇONS EN PRÉPARATION, AJUSTEMENTS EN COURS, ACTUALISATION ----
   Après un envoi, la vraie leçon met quelques minutes à arriver. En attendant :
   - une carte GRISÉE « ⏳ en préparation » est gardée dans l'appareil et affichée dans la liste,
     dans sa matière. Elle disparaît toute seule dès que la vraie leçon est là : le robot écrit
     dans chaque leçon créée le nom de la demande ("demande": "2026-11-11-2329-ab12"), qu'on compare
     au nom renvoyé par la boîte aux lettres (secours : une nouvelle leçon pour cet enfant
     plus de 15 min après, ou 24 h écoulées) ;
   - une leçon dont on a demandé l'ajustement porte un badge 🛠️ jusqu'à ce que son contenu change ;
   - le bouton « 🔄 Actualiser » relit lecons.json SANS recharger la page (on reste sur l'écran). */

const CLE_ATTENTES = 'revisions-en-preparation';    // [{ enfant, dossier, matiere, titre, quand, connues }]
const CLE_AJUSTEMENTS = 'revisions-ajustements';    // { "enfant|idLecon": { quand, empreinte } }
const MINUTE = 60 * 1000;

const lireStock = (cle, defaut) => { try { return JSON.parse(localStorage.getItem(cle)) ?? defaut; } catch { return defaut; } };
const ecrireStock = (cle, v) => { try { localStorage.setItem(cle, JSON.stringify(v)); } catch { /* rien */ } };

function ajouterAttente(enfant, { dossier, matiere, note, photos }) {
  const titre = note && !photos ? note.slice(0, 60) + (note.length > 60 ? '…' : '')
    : `Leçon en photo (${pluriel(photos, 'page')})`;
  ecrireStock(CLE_ATTENTES, [...lireStock(CLE_ATTENTES, []), {
    enfant: enfant.id, dossier: String(dossier || '').split('/').pop(), matiere, titre, quand: Date.now(),
    connues: leconsDe(enfant.id).map((l) => l.id),     // les leçons qui existaient AVANT l'envoi
  }]);
}

/** Les attentes encore valables pour cet enfant (et ménage de celles qui sont arrivées) */
function attentesDe(idEnfant) {
  const lecons = leconsDe(idEnfant);
  const arrivee = (a) =>
    (a.dossier && lecons.some((l) => l.demande === a.dossier))                       // la vraie leçon est là
    || (Date.now() - a.quand > 15 * MINUTE && lecons.some((l) => !a.connues.includes(l.id))) // secours
    || Date.now() - a.quand > 24 * 60 * MINUTE;                                       // trop vieille
  const toutes = lireStock(CLE_ATTENTES, []);
  const restantes = toutes.filter((a) => a.enfant !== idEnfant || !arrivee(a));
  if (restantes.length !== toutes.length) ecrireStock(CLE_ATTENTES, restantes);
  return restantes.filter((a) => a.enfant === idEnfant);
}

/** Carte grisée d'une leçon en préparation ; la toucher = actualiser */
function carteAttente(a) {
  const minutes = Math.round((Date.now() - a.quand) / MINUTE);
  const { contact = 'Seb' } = etat.donnees.envoi || {};
  return el('button', { class: 'carte-lecon en-preparation', onclick: () => actualiser() },
    el('span', { class: 'emoji' }, '⏳'),
    el('span', { class: 'infos' }, el('b', {}, a.titre),
      el('small', { class: 'date-ajout' }, minutes < 30
        ? `En préparation par nos meilleurs analystes… (envoyée il y a ${minutes < 1 ? 'moins d’une minute' : pluriel(minutes, 'minute')})`
        : `Toujours en préparation… Si rien n’arrive, préviens ${contact} 📱`)),
    el('span', { class: 'actualiser' }, '🔄'));
}

// Empreinte d'une leçon (son contenu) : sert à voir qu'un ajustement a été fait
const empreinteLecon = (l) => empreinte(JSON.stringify({ ...l, demande: undefined }));
function noterAjustement(idEnfant, lecon) {
  const a = lireStock(CLE_AJUSTEMENTS, {});
  a[`${idEnfant}|${lecon.id}`] = { quand: Date.now(), empreinte: empreinteLecon(lecon) };
  ecrireStock(CLE_AJUSTEMENTS, a);
}
/** Vrai si un ajustement est demandé et pas encore arrivé (contenu inchangé, moins de 24 h) */
function ajustementEnCours(idEnfant, lecon) {
  const a = lireStock(CLE_AJUSTEMENTS, {});
  const cle = `${idEnfant}|${lecon.id}`;
  const x = a[cle];
  if (!x) return false;
  if (x.empreinte !== empreinteLecon(lecon) || Date.now() - x.quand > 24 * 60 * MINUTE) {
    delete a[cle]; ecrireStock(CLE_AJUSTEMENTS, a);
    return false;
  }
  return true;
}

/**
 * 🔄 Relit lecons.json et redessine l'écran affiché, sans recharger la page
 * (on reste donc sur la même page). Si les leçons demandent un moteur plus récent,
 * on recharge vraiment : la page reviendra au même endroit grâce à l'écran mémorisé.
 */
async function actualiser({ discret = false } = {}) {
  if (!discret) toast('🔄 Actualisation…');
  try {
    const rep = await fetch('lecons.json', { cache: 'no-store' });
    if (!rep.ok) throw new Error();
    const donnees = await rep.json();
    if (donnees.versionApp && plusAncienne(VERSION, donnees.versionApp)) { location.reload(); return; }
    etat.donnees = donnees;
    // Les écrans de la pile gardent d'anciennes copies des leçons : on les remplace par les neuves
    const neuve = (x) => (x && typeof x === 'object' && donnees.lecons.find((l) => l.id === x.id)) || x;
    pile.forEach((e) => { e[1] = e[1].map(neuve); });
    if (etat.enfant) etat.enfant = tousLesEnfants().find((e) => e.id === etat.enfant.id) || etat.enfant;
    const [fonctionEcran, args] = pile.at(-1);
    // On ne redessine que les écrans « de lecture » (pas un quiz en cours ni un formulaire)
    if ([afficherAccueil, afficherLecons, afficherLecon].includes(fonctionEcran)) fonctionEcran(...args);
    if (!discret) toast('✅ À jour');
  } catch {
    if (!discret) toast('📶 Impossible d’actualiser : vérifie internet');
  }
}

/* Écran mémorisé : après une actualisation de la page (ou en rouvrant l'appli peu après),
   on revient sur la même page au lieu de l'accueil. Valable 2 heures. */
const CLE_ECRAN = 'revisions-ecran';
function memoriserEcran(lecon = null) {
  ecrireStock(CLE_ECRAN, etat.enfant ? { enfant: etat.enfant.id, lecon: lecon?.id || null, quand: Date.now() } : null);
}
function restaurerEcran() {
  const m = lireStock(CLE_ECRAN, null);
  if (!m || Date.now() - m.quand > 2 * 60 * MINUTE) return false;
  const enfant = tousLesEnfants().find((e) => e.id === m.enfant);
  if (!enfant) return false;
  etat.enfant = enfant;
  aller(afficherLecons);
  const lecon = m.lecon && leconsDe(enfant.id).find((l) => l.id === m.lecon);
  if (lecon) aller(afficherLecon, lecon);
  return true;
}

// --- L'écran « Nouvelle leçon » ---
function afficherEnvoi() {
  const enfant = etat.enfant;
  entete('Nouvelle leçon');
  // L'état de l'écran (perdu si on quitte l'écran : c'est voulu)
  const choix = { matiere: null, photos: [] };   // photos = data URLs déjà réduites

  // Deux champs « fichier » cachés : l'un ouvre directement l'appareil photo (capture),
  // l'autre la galerie (plusieurs photos à la fois). Les boutons visibles les déclenchent.
  const champCamera = el('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: '' });
  const champGalerie = el('input', { type: 'file', accept: 'image/*', multiple: '', hidden: '' });
  const vignettes = el('div', { class: 'vignettes' });
  // Sans photo, ce texte EST la demande (« la table de 7, il confond 7 × 6 et 7 × 8 ») : il faut au moins 10 caractères.
  const note = el('textarea', { class: 'note-envoi', rows: '4', maxlength: '1500',
    placeholder: 'Ex. : « La table de 7 pour jeudi, il confond 7 × 6 et 7 × 8 » ou « Les verbes du 1er groupe au futur ». Avec des photos : un petit mot (pour quand, ce qui est difficile…)' });
  const assezDecrit = () => note.value.trim().length >= 10;
  const codeSauve = (() => { try { return localStorage.getItem(CLE_CODE_FAMILLE) || ''; } catch { return ''; } })();
  const champCode = el('input', { class: 'code-envoi', type: 'password', autocomplete: 'off', placeholder: 'Code famille' });
  const blocCode = el('div', { class: 'bloc-code' },
    el('label', {}, '🔑 Code famille (demandé une seule fois)'), champCode);
  blocCode.hidden = !!codeSauve;
  const message = el('p', { class: 'message-envoi' });
  const btnEnvoyer = el('button', { class: 'btn-principal', onclick: envoyer }, '📤 Envoyer');

  // Puces de matière : une seule choisie à la fois
  const puces = el('div', { class: 'puces-matiere' }, MATIERES_ENVOI.map((m) =>
    el('button', { class: 'puce', onclick: (e) => {
      choix.matiere = m;
      puces.querySelectorAll('.puce').forEach((p) => p.classList.toggle('choisie', p === e.currentTarget));
    } }, m)));

  function majEcran() {
    vignettes.replaceChildren(...choix.photos.map((url, i) => el('div', { class: 'vignette' },
      el('img', { src: url, alt: `Page ${i + 1}` }),
      el('span', { class: 'num' }, i + 1),
      el('button', { class: 'retirer', 'aria-label': 'Retirer cette photo',
        onclick: () => { choix.photos.splice(i, 1); majEcran(); } }, '✖'))));
    // On peut envoyer des photos, OU seulement une description du besoin
    btnEnvoyer.disabled = !choix.photos.length && !assezDecrit();
    btnEnvoyer.textContent = choix.photos.length
      ? `📤 Envoyer (${pluriel(choix.photos.length, 'photo')})` : '📤 Envoyer la demande';
  }
  note.addEventListener('input', majEcran);

  async function ajouter(e) {
    const fichiers = [...e.target.files].slice(0, 8 - choix.photos.length);
    e.target.value = '';                        // pour pouvoir reprendre la même photo
    if (!fichiers.length) return;
    message.textContent = '⏳ Préparation des photos…';
    for (const f of fichiers) {
      try { choix.photos.push(await reduirePhoto(f)); } catch { toast('Cette image n’a pas pu être lue'); }
    }
    message.textContent = choix.photos.length >= 8 ? 'C’est le maximum : 8 photos par envoi.' : '';
    majEcran();
  }
  champCamera.addEventListener('change', ajouter);
  champGalerie.addEventListener('change', ajouter);

  async function envoyer() {
    const code = champCode.value.trim() || codeSauve;
    if (!code) { blocCode.hidden = false; champCode.focus(); message.textContent = 'Tape le code famille 🔑'; return; }
    if (!navigator.onLine) { message.textContent = '📶 Pas d’internet : réessaie quand tu seras connecté.'; return; }
    btnEnvoyer.disabled = true;
    btnEnvoyer.textContent = '⏳ Envoi en cours…';
    message.textContent = '';
    try {
      const rep = await fetch(etat.donnees.envoi.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, enfant: enfant.id, matiere: choix.matiere || 'Autre',
          note: note.value.trim(), photos: choix.photos, version: VERSION,
          // Élève ajouté depuis l'appli : son profil voyage avec la demande (Claude s'en sert pour personnaliser)
          eleve: enfant.perso ? profilAEnvoyer(enfant) : undefined }),
      });
      const r = await rep.json().catch(() => ({}));
      if (r.erreur === 'code') {               // mauvais code : on l'oublie et on le redemande
        try { localStorage.removeItem(CLE_CODE_FAMILLE); } catch { /* rien */ }
        blocCode.hidden = false; champCode.value = ''; champCode.focus();
        throw new Error('Ce code famille n’est pas le bon 🔑');
      }
      if (!rep.ok || !r.ok) throw new Error(r.message || `Envoi refusé (erreur ${rep.status})`);
      try { localStorage.setItem(CLE_CODE_FAMILLE, code); } catch { /* navigation privée : tant pis */ }
      son('fin'); confettis();
      // ⏳ Leçon « en préparation » affichée en gris dans la liste jusqu'à l'arrivée de la vraie
      ajouterAttente(enfant, { dossier: r.dossier, matiere: choix.matiere || 'Autre',
        note: note.value.trim(), photos: choix.photos.length });
      remplacerEcran(afficherEnvoiReussi, choix.photos.length);
    } catch (err) {
      message.textContent = err.message.includes('Failed to fetch') ? '📶 Envoi impossible : vérifie internet et réessaie.' : err.message;
      majEcran();
    }
  }

  afficher(el('div', { class: 'page-envoi' },
    el('p', { class: 'intro' }, `Prends la leçon de ${enfant.nom} en photo (une photo par page, bien à plat et lisible), `
      + 'ou décris simplement ce qu’il faut réviser. On en fera une leçon animée ✨'),
    infoMiseAJour(),
    el('h3', {}, '1. La matière'), puces,
    el('h3', {}, '2. Les photos ', el('small', {}, '(facultatif si tu décris le besoin)')),
    el('div', { class: 'boutons-photo' },
      el('button', { class: 'btn-secondaire', onclick: () => champCamera.click() }, '📷 Prendre une photo'),
      el('button', { class: 'btn-secondaire', onclick: () => champGalerie.click() }, '🖼️ Galerie')),
    vignettes, champCamera, champGalerie,
    el('h3', {}, '3. Décris le besoin ', el('small', {}, '(obligatoire sans photo)')), note,
    blocCode, message, btnEnvoyer));
  majEcran();
}

// --- Écran de confirmation ---
function afficherEnvoiReussi(nb) {
  entete('C’est envoyé !');
  afficher(el('div', { class: 'vide envoi-reussi' },
    el('div', { class: 'gros-emoji' }, '📬'),
    el('h2', {}, 'Demande bien reçue !'),
    el('p', {}, nb ? `${pluriel(nb, 'photo')} envoyée${nb > 1 ? 's' : ''}. ` : 'Ta description est envoyée. ',
      'La leçon animée arrivera bientôt dans l’appli ✨'),
    infoMiseAJour(),
    el('button', { class: 'btn-principal', onclick: () => history.back() }, '← Retour à mes leçons')));
}

/* ---- REMARQUES SUR UNE LEÇON 💬 ----
   Une petite bulle 💬 sur chaque bloc de la fiche et sur chaque question. On la touche,
   on choisit un motif (trop difficile, une erreur…) et/ou on écrit un mot : la remarque part
   vers la même boîte aux lettres que les photos, AVEC L'ENDROIT EXACT (leçon, bloc ou question).
   Chaque soir, Claude en fait un récapitulatif pour Papa (ticket GitHub + notification),
   sans rien corriger tout seul. */

const MOTIFS_REMARQUE = ['😵 Trop difficile', '🐞 Il y a une erreur', '🤔 Je ne comprends pas', '😴 Trop long', '😍 J’adore !'];

// Le code famille gardé dans le téléphone (le même que pour l'envoi de photos)
const codeFamille = () => { try { return localStorage.getItem(CLE_CODE_FAMILLE) || ''; } catch { return ''; } };
const memoriserCode = (code) => { try { code ? localStorage.setItem(CLE_CODE_FAMILLE, code) : localStorage.removeItem(CLE_CODE_FAMILLE); } catch { /* rien */ } };

/** La bulle 💬 (null si la boîte aux lettres n'est pas configurée) */
function boutonRemarque(lecon, endroit) {
  if (!etat.donnees.envoi?.url || !lecon) return null;
  return el('button', {
    class: 'btn-remarque', title: 'Faire une remarque à cet endroit', 'aria-label': 'Faire une remarque',
    onclick: (e) => { e.stopPropagation(); ouvrirRemarque(lecon, endroit); },
  }, '💬');
}

/** Le panneau qui monte du bas de l'écran pour écrire la remarque */
function ouvrirRemarque(lecon, endroit) {
  document.querySelector('.feuille-fond')?.remove();
  const choisis = new Set();
  const texte = el('textarea', { class: 'note-envoi', rows: '3', maxlength: '1000', placeholder: 'Explique en quelques mots (facultatif)' });
  const champCode = el('input', { class: 'code-envoi', type: 'password', autocomplete: 'off', placeholder: 'Code famille' });
  const blocCode = el('div', { class: 'bloc-code' }, el('label', {}, '🔑 Code famille'), champCode);
  blocCode.hidden = !!codeFamille();
  const message = el('p', { class: 'message-envoi' });
  const fermer = () => fond.remove();
  const btn = el('button', { class: 'btn-principal', onclick: envoyer }, '📤 Envoyer la remarque');

  async function envoyer() {
    const code = champCode.value.trim() || codeFamille();
    if (!choisis.size && !texte.value.trim()) { message.textContent = 'Choisis un motif ou écris un petit mot 🙂'; return; }
    if (!code) { blocCode.hidden = false; champCode.focus(); message.textContent = 'Tape le code famille 🔑'; return; }
    btn.disabled = true; btn.textContent = '⏳ Envoi…'; message.textContent = '';
    try {
      const rep = await fetch(etat.donnees.envoi.url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'remarque', code, enfant: etat.enfant?.id || 'inconnu',
          lecon: lecon.id, titreLecon: lecon.titre, endroit, motifs: [...choisis],
          texte: texte.value.trim(), version: VERSION }),
      });
      const r = await rep.json().catch(() => ({}));
      if (r.erreur === 'code') { memoriserCode(''); blocCode.hidden = false; champCode.value = ''; throw new Error('Ce code famille n’est pas le bon 🔑'); }
      if (!rep.ok || !r.ok) throw new Error(r.message || `Envoi refusé (erreur ${rep.status})`);
      memoriserCode(code);
      fermer(); son('petit'); toast('📬 Merci ! Remarque envoyée');
    } catch (err) {
      message.textContent = err.message.includes('Failed to fetch') ? '📶 Envoi impossible : vérifie internet.' : err.message;
      btn.disabled = false; btn.textContent = '📤 Envoyer la remarque';
    }
  }

  const ou = endroit.type === 'bloc' ? `la partie « ${endroit.titre} »` : `la question « ${endroit.titre} »`;
  // Le fond grisé : toucher à côté du panneau le ferme
  const fond = el('div', { class: 'feuille-fond', onclick: (e) => { if (e.target === fond) fermer(); } },
    el('div', { class: 'feuille', role: 'dialog', 'aria-label': 'Faire une remarque' },
      el('div', { class: 'feuille-tete' }, el('b', {}, '💬 Une remarque ?'),
        el('button', { class: 'feuille-fermer', 'aria-label': 'Fermer', onclick: fermer }, '✖')),
      el('p', { class: 'feuille-ou' }, `Sur ${ou} — leçon « ${lecon.titre} »`),
      el('div', { class: 'puces-matiere' }, MOTIFS_REMARQUE.map((m) => el('button', {
        class: 'puce', onclick: (e) => { choisis.has(m) ? choisis.delete(m) : choisis.add(m); e.currentTarget.classList.toggle('choisie'); },
      }, m))),
      texte, blocCode, message, btn));
  document.body.append(fond);
}

/* ---- AJUSTER UNE LEÇON 🛠️ ----
   Contrairement aux remarques 💬 (rassemblées pour Papa le soir, jamais corrigées toutes seules),
   un AJUSTEMENT est une demande explicite de modifier la leçon : « plus facile », « plus court »,
   « il y a une erreur »… Il part vers la boîte aux lettres (dépôt privé, ajustements/<enfant>/…)
   et le robot « Leçon immédiate » modifie la leçon dans lecons.json en quelques minutes. */

const CHOIX_AJUSTEMENT = ['🪶 Plus facile', '🧗 Plus difficile', '➕ Plus de questions', '✂️ Plus court',
  '🖼️ Plus d’exemples et d’images', '🎯 Avec ses passions', '🐞 Corriger une erreur'];

function ouvrirAjustement(lecon) {
  document.querySelector('.feuille-fond')?.remove();
  const choisis = new Set();
  const texte = el('textarea', { class: 'note-envoi', rows: '3', maxlength: '1000',
    placeholder: 'Précise si besoin : « la question sur 7 × 8 est fausse », « ajoute des problèmes avec des billes »…' });
  const code = champCodeFamille();
  const message = el('p', { class: 'message-envoi' });
  const fermer = () => fond.remove();
  const btn = el('button', { class: 'btn-principal', onclick: envoyer }, '📤 Demander l’ajustement');

  async function envoyer() {
    if (!choisis.size && texte.value.trim().length < 5) { message.textContent = 'Choisis ce qu’il faut changer, ou explique-le en quelques mots 🙂'; return; }
    const c = code.valeur();
    if (!c) { code.demander(); message.textContent = 'Tape le code famille 🔑'; return; }
    btn.disabled = true; btn.textContent = '⏳ Envoi…'; message.textContent = '';
    try {
      await posterBoite({ type: 'ajustement', enfant: etat.enfant.id, lecon: lecon.id, titreLecon: lecon.titre,
        choix: [...choisis], texte: texte.value.trim(),
        eleve: etat.enfant.perso ? profilAEnvoyer(etat.enfant) : undefined }, c);
      fermer(); son('petit');
      noterAjustement(etat.enfant.id, lecon);       // badge « 🛠️ en cours » jusqu'à ce que la leçon change
      afficherLecon(lecon);
      toast('🛠️ Demande envoyée : actualise d’ici 10 minutes');
    } catch (err) {
      if (err.code) code.demander();
      message.textContent = err.message;
      btn.disabled = false; btn.textContent = '📤 Demander l’ajustement';
    }
  }

  const fond = el('div', { class: 'feuille-fond', onclick: (e) => { if (e.target === fond) fermer(); } },
    el('div', { class: 'feuille', role: 'dialog', 'aria-label': 'Demander un ajustement' },
      el('div', { class: 'feuille-tete' }, el('b', {}, '🛠️ Ajuster la leçon'),
        el('button', { class: 'feuille-fermer', 'aria-label': 'Fermer', onclick: fermer }, '✖')),
      el('p', { class: 'feuille-ou' }, `« ${lecon.titre} » — qu’est-ce qu’on change ?`),
      el('div', { class: 'puces-matiere' }, CHOIX_AJUSTEMENT.map((m) => el('button', {
        class: 'puce', onclick: (e) => { choisis.has(m) ? choisis.delete(m) : choisis.add(m); e.currentTarget.classList.toggle('choisie'); },
      }, m))),
      texte, code.bloc, message, btn));
  document.body.append(fond);
}

/* ---- 👪 MODE PARENT ----
   Pour tous les enfants (depuis la v1.25.0 ; d'abord testé avec Gaby).
   Le petit bouton « parent » (deux silhouettes) à côté de l'avatar (en haut à droite) l'active ou le coupe ; l'en-tête
   devient violet pour qu'on voie tout de suite qu'on est « côté parent ».

   Ce qui change :
   - LISTE DES LEÇONS : un tableau de bord en haut (révisions des 7 derniers jours, étoiles,
     « à revoir en priorité ») et, sur chaque leçon, le dernier bilan fait avec le parent ;
   - PAGE D'UNE LEÇON : un GUIDE pour faire réciter l'enfant en 10 minutes :
       🎯 l'essentiel à vérifier, 🔁 ce qui a coincé à son dernier quiz,
       🗣️ des questions à poser (réponse cachée + « Sait / Hésite / À revoir »),
       ⚠️ les pièges, 💡 si elle bloque, 🎲 un défi à faire ensemble, puis un bilan.
   Le contenu vient du bloc "parent" de la leçon dans lecons.json :
     "parent": { "essentiel": […], "questions": [{ "q": "…", "r": "…" }], "pieges": […],
                 "aide": […], "defi": "…" }
   Sans bloc "parent", le guide est fabriqué à partir de la fiche (titres) et du quiz (questions + réponses).
   Les bilans sont gardés dans l'appareil (comme les étoiles). */

/* Picto du mode parent : un adulte et un enfant, dessinés en SVG (l'emoji 👪 s'affichait
   en carré gris sur certains téléphones). currentColor = prend la couleur du texte du bouton. */
const PICTO_PARENT = `<svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true" fill="currentColor">
  <circle cx="11.5" cy="7.5" r="4.2"/><path d="M4 27v-6.5C4 15.9 7.4 13 11.5 13s7.5 2.9 7.5 7.5V27z"/>
  <circle cx="23.5" cy="14" r="3.2"/><path d="M18.5 27v-4.2c0-3.2 2.2-5.3 5-5.3s5 2.1 5 5.3V27z"/></svg>`;

/* Le mode ENFANT est le mode par défaut (v1.27.0) : le mode parent n'est plus gardé dans le
   téléphone. Il est retenu seulement dans cette variable : il s'éteint en revenant à l'accueil,
   en changeant d'enfant ou en rouvrant l'appli. (Avant, il restait allumé d'une fois sur l'autre.) */
let modeParentPour = '';   // id de l'enfant dont le mode parent est allumé ('' = mode enfant)
try { localStorage.removeItem('revisions-mode-parent'); } catch { /* rien */ }   // ménage de l'ancienne version
const CLE_BILANS = 'revisions-bilans-parent';      // { gaby: { idLecon: { quand, notes: [2,1,0…], total } } }

// Depuis la v1.25.0 : disponible pour TOUS les enfants (plus besoin de "modeParent": true)
const modeParent = () => !!etat.enfant && modeParentPour === etat.enfant.id;

function basculerModeParent() {
  const allume = !modeParent();
  modeParentPour = allume ? etat.enfant.id : '';
  toast(allume ? 'Mode parent activé' : '🧒 Retour au mode enfant');
  // On redessine l'écran affiché (liste ou leçon) dans le bon mode
  const [fonctionEcran, args] = pile.at(-1);
  if ([afficherLecons, afficherLecon].includes(fonctionEcran)) fonctionEcran(...args);
  else entete($('#titre').textContent);
}

/** Une activité du quiz -> { q, r } lisibles par un parent (sans les {{ }} des mots étrangers) */
function questionReponse(a) {
  const net = (t) => sansMots(String(t ?? ''));
  const liste = (x) => (Array.isArray(x) ? x : [x]).map(net);
  switch (a.type) {
    case 'qcm': return { q: net(a.question), r: net(a.choix?.[0]) };
    case 'vraifaux': return { q: `Vrai ou faux : « ${net(a.affirmation)} »`, r: (a.reponse ? 'Vrai' : 'Faux') + (a.explication ? ` — ${net(a.explication)}` : '') };
    case 'saisie': return { q: net(a.question), r: liste(a.reponse)[0] };
    case 'trous': return { q: `Complète : ${net(a.texte).replace(/\[[^\]]+\]/g, '…')}`, r: [...net(a.texte).matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]).join(' · ') };
    case 'paires': return { q: `${net(a.consigne || 'Associe')} : ${(a.paires || []).map((p) => net(p[0])).join(', ')}`, r: (a.paires || []).map((p) => `${net(p[0])} → ${net(p[1])}`).join(' · ') };
    case 'ordre': return { q: net(a.consigne || 'Remets dans l’ordre'), r: liste(a.elements).join(' → ') };
    case 'carte': return { q: net(a.recto), r: net(a.verso) };
    default: return { q: net(a.question || a.consigne || ''), r: '' };
  }
}

/** Le guide d'une leçon : son bloc "parent", complété automatiquement par la fiche et le quiz */
function guideDe(lecon) {
  const g = lecon.parent || {};
  const titres = (lecon.fiche || []).filter((l) => typeof l === 'string' && /^#{1,2} /.test(l)).map((l) => sansMots(l.replace(/^#+ /, '')));
  return {
    essentiel: g.essentiel?.length ? g.essentiel : titres.map((t) => `Sait expliquer : **${t}**`),
    questions: g.questions?.length ? g.questions
      : (lecon.activites || []).map(questionReponse).filter((x) => x.q && x.r).slice(0, 8),
    pieges: g.pieges || [], aide: g.aide || [], defi: g.defi || '', duree: g.duree || '10 min',
  };
}

/** Le dernier bilan parent d'une leçon (ou null) */
const bilanDe = (idEnfant, idLecon) => lireStock(CLE_BILANS, {})[idEnfant]?.[idLecon] || null;
function enregistrerBilan(idEnfant, idLecon, notes) {
  const b = lireStock(CLE_BILANS, {});
  b[idEnfant] ??= {};
  b[idEnfant][idLecon] = { quand: Date.now(), notes };
  ecrireStock(CLE_BILANS, b);
}
const dateCourte = (t) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
/** « 👪 5/7 le 11 nov. » : nombre de questions sues au dernier bilan */
function resumeBilan(b) {
  const notes = (b?.notes || []).filter((n) => n !== null && n !== undefined);
  if (!notes.length) return null;
  return `✅ ${notes.filter((n) => n === 2).length}/${notes.length} sues le ${dateCourte(b.quand)}`;
}

/** Tableau de bord en haut de la liste des leçons (mode parent) */
function tableauDeBordParent(lecons) {
  const id = etat.enfant.id;
  const progres = lireProgres()[id] || {};
  const semaine = Date.now() - 7 * 24 * 60 * MINUTE;
  const recentes = lecons.filter((l) => progres[l.id]?.dernier > semaine);
  const etoiles = lecons.reduce((s, l) => s + (progres[l.id]?.etoiles || 0), 0);
  // Priorités : jamais faite, score < 70 %, ou des « à revoir » au dernier bilan parent
  const priorite = (l) => {
    const p = progres[l.id];
    const aRevoir = (bilanDe(id, l.id)?.notes || []).filter((n) => n === 0).length;
    if (aRevoir) return { score: 3 + aRevoir, pourquoi: `${pluriel(aRevoir, 'point')} à revoir au dernier bilan` };
    // Un quiz raté passe avant une leçon jamais faite : on sait déjà qu'il y a quelque chose à reprendre
    if (p && p.meilleur < 70) return { score: 2 + (70 - p.meilleur) / 100, pourquoi: `meilleur score ${p.meilleur} %` };
    if (!p) return { score: 1, pourquoi: 'jamais révisée' };
    return null;
  };
  const aRevoir = lecons.map((l) => ({ l, p: priorite(l) })).filter((x) => x.p)
    .sort((a, b) => b.p.score - a.p.score).slice(0, 3);
  return el('section', { class: 'tableau-parent' },
    el('div', { class: 'tp-tete' }, el('b', { class: 'tp-titre' }, el('span', { html: PICTO_PARENT }), ` Mode parent · ${etat.enfant.nom}`),
      el('button', { class: 'btn-petit', onclick: basculerModeParent }, '🧒 Mode enfant')),
    el('div', { class: 'tp-chiffres' },
      el('div', {}, el('b', {}, recentes.length), el('small', {}, 'leçons révisées\ncette semaine')),
      el('div', {}, el('b', {}, `⭐ ${etoiles}`), el('small', {}, `sur ${lecons.length * 3} possibles`)),
      el('div', {}, el('b', {}, Object.keys(lireStock(CLE_BILANS, {})[id] || {}).length), el('small', {}, 'bilans\nfaits ensemble'))),
    aRevoir.length ? el('div', { class: 'tp-priorites' }, el('h3', {}, '🎯 À revoir en priorité'),
      aRevoir.map(({ l, p }) => el('button', { class: 'tp-priorite', onclick: () => aller(afficherLecon, l) },
        el('span', {}, l.emoji || '📘'), el('span', {}, el('b', {}, titreSurDeuxLignes(l.titre)), el('small', {}, p.pourquoi)), el('span', {}, '›'))))
      : el('p', { class: 'tp-bravo' }, '🎉 Rien d’urgent : toutes les leçons sont bien révisées !'),
    el('p', { class: 'tp-aide' }, 'Touche une leçon : tu auras les questions à lui poser, les réponses, les pièges et un défi à faire ensemble (10 min).'));
}

/** La page d'une leçon en mode parent : le guide pour faire réciter */
function guideParent(lecon) {
  const id = etat.enfant.id;
  const prenom = etat.enfant.nom;
  const g = guideDe(lecon);
  const p = lireProgres()[id]?.[lecon.id];
  const ancien = bilanDe(id, lecon.id);
  const notes = g.questions.map(() => null);       // 2 = sait, 1 = hésite, 0 = à revoir
  const bilan = el('div', { class: 'gp-bilan' });
  const fmt = (t) => el('span', { html: miseEnForme(sansMots(t)).replace(/^<p>|<\/p>$/g, '') });
  const liste = (items) => el('ul', {}, items.map((t) => el('li', {}, fmt(t))));

  // Le bilan se met à jour à chaque note, et il est enregistré tout de suite
  function majBilan() {
    const faites = notes.filter((n) => n !== null);
    if (!faites.length) { bilan.replaceChildren(); return; }
    enregistrerBilan(id, lecon.id, notes);
    const sues = faites.filter((n) => n === 2).length;
    const aRevoir = g.questions.filter((_, i) => notes[i] === 0);
    const conseil = faites.length < notes.length ? `Encore ${notes.length - faites.length} question(s) à poser.`
      : sues === notes.length ? `Parfait ! ${prenom} maîtrise cette leçon : un quiz pour gagner les ⭐, puis on peut l’archiver.`
        : aRevoir.length ? `Relisez ensemble la fiche sur les points à revoir, puis lancez le quiz.`
          : `Presque ! Un dernier passage sur le quiz pour fixer les hésitations.`;
    bilan.replaceChildren(el('h3', {}, '📋 Bilan'),
      el('p', {}, el('b', {}, `${sues} / ${faites.length}`), ' sues du premier coup', faites.length < notes.length ? ` (sur ${notes.length})` : ''),
      aRevoir.length ? el('div', {}, el('small', {}, 'À revoir :'), liste(aRevoir.map((x) => x.q))) : null,
      el('p', { class: 'gp-conseil' }, '💡 ', conseil));
  }

  const questions = g.questions.map((x, i) => {
    const reponse = el('div', { class: 'gp-reponse', hidden: '' }, '✅ ', fmt(x.r));
    // 3 boutons ; celui choisi se remplit de sa couleur (vert / orange / rouge), les autres pâlissent
    const notes3 = el('div', { class: 'gp-notes' }, [[2, '✅ Sait', 'sait'], [1, '🤏 Hésite', 'hesite'], [0, '❌ À revoir', 'revoir']].map(([n, t, c]) =>
      el('button', { class: `gp-note ${c}`, 'aria-pressed': 'false', onclick: (e) => {
        notes[i] = n;
        notes3.classList.add('note-faite');
        notes3.querySelectorAll('.gp-note').forEach((b) => {
          b.classList.toggle('choisie', b === e.currentTarget);
          b.setAttribute('aria-pressed', String(b === e.currentTarget));
        });
        majBilan();
      } }, t)));
    return el('li', { class: 'gp-question' },
      el('p', {}, fmt(x.q)),
      el('button', { class: 'btn-petit', onclick: (e) => { reponse.hidden = !reponse.hidden; e.currentTarget.textContent = reponse.hidden ? '👀 Voir la réponse' : '🙈 Cacher'; } }, '👀 Voir la réponse'),
      reponse, notes3);
  });

  const ratees = (p?.ratees || []).map((i) => lecon.activites?.[i]).filter(Boolean).map(questionReponse);
  return el('div', { class: 'guide-parent' },
    el('div', { class: 'tete-lecon' },
      el('span', { class: 'gros-emoji' }, lecon.emoji || '📘'),
      el('div', {}, el('small', {}, `Guide parent · ${lecon.matiere || ''}`), el('h2', {}, titreSurDeuxLignes(lecon.titre)),
        el('span', { class: 'date-ajout' }, `⏱ ${g.duree} · `, p ? `révisée ${pluriel(p.fois, 'fois')}, meilleur score ${p.meilleur} %` : 'pas encore révisée dans l’appli',
          ancien ? ` · dernier bilan le ${dateCourte(ancien.quand)}` : ''))),
    el('section', { class: 'gp-bloc gp-essentiel' }, el('h3', {}, '🎯 L’essentiel à vérifier'), liste(g.essentiel)),
    ratees.length ? el('section', { class: 'gp-bloc gp-coince' }, el('h3', {}, `🔁 Ce qui a coincé à son dernier quiz`),
      el('ul', {}, ratees.map((x) => el('li', {}, fmt(x.q), el('br'), el('small', {}, '→ ', fmt(x.r)))))) : null,
    el('section', { class: 'gp-bloc gp-questions' }, el('h3', {}, `🗣️ Les questions à poser à ${prenom}`),
      el('p', { class: 'gp-astuce' }, 'Pose la question à l’oral, laisse-lui le temps de répondre, puis regarde la réponse et note.'),
      el('ol', {}, questions)),
    bilan,
    g.pieges.length ? el('section', { class: 'gp-bloc gp-pieges' }, el('h3', {}, '⚠️ Les pièges fréquents'), liste(g.pieges)) : null,
    g.aide.length ? el('section', { class: 'gp-bloc gp-aide' }, el('h3', {}, `💡 Si ${prenom} bloque`), liste(g.aide)) : null,
    g.defi ? el('section', { class: 'gp-bloc gp-defi' }, el('h3', {}, '🎲 Le défi à faire ensemble'), el('p', {}, fmt(g.defi))) : null,
    el('details', { class: 'gp-fiche' }, el('summary', {}, `👀 La fiche de ${prenom}`), dessinerFiche(lecon)),
    el('div', { class: 'gp-actions' },
      lecon.activites?.length ? el('button', { class: 'btn-principal', onclick: () => { modeParentPour = ''; aller(lancerQuiz, lecon); } },
        `🧒 Lui passer le téléphone : quiz (${pluriel(lecon.activites.length, 'question')})`) : null,
      etat.donnees.envoi?.url ? el('button', { class: 'btn-secondaire', onclick: () => ouvrirAjustement(lecon) }, '🛠️ Demander un ajustement') : null));
}

/* ---- 🎮 JEU CACHÉ : « LA TOUR » ----
   Easter egg : toucher 3 fois de suite le titre « Leçons de … » ouvre un petit jeu.
   Règle : un bloc glisse de gauche à droite ; on touche l'écran pour le lâcher sur la tour.
   La partie qui dépasse est coupée : le bloc suivant est plus étroit. Un lâcher pile au bon
   endroit (« Parfait ! ») ne coupe rien. La partie s'arrête quand on rate complètement la tour.
   - Le score = la hauteur de la tour ; le meilleur score est gardé (par enfant).
   - 1 minute de jeu, puis il faut finir une SÉRIE COMPLÈTE (toutes les étapes d'un parcours, ou une
     leçon simple) pour recharger 1 minute (v1.26.0 ; avant : 2 min par quiz).
   Tout est dessiné dans un <canvas> ; le temps ne s'écoule que pendant qu'on joue. */

const CLE_JEU = 'revisions-jeu';          // { gaby: { meilleur: 23, resteMs: 120000 } }
const TEMPS_JEU = 60 * 1000;

// faites = leçons réussies (≥ 1 ⭐) depuis la dernière recharge ; resteMs plafonné à 1 min
// (un ancien stock de 2 min, d'avant la v1.26.0, est ramené à 1 min)
function etatJeuDe(id) {
  const e = { meilleur: 0, resteMs: TEMPS_JEU, faites: [], ...(lireStock(CLE_JEU, {})[id] || {}) };
  e.resteMs = Math.min(e.resteMs, TEMPS_JEU);
  return e;
}
function ecrireJeu(id, maj) {
  const tout = lireStock(CLE_JEU, {});
  tout[id] = { ...etatJeuDe(id), ...maj };
  ecrireStock(CLE_JEU, tout);
}
/**
 * Appelé à la fin de chaque quiz. La leçon réussie (≥ 1 étoile) est notée ; dès que TOUTES les
 * étapes de sa série ont été réussies depuis la dernière recharge, 1 minute de jeu revient.
 * (Une leçon simple est une série d'une seule étape.) Renvoie vrai s'il y a eu recharge.
 */
function progresJeu(id, lecon, etoiles) {
  if (!etoiles) return false;
  const e = etatJeuDe(id);
  const faites = [...new Set([...e.faites, lecon.id])];
  const serie = serieDe(id, lecon);
  if (serie.every((l) => faites.includes(l.id))) {
    // Série complète : 1 minute rechargée, et on repart de zéro pour la suivante
    ecrireJeu(id, { resteMs: TEMPS_JEU, faites: [] });
    return e.resteMs < TEMPS_JEU;
  }
  ecrireJeu(id, { faites });
  return false;
}

/** La série la plus avancée depuis la dernière recharge (pour l'écran « temps écoulé ») */
function serieLaPlusAvancee(id) {
  const faites = etatJeuDe(id).faites;
  const deja = new Set();
  let mieux = null;
  for (const l of leconsDe(id).filter((x) => !estArchivee(id, x))) {
    const serie = serieDe(id, l);
    if (deja.has(serie[0].id)) continue;
    deja.add(serie[0].id);
    const n = serie.filter((x) => faites.includes(x.id)).length;
    if (!mieux || n / serie.length > mieux.n / mieux.total) mieux = { nom: l.parcours || l.titre, n, total: serie.length };
  }
  return mieux;
}
/** Le message « comment regagner du temps » (+ où on en est) */
function messageRecharge(id) {
  const m = serieLaPlusAvancee(id);
  return el('p', {}, 'Termine une ', el('b', {}, 'série complète'), ' (toutes les étapes d’un parcours, ou une leçon) pour gagner 1 minute de jeu 💪',
    m && m.n ? el('small', { class: 'jeu-progres' }, `Presque : « ${m.nom} » ${m.n}/${m.total}`) : null);
}

// 3 touches rapides sur le titre de la liste des leçons -> le jeu
let touchesTitre = [];
function toucheTitre() {
  if (!etat.enfant || pile.at(-1)?.[0] !== afficherLecons) return;
  const t = Date.now();
  touchesTitre = [...touchesTitre.filter((x) => t - x < 900), t];
  if (touchesTitre.length >= 3) { touchesTitre = []; ouvrirJeu(); }
}

function ouvrirJeu() {
  const id = etat.enfant.id;
  const couleur = etat.enfant.couleur || '#14b8a6';
  document.querySelector('.jeu-fond')?.remove();
  const canvas = el('canvas', { class: 'jeu-canvas' });
  const chrono = el('span', { class: 'jeu-chrono' });
  const score = el('span', { class: 'jeu-score' });
  const message = el('div', { class: 'jeu-message' });
  let fini = false;
  const fermer = () => { fini = true; fond.remove(); };
  const fond = el('div', { class: 'jeu-fond' },
    el('div', { class: 'jeu-barre' }, chrono, score,
      el('button', { class: 'feuille-fermer', 'aria-label': 'Fermer le jeu', onclick: fermer }, '✖')),
    canvas, message);
  document.body.append(fond);

  // Plus de temps : écran « verrouillé » avec le meilleur score
  if (etatJeuDe(id).resteMs <= 0) {
    canvas.remove(); chrono.textContent = '⏳ 0:00'; score.textContent = `🏆 ${etatJeuDe(id).meilleur}`;
    message.replaceChildren(el('div', { class: 'gros-emoji' }, '🔒'), el('h2', {}, 'Le temps de jeu est fini !'),
      messageRecharge(id),
      el('p', {}, `Ton record : `, el('b', {}, etatJeuDe(id).meilleur)),
      el('button', { class: 'btn-principal', onclick: fermer }, '📚 Aller réviser'));
    message.classList.add('visible');
    return;
  }

  // --- Taille du canvas (net sur les écrans haute densité) ---
  const ctx = canvas.getContext('2d');
  let L, H;
  const dimensionner = () => {
    const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    L = r.width; H = r.height;
    canvas.width = L * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  dimensionner();

  // --- État d'une partie ---
  const HB = 26;                         // hauteur d'un bloc
  let tour, mobile, vitesse, camera, morceaux, combo, enCours, dernier, reste = etatJeuDe(id).resteMs;
  const teinte = (n) => `hsl(${(n * 9 + 170) % 360} 75% 58%)`;
  function nouvellePartie() {
    tour = [{ x: L / 2 - 80, l: 160 }];  // le socle
    vitesse = 2.2; camera = 0; morceaux = []; combo = 0; enCours = true;
    nouveauBloc();
    message.classList.remove('visible');
  }
  function nouveauBloc() {
    const haut = tour.at(-1);
    const depuisGauche = tour.length % 2 === 0;
    // le bloc arrive déjà un peu dans l'écran (pas d'attente au début)
    mobile = { x: depuisGauche ? -haut.l * 0.6 : L - haut.l * 0.4, l: haut.l, sens: depuisGauche ? 1 : -1 };
  }
  // Toucher = lâcher le bloc
  function lacher() {
    if (!enCours) return;
    const haut = tour.at(-1);
    let gauche = Math.max(mobile.x, haut.x), droite = Math.min(mobile.x + mobile.l, haut.x + haut.l);
    if (droite <= gauche) return perdu();                       // complètement à côté
    if (Math.abs(mobile.x - haut.x) < 5) {                      // « Parfait ! » : rien n'est coupé
      gauche = haut.x; droite = haut.x + haut.l; combo++;
      if (combo >= 3) { gauche -= 6; droite += 6; }             // série de parfaits : le bloc regrandit un peu
      son('petit'); afficherBulle(combo >= 3 ? `Parfait ×${combo} !` : 'Parfait !');
    } else {
      combo = 0;
      // La partie qui dépasse tombe (petite animation)
      const y = tour.length;
      if (mobile.x < gauche) morceaux.push({ x: mobile.x, l: gauche - mobile.x, y, vy: 0, n: y });
      if (mobile.x + mobile.l > droite) morceaux.push({ x: droite, l: mobile.x + mobile.l - droite, y, vy: 0, n: y });
    }
    tour.push({ x: gauche, l: droite - gauche });
    vitesse = Math.min(2.2 + tour.length * 0.12, 7.5);          // de plus en plus vite
    nouveauBloc();
  }
  let bulle = null;
  const afficherBulle = (t) => { bulle = { t, vie: 50 }; };
  function perdu() {
    enCours = false; son('faux');
    const hauteur = tour.length - 1;
    const record = hauteur > etatJeuDe(id).meilleur;
    if (record) ecrireJeu(id, { meilleur: hauteur });
    finDePartie(record ? '🎉 Nouveau record !' : 'Raté !', hauteur);
  }
  function finDePartie(titre, hauteur) {
    const plusDeTemps = reste <= 0;
    message.replaceChildren(el('div', { class: 'gros-emoji' }, plusDeTemps ? '⏰' : hauteur > 10 ? '🏗️' : '💥'),
      el('h2', {}, plusDeTemps ? 'Temps écoulé !' : titre),
      el('p', {}, 'Tour de ', el('b', {}, pluriel(hauteur, 'bloc')), ` · record : ${etatJeuDe(id).meilleur}`),
      plusDeTemps ? messageRecharge(id) : '',   // '' et pas null : replaceChildren écrirait « null »
      plusDeTemps ? el('button', { class: 'btn-principal', onclick: fermer }, '📚 Aller réviser')
        : el('button', { class: 'btn-principal', onclick: (e) => { e.stopPropagation(); nouvellePartie(); } }, '🔁 Rejouer'));
    message.classList.add('visible');
    proteger(message);
  }
  /* Anti-« clic à fond » : à la fin d'une partie, l'enfant tape encore très vite sur l'écran.
     Pendant 1,5 s les boutons de l'écran de fin sont inactifs (grisés), pour qu'il ait le temps
     de VOIR son score au lieu de relancer une partie (ou de fermer) sans le vouloir. */
  function proteger(boite) {
    const boutons = [...boite.querySelectorAll('button')];
    boutons.forEach((b) => { b.disabled = true; b.dataset.texte = b.textContent; });
    let n = 3;
    const tic = () => {
      if (n > 0) { boutons.forEach((b) => { b.textContent = `${b.dataset.texte} (${n})`; }); n--; setTimeout(tic, 500); }
      else boutons.forEach((b) => { b.disabled = false; b.textContent = b.dataset.texte; });
    };
    tic();
  }
  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); if (enCours) lacher(); });

  // --- La boucle d'animation ---
  function image(t) {
    if (fini) return;
    const dt = dernier ? Math.min(t - dernier, 100) : 16;
    dernier = t;
    if (enCours) {
      // Chrono : le temps ne s'écoule que pendant une partie
      const avant = Math.ceil(reste / 1000);
      reste -= dt;
      // On sauvegarde le temps restant une fois par seconde (pas à chaque image)
      if (Math.ceil(reste / 1000) !== avant) ecrireJeu(id, { resteMs: Math.max(0, reste) });
      if (reste <= 0) {
        enCours = false;
        const hauteur = tour.length - 1;
        if (hauteur > etatJeuDe(id).meilleur) ecrireJeu(id, { meilleur: hauteur });
        finDePartie('', hauteur);
      }
      mobile.x += mobile.sens * vitesse * (dt / 16);
      if (mobile.x > L - mobile.l / 3 && mobile.sens > 0) mobile.sens = -1;   // rebondit sur les bords
      if (mobile.x < -mobile.l * 2 / 3 && mobile.sens < 0) mobile.sens = 1;
    }
    const s = Math.max(0, Math.ceil(reste / 1000));
    chrono.textContent = `⏳ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    score.textContent = `🧱 ${tour.length - 1} · 🏆 ${etatJeuDe(id).meilleur}`;

    // La caméra monte doucement avec la tour
    const cible = Math.max(0, (tour.length + 1) * HB - H * 0.55);
    camera += (cible - camera) * 0.08;
    const yEcran = (n) => H - 40 - (n + 1) * HB + camera;       // n = numéro d'étage (0 = socle)

    ctx.clearRect(0, 0, L, H);
    const ciel = ctx.createLinearGradient(0, 0, 0, H);
    ciel.addColorStop(0, `hsl(${(tour.length * 6 + 200) % 360} 70% 88%)`); ciel.addColorStop(1, '#f0fdfa');
    ctx.fillStyle = ciel; ctx.fillRect(0, 0, L, H);
    const bloc = (x, y, l, c) => {
      ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(x, y, l, HB - 3, 6); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(x + 4, y + 3, Math.max(0, l - 8), 5);
    };
    tour.forEach((b, n) => { const y = yEcran(n); if (y > -HB && y < H) bloc(b.x, y, b.l, n === 0 ? couleur : teinte(n)); });
    morceaux.forEach((m) => { m.vy += 0.5; m.y -= m.vy / HB; bloc(m.x, yEcran(m.y), m.l, teinte(m.n)); });
    morceaux = morceaux.filter((m) => yEcran(m.y) < H + 50);
    if (enCours) bloc(mobile.x, yEcran(tour.length), mobile.l, teinte(tour.length));
    if (bulle && bulle.vie-- > 0) {
      ctx.fillStyle = '#7c3aed'; ctx.font = '800 22px Nunito, system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(bulle.t, L / 2, yEcran(tour.length) - 30 - (50 - bulle.vie) / 2);
    }
    requestAnimationFrame(image);
  }

  // Écran d'accueil du jeu
  message.replaceChildren(el('div', { class: 'gros-emoji' }, '🏗️'), el('h2', {}, 'La Tour'),
    el('p', {}, 'Touche l’écran pour lâcher le bloc pile sur la tour. Ce qui dépasse est coupé !'),
    el('p', {}, `⏳ ${Math.ceil(reste / 1000)} s de jeu · 🏆 record : ${etatJeuDe(id).meilleur}`),
    reste < TEMPS_JEU ? messageRecharge(id) : '',   // '' et pas null : replaceChildren écrirait « null »
    el('button', { class: 'btn-principal', onclick: (e) => { e.stopPropagation(); nouvellePartie(); } }, '▶️ Jouer'));
  message.classList.add('visible');
  tour = [{ x: L / 2 - 80, l: 160 }]; mobile = { x: 0, l: 160, sens: 1 }; camera = 0; morceaux = []; enCours = false;
  requestAnimationFrame(image);
}

/* ---- PARCOURS : une grosse leçon découpée en petits modules ----
   Dans lecons.json, chaque module est une leçon normale avec en plus
     "parcours": "Arrondir et encadrer", "etape": 2
   La liste les affiche comme un chemin d'étapes (⚽ 1 → 2 → 3 → 🏆), et la fin
   du quiz propose directement l'étape suivante. */

// Les cartes d'une matière : une carte par leçon simple (avec son 📦), un « chemin » par parcours
function cartesDe(liste) {
  const deja = new Set();
  return liste.map((l) => {
    if (!l.parcours) return el('div', { class: 'ligne-lecon' }, carteLecon(l),
      el('button', {
        class: 'parcours-archiver', title: 'Archiver cette leçon', 'aria-label': 'Archiver cette leçon',
        onclick: () => { archiverSerie(etat.enfant.id, l, true); afficherLecons(); toast('📦 Leçon archivée'); },
      }, '📦'));
    if (deja.has(l.parcours)) return null;
    deja.add(l.parcours);
    return carteParcours(l.parcours, liste.filter((x) => x.parcours === l.parcours));
  });
}

// Tous les modules d'un parcours (non archivés), dans l'ordre des étapes
function modulesDu(parcours) {
  return leconsDe(etat.enfant.id)
    .filter((l) => l.parcours === parcours && !estArchivee(etat.enfant.id, l))
    .sort((a, b) => (a.etape || 0) - (b.etape || 0));
}

/* Un parcours compte au plus 4 étapes (au-delà, les noms deviennent illisibles sur téléphone).
   Le robot qui fabrique les leçons respecte cette règle ; si un parcours en a quand même plus,
   on l'affiche sur plusieurs lignes de 4 pour qu'il reste lisible. */
const ETAPES_PAR_LIGNE = 4;

function carteParcours(parcours, modules) {
  modules = [...modules].sort((a, b) => (a.etape || 0) - (b.etape || 0));
  const faits = modules.filter((m) => etoilesDe(etat.enfant.id, m.id) > 0).length;
  const prochain = modules.find((m) => etoilesDe(etat.enfant.id, m.id) === 0);
  // Une étape = un bouton rond (✔ si réussie, sinon son emoji)
  const etape = (m, i) => {
    const etoiles = etoilesDe(etat.enfant.id, m.id);
    return el('button', {
      class: 'parcours-etape' + (etoiles ? ' faite' : '') + (m === prochain ? ' prochaine' : ''),
      onclick: () => aller(afficherLecon, m),
    },
      el('span', { class: 'parcours-rond' }, etoiles ? '✔' : (m.emoji || String(i + 1)),
        // petite clé 🛠️ sur l'étape tant que l'ajustement demandé n'est pas arrivé
        ajustementEnCours(etat.enfant.id, m) ? el('span', { class: 'pastille-ajustement', title: 'Ajustement en cours' }, '🛠️') : null),
      el('span', { class: 'parcours-nom' }, m.titre),
      el('span', { class: 'parcours-etoiles' }, dessinEtoiles(etoiles)));
  };
  // Découpe en lignes de 4 étapes ; le trophée est au bout de la dernière ligne
  const lignes = [];
  for (let i = 0; i < modules.length; i += ETAPES_PAR_LIGNE) lignes.push(modules.slice(i, i + ETAPES_PAR_LIGNE));
  return el('div', { class: 'parcours' },
    el('div', { class: 'parcours-tete' },
      el('b', {}, parcours),
      faits === modules.length ? el('small', {}, '🏆 Terminé !') : null,
      // 📦 Archiver tout le parcours d'un coup (il va dans « Leçons archivées », d'où on peut le ressortir)
      el('button', {
        class: 'parcours-archiver', title: 'Archiver tout ce parcours', 'aria-label': 'Archiver tout ce parcours',
        onclick: () => {
          if (!confirm(`Archiver tout le parcours « ${parcours} » ? (on pourra le ressortir)`)) return;
          archiverSerie(etat.enfant.id, modules[0], true);
          afficherLecons();
          toast('📦 Parcours archivé');
        },
      }, '📦')),
    lignes.map((ligne, n) => el('div', { class: 'parcours-chemin' },
      ligne.map((m, i) => etape(m, n * ETAPES_PAR_LIGNE + i)),
      // Trophée seulement au bout de la dernière ligne (case vide ailleurs, pour garder l'alignement)
      el('span', { class: 'parcours-trophee' + (faits === modules.length ? ' gagne' : '') },
        n === lignes.length - 1 ? '🏆' : ''))));
}

// Le module qui suit (ou null)
function moduleSuivant(lecon) {
  if (!lecon.parcours) return null;
  const modules = modulesDu(lecon.parcours);
  return modules[modules.indexOf(modules.find((m) => m.id === lecon.id)) + 1] || null;
}

// Depuis l'écran de fin du quiz : on revient à la fiche, puis on la remplace par celle du module suivant
function allerAuModuleSuivant(suivant) {
  ensuite = () => remplacerEcran(afficherLecon, suivant);
  history.back();
}

// Regroupe des leçons par matière, en gardant l'ordre du fichier : [["Maths", [...]], ...]
function parMatiere(lecons) {
  const groupes = new Map();
  for (const l of lecons) {
    const m = l.matiere || 'Divers';
    if (!groupes.has(m)) groupes.set(m, []);
    groupes.get(m).push(l);
  }
  return [...groupes];
}

// Carte d'une leçon dans une liste : emoji, titre, étoiles (sans le nombre de questions)
/**
 * Titre coupé en deux lignes quand c'est possible, pour qu'il se lise mieux sur téléphone :
 *   « BE et HAVE (The Addams Family) »  ->  BE et HAVE / (The Addams Family)
 *   « Calcul mental : 0,5 · 4 · 5 »     ->  Calcul mental / 0,5 · 4 · 5
 * Renvoie une liste de morceaux à mettre dans un élément (le 2e est un petit sous-titre).
 */
function titreSurDeuxLignes(titre) {
  const t = String(titre || '');
  let m = t.match(/^(.{3,}?)\s+(\(.+\))$/);           // une parenthèse à la fin
  if (!m) m = t.match(/^(.{3,}?)\s*:\s+(.+)$/);         // « avant : après »
  if (!m) return [t];
  return [m[1], el('span', { class: 'sous-titre' }, m[2])];
}

function carteLecon(l, classe = '') {
  return el('button', { class: 'carte-lecon ' + classe, onclick: () => aller(afficherLecon, l) },
    el('span', { class: 'emoji' }, l.emoji || '📘'),
    el('span', { class: 'infos' }, el('b', {}, titreSurDeuxLignes(l.titre)),
      ajustementEnCours(etat.enfant.id, l) ? el('small', { class: 'badge-ajustement' }, '🛠️ ajustement en cours…')
        : modeParent() ? el('small', { class: 'date-ajout' }, resumeBilan(bilanDe(etat.enfant.id, l.id)) || 'pas encore de bilan')
        : dateAjout(l) ? el('small', { class: 'date-ajout' }, dateAjout(l)) : null),
    el('span', { class: 'etoiles' }, dessinEtoiles(etoilesDe(etat.enfant.id, l.id))));
}

// --- Une leçon : la fiche à relire + le bouton pour lancer le quiz ---
function afficherLecon(lecon) {
  entete(lecon.titre);
  memoriserEcran(lecon);
  // 👪 Mode parent : à la place de la fiche, le guide pour faire réciter l'enfant
  if (modeParent()) { langueLecon = lecon.langue || null; afficher(guideParent(lecon)); return; }
  langueLecon = lecon.langue || null;
  const nb = (lecon.activites || []).length;
  /* Mise en page (voir style.css, « TABLETTE ») :
     - téléphone / tablette en portrait : tout en une colonne, dans l'ordre
       titre (+ pastille Alex) → fiche → bouton « C'est parti » (collé en bas) → archiver ;
     - tablette en paysage / ordinateur : la fiche à gauche, et à droite une
       colonne <aside> qui reste visible (les boutons) pendant qu'on lit.
     Sur téléphone, l'<aside> est « transparent » (display: contents) : ses
     éléments se rangent comme s'ils étaient directement dans la page. */
  afficher(el('div', { class: 'page-lecon' },
    el('div', { class: 'tete-lecon' },
      el('span', { class: 'gros-emoji' }, lecon.emoji || '📘'),
      el('div', {}, el('small', {}, lecon.parcours
        ? `${lecon.matiere || ''} · ${lecon.parcours} · étape ${lecon.etape || 1}/${modulesDu(lecon.parcours).length}`
        : lecon.matiere || ''), el('h2', {}, titreSurDeuxLignes(lecon.titre)),
        dateAjout(lecon) ? el('span', { class: 'date-ajout' }, dateAjout(lecon)) : null,
        // 🛠️ ajustement demandé mais pas encore arrivé : on peut actualiser sans quitter la page
        ajustementEnCours(etat.enfant.id, lecon) ? el('button', { class: 'badge-ajustement', onclick: () => actualiser() },
          '🛠️ Ajustement en cours… 🔄 Actualiser') : null),
      blocAlex(lecon)), // pastille « 🎧 Alex » à droite du titre (seulement si "assistant": true)
    dessinerFiche(lecon),
    el('aside', { class: 'cote-lecon' },
    nb
      ? el('button', { class: 'btn-principal collant', onclick: () => aller(lancerQuiz, lecon) },
        `🚀 C'est parti ! (${pluriel(nb, 'question')})`)
      : el('p', { class: 'vide' }, 'Pas encore de questions pour cette leçon.'),
    // 📦 Archiver : toute la SÉRIE (le parcours entier), pas seulement cette étape
    etat.enfant ? el('button', {
      class: 'btn-secondaire btn-archive',
      onclick: () => {
        const archiver = !estArchivee(etat.enfant.id, lecon);
        archiverSerie(etat.enfant.id, lecon, archiver);
        if (archiver) { toast(lecon.parcours ? '📦 Série archivée' : '📦 Leçon archivée'); history.back(); } // retour à la liste
        else { afficherLecon(lecon); toast('📤 Remis dans ta liste'); }
      },
    }, estArchivee(etat.enfant.id, lecon)
      ? (lecon.parcours ? '📤 Ressortir toute la série des archives' : '📤 Ressortir cette leçon des archives')
      : (lecon.parcours ? `📦 Archiver toute la série « ${lecon.parcours} »` : '📦 Archiver cette leçon (je la connais !)')) : null,
    // 🛠️ Demander à Claude de retoucher la leçon (plus facile, plus court, une erreur…)
    etat.donnees.envoi?.url && etat.enfant ? el('button', {
      class: 'btn-secondaire btn-ajuster', onclick: () => ouvrirAjustement(lecon),
    }, '🛠️ Demander un ajustement') : null,
  )));
}

// Petit message qui s'affiche 2 secondes en bas de l'écran
function toast(texte) {
  $('#toast')?.remove();
  const t = el('div', { id: 'toast', class: 'toast' }, texte);
  document.body.append(t);
  setTimeout(() => t.remove(), 2200);
}

/**
 * La fiche est découpée en BLOCS : chaque ligne « # Titre » ouvre un nouveau bloc (une carte colorée).
 * Dans un bloc, les lignes de texte sont mises en forme (puces, gras, mots étrangers)
 * et les objets { "visuel": ... } deviennent des schémas / animations (voir visuels.js).
 */
function dessinerFiche(lecon) {
  const lignes = Array.isArray(lecon.fiche) ? lecon.fiche : lecon.fiche ? [lecon.fiche] : [];
  if (!lignes.length) return null;
  const blocs = [{ titre: null, contenu: [] }];
  for (const l of lignes) {
    if (typeof l === 'string' && l.startsWith('# ')) blocs.push({ titre: l.slice(2), contenu: [] });
    else blocs.at(-1).contenu.push(l);
  }
  const couleurs = ['#14b8a6', '#6366f1', '#f59e0b', '#ec4899', '#22c55e', '#0ea5e9'];
  return el('article', {
    class: 'fiche',
    onclick: (e) => { // mot étranger dans le texte mis en forme (HTML) ?
      const mot = e.target.closest('.mot[data-dit]');
      if (mot) ouvrirBulleMot(mot.innerHTML.replace(/<\/?b>/g, '**').replace(/&amp;/g, '&'), mot.dataset.dit);
    },
  }, blocs.filter((b) => b.titre || b.contenu.length).map((b, i) => el('section', {
    class: 'bloc' + (b.titre ? '' : ' intro'),
    style: `--teinte:${couleurs[i % couleurs.length]}`,
  },
    b.titre ? el('h3', { html: miseEnForme('# ' + b.titre).replace(/^<h3>|<\/h3>$/g, '') }) : null,
    contenuBloc(b.contenu),
    // 💬 remarque sur ce bloc (envoyée à Papa avec l'endroit exact)
    boutonRemarque(lecon, { type: 'bloc', numero: i + 1, titre: b.titre || 'Introduction' }))));
}

// Regroupe les lignes de texte qui se suivent (pour les puces), et dessine les visuels
function contenuBloc(contenu) {
  const morceaux = [];
  let texte = [];
  const viderTexte = () => { if (texte.length) morceaux.push(el('div', { class: 'texte', html: miseEnForme(texte.join('\n')) })); texte = []; };
  for (const c of contenu) {
    if (typeof c === 'string') texte.push(c);
    else { viderTexte(); morceaux.push(dessinerVisuel(c)); }
  }
  viderTexte();
  return morceaux;
}

// --- Le quiz : on enchaîne les activités dans un ordre mélangé ---
function lancerQuiz(lecon) {
  langueLecon = lecon.langue || null;
  entete(lecon.titre);
  const questions = etat.enfant?.coupDePouce ? mancheDouce(lecon.activites, etat.enfant.questionsParManche || 10)
    : lecon.melanger === false ? [...lecon.activites] : melanger(lecon.activites);
  questionSuivante({ lecon, questions, i: 0, bons: 0, erreurs: [], entrainement: false, serie: 0, historique: [] });
}

/* ---- MODE « COUP DE POUCE » (enfant avec "coupDePouce": true dans lecons.json) ----
   But : enchaîner les réussites pour reprendre confiance.
   - manche courte (10 questions par défaut, "questionsParManche" pour changer) ;
   - on commence par les questions faciles : chaque question peut avoir "niveau": 1 (facile),
     2 (moyen) ou 3 (difficile) ; sans niveau = 2. On mélange à l'intérieur d'un même niveau,
     donc chaque partie est un peu différente ;
   - une 2e chance tout de suite après une erreur (voir questionSuivante), avec un "indice". */
function mancheDouce(activites, combien) {
  const parNiveau = [1, 2, 3].map((n) => melanger(activites.filter((a) => (a.niveau || 2) === n)));
  // On garde la proportion de chaque niveau dans la manche (au moins 1 question si le niveau existe)
  const total = activites.length;
  const pris = parNiveau.map((liste) => liste.slice(0, liste.length ? Math.max(1, Math.round((liste.length / total) * combien)) : 0));
  return pris.flat().slice(0, combien);
}

/* Habillage de chaque type de question : emoji, petite consigne, couleur de la carte */
const STYLE_QUESTION = {
  qcm: ['🎯', 'Choisis la bonne réponse', '#6366f1'],
  vraifaux: ['⚖️', 'Vrai ou faux ?', '#f59e0b'],
  saisie: ['✍️', 'À toi d’écrire', '#ec4899'],
  trous: ['🧩', 'Complète la phrase', '#14b8a6'],
  paires: ['🔗', 'Relie les paires', '#0ea5e9'],
  ordre: ['🔢', 'Remets dans l’ordre', '#22c55e'],
  carte: ['🃏', 'Carte mémo', '#a855f7'],
};

/** La piste de course : une case par question (verte = juste, orange = raté),
    l'avatar de l'enfant avance jusqu'au drapeau 🏁. */
function dessinPiste(q) {
  const n = q.questions.length;
  return el('div', { class: 'piste', 'aria-label': `Question ${q.i + 1} sur ${n}` },
    el('div', { class: 'piste-cases' }, q.questions.map((_, k) => el('span', {
      class: 'case' + (k < q.historique.length ? (q.historique[k] ? ' ok' : ' ko') : '') + (k === q.i ? ' actuelle' : ''),
    }))),
    el('div', { class: 'piste-coureur', style: `left:${((q.i + 0.5) / n) * 100}%` }, dessinAvatar(etat.enfant, 'mini-avatar')),
    el('span', { class: 'piste-arrivee' }, '🏁'));
}

/** Petite gerbe d'emojis qui jaillit d'un élément (bonne réponse !) */
function eclats(element, emojis = ['⭐', '✨', '🎉', '💫']) {
  const r = element.getBoundingClientRect();
  for (let k = 0; k < 14; k++) {
    const angle = (Math.PI * 2 * k) / 14 + Math.random() * 0.4;
    const distance = 60 + Math.random() * 70;
    const e = el('span', {
      class: 'eclat',
      style: `left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px;--dx:${Math.cos(angle) * distance}px;--dy:${Math.sin(angle) * distance - 30}px`,
    }, auHasard(emojis));
    document.body.append(e);
    setTimeout(() => e.remove(), 900);
  }
}

const BRAVO = ['Bravo ! 🎉', 'Super ! ⭐', 'Génial ! 🚀', 'Excellent ! 👏', 'Trop fort ! 💪', 'Parfait ! ✨'];
// Messages du mode coup de pouce : après une 1re erreur, puis réussite au 2e essai
const ENCORE = ['Presque ! Essaie encore une fois 💪', 'Pas grave, tu as une 2e chance ! 🍀', 'Réfléchis bien, tu peux y arriver ! 🧠'];
const BRAVO_ESSAI2 = ['Bravo, tu as trouvé ! 💪', 'Yes ! Au 2e essai, c\'est gagné ! ⚽', 'Super, tu n\'as rien lâché ! 🏆'];
const OUPS = ['Oups, presque ! 🙈', 'Pas tout à fait… 🤔', 'Raté, mais tu vas y arriver ! 💪'];

/**
 * Affiche la question n° q.i. Chaque type d'activité reçoit une fonction
 * "fin(reussi, bonneReponse)" qu'il appelle UNE fois quand l'enfant a répondu.
 */
function questionSuivante(q) {
  if (q.i >= q.questions.length) return afficherResultat(q);

  const activite = q.questions[q.i];
  const dessiner = ACTIVITES[activite.type];
  if (!dessiner) {
    // Type mal écrit dans le JSON : on le signale dans la console et on passe
    console.warn('Type d’activité inconnu :', activite.type);
    q.questions.splice(q.i, 1);
    return questionSuivante(q);
  }

  q.serie ??= 0; q.historique ??= [];
  const [emoji, consigne, teinte] = STYLE_QUESTION[activite.type] || ['❓', 'Question', '#14b8a6'];
  const zone = el('div', { class: 'zone-question' });
  const carte = el('div', { class: 'carte-question', style: `--teinte:${teinte}` },
    el('div', { class: 'type-question' }, el('span', {}, emoji), consigne),
    // 💬 remarque sur cette question (sa position dans la leçon d'origine + son texte)
    boutonRemarque(q.lecon, { type: 'question', numero: (q.lecon.activites || []).indexOf(activite) + 1,
      titre: sansMots(activite.question || activite.consigne || activite.recto || consigne) }),
    zone);
  const retour = el('div', { class: 'retour' });
  afficher(
    dessinPiste(q),
    el('p', { class: 'compteur' }, `${q.entrainement ? '🔁 Deuxième chance · ' : ''}Question ${q.i + 1} / ${q.questions.length}`,
      q.serie >= 2 ? el('span', { class: 'serie' }, ` · 🔥 ${q.serie} d’affilée`) : null),
    carte,
    retour,
  );

  requestAnimationFrame(() => lectureQuestion(activite, carte, zone)); // 🔊 si le profil le demande
  dessiner(activite, zone, (reussi, bonneReponse) => {
    // Coup de pouce : 1re erreur -> pas de note, un indice et on réessaie la même question
    if (!reussi && etat.enfant?.coupDePouce && !q.essai2 && !q.entrainement) {
      q.essai2 = true;
      son('faux');
      // L'activité a peut-être déjà coloré la bonne réponse en vert : on la cache, sinon plus de suspense !
      zone.querySelectorAll('.bon').forEach((e) => e.classList.remove('bon'));
      retour.replaceChildren(
        el('div', { class: 'bandeau essai' },
          el('div', { class: 'bandeau-tete' },
            el('span', { class: 'mascotte' }, dessinAvatar(etat.enfant, 'mini-avatar')),
            el('b', {}, auHasard(ENCORE))),
          activite.indice ? el('p', { class: 'explication' }, '🔎 Indice : ', enrichir(activite.indice)) : null),
        el('button', { class: 'btn-principal', onclick: () => { questionSuivante(q); scrollTo(0, 0); } }, '🔁 Je réessaie'));
      retour.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    const auDeuxiemeEssai = reussi && q.essai2;
    q.essai2 = false;
    if (reussi) q.bons++; else q.erreurs.push(activite);
    q.historique[q.i] = reussi;
    q.serie = reussi ? q.serie + 1 : 0;
    son(reussi ? 'bon' : 'faux');
    if (reussi) eclats(carte, q.serie >= 3 ? ['🔥', '⭐', '🚀', '✨'] : undefined);
    else { vibrer(120); secouer(carte); }
    // la case de la piste se colore tout de suite
    $('.piste .case.actuelle')?.classList.add(reussi ? 'ok' : 'ko');

    // Petits messages de série (3, 5, 10 bonnes réponses d'affilée)
    const serie = { 3: '🔥 3 d’affilée, ça chauffe !', 5: '🚀 5 d’affilée, tu es lancé·e !', 10: '🏆 10 d’affilée, incroyable !' }[q.serie];

    const derniere = q.i + 1 >= q.questions.length;
    retour.replaceChildren(
      el('div', { class: 'bandeau ' + (reussi ? 'ok' : 'ko') },
        el('div', { class: 'bandeau-tete' },
          el('span', { class: 'mascotte ' + (reussi ? 'contente' : 'triste') }, dessinAvatar(etat.enfant, 'mini-avatar')),
          el('b', {}, auDeuxiemeEssai ? auHasard(BRAVO_ESSAI2) : auHasard(reussi ? BRAVO : OUPS))),
        serie ? el('p', { class: 'message-serie' }, serie) : null,
        !reussi && bonneReponse ? el('p', {}, 'La bonne réponse : ', el('b', {}, sansMots(bonneReponse))) : null,
        activite.explication ? el('p', { class: 'explication' }, '💡 ', enrichir(activite.explication)) : null),
      el('button', { class: 'btn-principal', onclick: () => { q.i++; questionSuivante(q); scrollTo(0, 0); } },
        derniere ? (q.entrainement ? 'Voir mon bilan 🏁' : 'Voir mon score 🏁') : 'Question suivante →'),
    );
    retour.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    // Leçon de langue : on fait entendre la phrase correcte juste après le petit son bon/faux
    const aDire = motsDe(activite.explication || '')[0];
    if (aDire) setTimeout(() => prononcer(aDire), 700);
  });
}

// --- Fin du quiz ---
// 1er passage terminé : on enregistre les étoiles, puis s'il y a des erreurs,
// on enchaîne UNE fois sur les questions ratées (« deuxième chance »).
// Le rattrapage ne change pas les étoiles : il sert à fixer ce qui n'est pas acquis.
function afficherResultat(q) {
  if (!q.entrainement) {
    const total = q.questions.length;
    const pct = Math.round((q.bons / total) * 100);
    const etoiles = pct >= 90 ? 3 : pct >= 70 ? 2 : pct >= 40 ? 1 : 0;
    // 🎮 jeu caché : une série complète = 1 minute rechargée
    if (progresJeu(etat.enfant.id, q.lecon, etoiles)) setTimeout(() => toast('🎮 Série complète : 1 minute de jeu gagnée !'), 1200);
    enregistrerScore(etat.enfant.id, q.lecon.id, etoiles, pct,
      q.erreurs.map((a) => q.lecon.activites.indexOf(a)).filter((i) => i >= 0));
    q.premier = { bons: q.bons, total, etoiles };
    if (q.erreurs.length) return ecranDeuxiemeChance(q);
    return ecranFinal(q.lecon, q.premier, null);
  }
  // Fin d'un rattrapage
  ecranFinal(q.lecon, q.premier, { corrigees: q.bons, total: q.questions.length, restantes: q.erreurs });
}

// Écran intermédiaire : score du 1er passage + annonce du rattrapage
function ecranDeuxiemeChance(q) {
  const n = q.erreurs.length;
  afficher(el('div', { class: 'resultat' },
    dessinGrossesEtoiles(q.premier.etoiles),
    el('p', { class: 'score' }, `${q.premier.bons} / ${q.premier.total} du premier coup`),
    el('div', { class: 'deuxieme-chance' },
      el('div', { class: 'gros-emoji' }, '🔁'),
      el('h2', {}, 'Deuxième chance !'),
      el('p', {}, n > 1 ? `On revoit les ${n} questions ratées pour bien les retenir.` : 'On revoit la question ratée pour bien la retenir.')),
    el('button', { class: 'btn-principal', onclick: () => revoirErreurs(q) }, 'On y va ! 💪'),
    el('button', { class: 'btn-secondaire', onclick: () => ecranFinal(q.lecon, q.premier, null, q.erreurs) }, 'Passer et voir mon score'),
  ));
  son('petit');
}

// Écran final : étoiles (1er passage), bilan du rattrapage, rejouer
function ecranFinal(lecon, premier, rattrapage, erreursNonRevues = []) {
  const restantes = rattrapage ? rattrapage.restantes : erreursNonRevues;
  const messages = ['On recommence ? Tu vas y arriver 💪', 'Pas mal ! Encore un petit effort 🙂', 'Très bien ! 👏', 'Magnifique ! 🏆'];
  const qRelance = { lecon, erreurs: restantes, premier };
  const suivant = moduleSuivant(lecon); // module suivant du parcours (s'il y en a un)

  afficher(el('div', { class: 'resultat' },
    dessinGrossesEtoiles(premier.etoiles),
    el('h2', {}, messages[premier.etoiles]),
    el('p', { class: 'score' }, `${premier.bons} / ${premier.total} du premier coup`),
    rattrapage ? el('p', { class: 'bilan-rattrapage ' + (restantes.length ? 'ko' : 'ok') },
      restantes.length
        ? `🔁 Rattrapage : ${rattrapage.corrigees} / ${rattrapage.total} corrigée${rattrapage.corrigees > 1 ? 's' : ''}. Encore ${pluriel(restantes.length, 'question')} à revoir.`
        : '🎯 Rattrapage réussi : toutes tes erreurs sont corrigées !') : null,
    restantes.length ? el('button', { class: 'btn-principal', onclick: () => revoirErreurs(qRelance) },
      `🔁 Revoir ${restantes.length > 1 ? `les ${restantes.length} questions` : 'la question'} encore une fois`) : null,
    suivant ? el('button', { class: restantes.length ? 'btn-secondaire' : 'btn-principal', onclick: () => allerAuModuleSuivant(suivant) },
      `⚽ Étape suivante : ${suivant.titre} ➜`) : null,
    el('button', { class: restantes.length || suivant ? 'btn-secondaire' : 'btn-principal', onclick: () => lancerQuiz(lecon) }, '🔄 Rejouer toute la leçon'),
    el('button', { class: 'btn-secondaire', onclick: () => history.back() }, '📖 Revenir à la fiche'),
  ));

  son(premier.etoiles >= 2 ? 'fin' : 'petit');
  if (premier.etoiles >= 2 || (rattrapage && !restantes.length)) confettis();
}

const dessinGrossesEtoiles = (n) => el('div', { class: 'grosses-etoiles' },
  [0, 1, 2].map((i) => el('span', { class: i < n ? 'pleine' : 'eteinte', style: `animation-delay:${i * 0.25}s` }, '★')));

// Rejoue seulement les questions ratées (q.premier est transmis pour l'écran final)
function revoirErreurs(q) {
  questionSuivante({ lecon: q.lecon, questions: melanger(q.erreurs), i: 0, bons: 0, erreurs: [], entrainement: true, premier: q.premier, serie: 0, historique: [] });
  scrollTo(0, 0);
}

/* ---------- 6. LES TYPES D'ACTIVITÉS ------------------------- */
// Chaque fonction reçoit : l'activité (lue dans le JSON), la zone où
// dessiner, et fin(reussi, bonneReponse) à appeler quand c'est répondu.

// Énoncé de la question (les {{mots étrangers}} restent cliquables pour les écouter)
function enonce(texte) {
  return el('div', { class: 'enonce' }, el('p', {}, enrichir(texte)));
}

const ACTIVITES = {

  /* QCM — "choix": la PREMIÈRE proposition est la bonne (l'appli mélange) */
  qcm(act, zone, fin) {
    zone.append(enonce(act.question));
    const bonne = String(act.choix[0]);
    const boutons = melanger(act.choix.map(String)).map((texte, k) =>
      el('button', {
        class: 'choix', 'data-lettre': 'ABCDEF'[k],
        onclick: (e) => {
          boutons.forEach((b) => (b.disabled = true));
          const ok = texte === bonne;
          e.currentTarget.classList.add(ok ? 'bon' : 'faux');
          boutons.find((b) => texteSans(b) === sansMots(bonne)).classList.add('bon'); // montre la bonne
          fin(ok, bonne);
          const motBon = motsDe(bonne)[0];
          if (motBon && !motsDe(act.explication || '').length) setTimeout(() => prononcer(motBon), 700);
        },
      }, sansMots(texte)));
    zone.append(el('div', { class: 'liste-choix' }, boutons));
  },

  /* VRAI / FAUX — "reponse": true ou false */
  vraifaux(act, zone, fin) {
    zone.append(enonce(act.affirmation));
    const boutons = [true, false].map((valeur) =>
      el('button', {
        class: 'choix',
        onclick: (e) => {
          boutons.forEach((b) => (b.disabled = true));
          const ok = valeur === act.reponse;
          e.currentTarget.classList.add(ok ? 'bon' : 'faux');
          boutons[act.reponse ? 0 : 1].classList.add('bon');
          fin(ok, act.reponse ? 'Vrai' : 'Faux');
        },
      }, valeur ? '👍 Vrai' : '👎 Faux'));
    zone.append(el('div', { class: 'liste-choix deux' }, boutons));
  },

  /* RÉPONSE À TAPER — "reponse": "56" ou ["nom", "un nom"] (plusieurs acceptées).
     Majuscules et ponctuation ne comptent pas. Les accents non plus,
     sauf si l'activité contient "strict": true (orthographe exigée). */
  saisie(act, zone, fin) {
    zone.append(enonce(act.question));
    const acceptees = [].concat(act.reponse).map(String);
    const queDesChiffres = acceptees.every((r) => /^[\d\s.,-]+$/.test(r));
    const champ = el('input', {
      class: 'champ', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
      placeholder: act.strict ? 'Attention aux accents !' : 'Ta réponse…',
      inputmode: queDesChiffres ? 'decimal' : 'text', // clavier numérique si besoin
    });
    const valider = () => {
      if (!champ.value.trim()) { champ.focus(); return; }
      champ.disabled = true;
      bouton.disabled = true;
      const ok = acceptees.some((r) => normaliser(r, act.strict) === normaliser(champ.value, act.strict))
        || (etat.enfant?.orthographeSouple && !queDesChiffres
          && acceptees.some((r) => procheOrtho(normaliser(r), normaliser(champ.value))));
      champ.classList.add(ok ? 'bon' : 'faux');
      fin(ok, acceptees[0]);
    };
    const bouton = el('button', { class: 'btn-principal', onclick: valider }, 'Valider ✔');
    champ.addEventListener('keydown', (e) => { if (e.key === 'Enter') valider(); });
    zone.append(champ, bouton);
    setTimeout(() => champ.focus(), 150);
  },

  /* TEXTE À TROUS — "texte": "Le [chat] dort." ; "intrus": mots pièges en plus.
     L'enfant touche les étiquettes : elles remplissent les trous dans l'ordre. */
  trous(act, zone, fin) {
    // split avec une parenthèse capturante : les cases impaires sont les mots à trouver
    const morceaux = act.texte.split(/\[([^\]]+)\]/);
    const attendus = morceaux.filter((_, i) => i % 2 === 1);
    let fini = false;
    const trous = [];

    const phrase = el('p', { class: 'phrase-trous' }, morceaux.map((m, i) => {
      if (i % 2 === 0) return m;
      const t = el('button', { class: 'trou', onclick: () => vider(t) }, '\u00a0');
      t.etiquette = null; // étiquette placée dans ce trou
      trous.push(t);
      return t;
    }));

    const etiquettes = melanger([...attendus, ...(act.intrus || [])]).map((mot) =>
      el('button', { class: 'etiquette', onclick: (e) => placer(e.currentTarget) }, mot));
    const bouton = el('button', { class: 'btn-principal', disabled: '', onclick: verifier }, 'Valider ✔');

    function placer(etiquette) {
      const libre = trous.find((t) => !t.etiquette);
      if (!libre || fini) return;
      libre.etiquette = etiquette;
      libre.textContent = texteSans(etiquette);
      libre.classList.add('rempli');
      etiquette.hidden = true;
      bouton.disabled = trous.some((t) => !t.etiquette);
    }
    function vider(trou) { // toucher un trou rempli renvoie l'étiquette dans la réserve
      if (!trou.etiquette || fini) return;
      trou.etiquette.hidden = false;
      trou.etiquette = null;
      trou.textContent = '\u00a0';
      trou.classList.remove('rempli');
      bouton.disabled = true;
    }
    function verifier() {
      fini = true;
      bouton.disabled = true;
      etiquettes.forEach((e) => (e.disabled = true));
      let ok = true;
      trous.forEach((t, i) => {
        const bon = t.textContent === attendus[i];
        t.classList.add(bon ? 'bon' : 'faux');
        if (!bon) ok = false;
      });
      fin(ok, morceaux.join(''));
    }

    zone.append(enonce(act.consigne || 'Complète avec les bonnes étiquettes'),
      phrase, el('div', { class: 'banque' }, etiquettes), bouton);
  },

  /* ASSOCIER — "paires": [["gauche","droite"], ...]
     Toucher un élément à gauche puis son partenaire à droite.
     Réussi si aucune erreur en chemin. */
  paires(act, zone, fin) {
    zone.append(enonce(act.consigne || 'Associe chaque élément à son partenaire'));
    let choisi = null; // bouton de gauche sélectionné
    let erreurs = 0;
    let trouvees = 0;
    // une association est bonne si elle existe dans la liste (gère les doublons à droite)
    const estPaire = (g, d) => act.paires.some((p) => sansMots(p[0]) === g && sansMots(p[1]) === d);
    // mot étranger d'une tuile (dans l'une ou l'autre colonne), pour le prononcer quand la paire est trouvée
    const motDeTuile = (t) => act.paires.flat().map(String).filter((x) => sansMots(x) === t).flatMap(motsDe)[0];

    const colGauche = el('div', { class: 'colonne' },
      melanger(act.paires.map((p) => sansMots(p[0]))).map((texte) => {
        const b = el('button', {
          class: 'tuile',
          onclick: () => {
            colGauche.querySelectorAll('.choisie').forEach((x) => x.classList.remove('choisie'));
            b.classList.add('choisie');
            choisi = b;
          },
        }, texte);
        return b;
      }));

    const colDroite = el('div', { class: 'colonne' },
      melanger(act.paires.map((p) => sansMots(p[1]))).map((texte) => {
        const b = el('button', {
          class: 'tuile droite',
          onclick: () => {
            if (!choisi) { secouer(colGauche); return; } // il faut d'abord choisir à gauche
            if (estPaire(texteSans(choisi), texte)) {
              const aDire = motDeTuile(texteSans(choisi)) || motDeTuile(texte);
              if (aDire) prononcer(aDire);
              [choisi, b].forEach((x) => { x.classList.remove('choisie'); x.classList.add('bon'); x.disabled = true; });
              choisi = null;
              trouvees++;
              if (trouvees === act.paires.length) fin(erreurs === 0, null);
              else son('petit');
            } else {
              erreurs++;
              secouer(b);
              secouer(choisi);
              son('faux');
              vibrer(80);
            }
          },
        }, texte);
        return b;
      }));

    zone.append(el('div', { class: 'paires' }, colGauche, colDroite));
  },

  /* REMETTRE DANS L'ORDRE — "elements": écrits dans le BON ordre (l'appli mélange) */
  ordre(act, zone, fin) {
    zone.append(enonce(act.consigne || 'Remets dans le bon ordre'));
    const ligne = el('ol', { class: 'ligne-ordre' });
    const reserve = el('div', { class: 'banque' });
    let fini = false;
    const bouton = el('button', { class: 'btn-principal', disabled: '', onclick: verifier }, 'Valider ✔');

    melanger(act.elements.map(String)).forEach((texte) => {
      const b = el('button', {
        class: 'etiquette',
        onclick: () => {
          if (fini) return;
          // touche dans la réserve -> va dans la ligne ; touche dans la ligne -> revient
          (b.parentNode === reserve ? ligne : reserve).append(b);
          bouton.disabled = reserve.children.length > 0;
        },
      }, texte);
      reserve.append(b);
    });

    function verifier() {
      fini = true;
      bouton.disabled = true;
      let ok = true;
      [...ligne.children].forEach((b, i) => {
        const bon = texteSans(b) === String(act.elements[i]);
        b.classList.add(bon ? 'bon' : 'faux');
        b.disabled = true;
        if (!bon) ok = false;
      });
      fin(ok, act.elements.join(' → '));
    }

    zone.append(el('p', { class: 'aide' }, 'Touche les étiquettes dans l’ordre :'), ligne, reserve, bouton);
  },

  /* CARTE MÉMO — "recto" / "verso". L'enfant réfléchit, retourne, puis dit s'il savait. */
  carte(act, zone, fin) {
    const boutons = el('div', { class: 'liste-choix deux', hidden: '' },
      el('button', { class: 'choix', onclick: () => { boutons.hidden = true; fin(true); } }, '😎 Je savais'),
      el('button', { class: 'choix', onclick: () => { boutons.hidden = true; fin(false); } }, '🤔 À revoir'));
    const carte = el('div', {
      class: 'carte-memo',
      onclick: () => {
        if (carte.classList.contains('retournee')) return;
        carte.classList.add('retournee');
        boutons.hidden = false;
        const aDire = motsDe(act.verso)[0];
        if (aDire) setTimeout(() => prononcer(aDire), 400); // laisse le temps à la carte de tourner
      },
    },
      el('div', { class: 'face recto' }, el('span', {}, enrichir(act.recto)), el('small', {}, 'Touche pour retourner')),
      el('div', { class: 'face verso' }, el('span', {}, enrichir(act.verso))));
    zone.append(enonce(act.consigne || 'Réfléchis, puis retourne la carte'), carte, boutons);
  },
};

/* ---------- 7. DÉMARRAGE ------------------------------------- */

// Compare deux numéros "1.3.0" / "1.4.0" : true si a est plus ancien que b
function plusAncienne(a, b) {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0);
  return false;
}

async function demarrer() {
  $('#version').textContent = 'v' + VERSION;

  // Écran de lancement : on laisse le logo SV se dessiner (≈ 1,6 s) puis il s'efface en fondu.
  // Toucher l'écran le fait disparaître tout de suite.
  const lancement = $('#lancement');
  const finLancement = () => { lancement?.classList.add('fini'); setTimeout(() => lancement?.remove(), 500); };
  lancement?.addEventListener('click', finLancement);
  setTimeout(finLancement, 2100);

  // Bouton retour de la barre = bouton retour d'Android
  $('#btn-retour').addEventListener('click', () => history.back());

  // Bouton son on/off (mémorisé)
  const btnSon = $('#btn-son');
  const majSon = () => { btnSon.textContent = sonActif ? '🔊' : '🔇'; };
  majSon();
  btnSon.addEventListener('click', () => {
    sonActif = !sonActif;
    localStorage.setItem('revisions-son', sonActif ? 'oui' : 'non');
    majSon();
    son('petit');
  });

  // Chargement des leçons. cache:'no-store' = toujours la dernière version publiée.
  try {
    const rep = await fetch('lecons.json', { cache: 'no-store' });
    if (!rep.ok) throw new Error('Fichier introuvable (erreur ' + rep.status + ')');
    etat.donnees = await rep.json(); // plante ici si une virgule manque dans le JSON
    // Les leçons demandent une version plus récente du moteur ? (ex. ancien app.js resté en cache)
    // -> on force la mise à jour et on recharge UNE fois (le drapeau évite une boucle infinie).
    const requise = etat.donnees.versionApp;
    if (requise && plusAncienne(VERSION, requise) && !sessionStorage.getItem('revisions-maj')) {
      sessionStorage.setItem('revisions-maj', '1');
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.update().catch(() => {});
      if (window.caches) for (const k of await caches.keys()) await caches.delete(k); // vide les vieilles copies
      location.reload();
      return;
    }
    sessionStorage.removeItem('revisions-maj');
  } catch (err) {
    afficher(el('div', { class: 'vide' },
      el('div', { class: 'gros-emoji' }, '😵'),
      el('p', {}, 'Impossible de lire les leçons.'),
      el('pre', { class: 'erreur' }, err.message),
      el('p', { class: 'aide' }, 'Vérifie lecons.json (une virgule ou un guillemet oublié ?)')));
    return;
  }

  // Liste des MP3 de la voix de Papa (facultatif : sans ce fichier, voix du téléphone)
  try {
    const rep = await fetch('audio/index.json', { cache: 'no-store' });
    if (rep.ok) audiosDispo = new Set(await rep.json());
  } catch { /* pas de liste : tant pis */ }
  try {
    const rep = await fetch('audio/lent/index.json', { cache: 'no-store' });
    if (rep.ok) audiosLents = new Set(await rep.json());
  } catch { /* pas de versions lentes : on garde les normales */ }

  // Premier écran = racine de la pile
  pile.push([afficherAccueil, []]);
  history.replaceState({ niveau: 1 }, '');
  if (!restaurerEcran()) afficherAccueil();
  $('#titre').addEventListener('click', toucheTitre);   // 🎮 3 touches sur « Leçons de … » = jeu caché   // on revient là où on était avant l'actualisation

  // Retour dans l'appli (après l'avoir mise en arrière-plan) avec une leçon en attente : on actualise tout seul
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && lireStock(CLE_ATTENTES, []).length) actualiser({ discret: true });
  });

  // Active le mode hors-ligne
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  // updateViaCache 'none' : le téléphone vérifie sw.js ET version.js sans passer par son cache
}

/* Raccourcis clavier (pratique sur ordinateur) :
     1 à 9  -> choisir la réponse n° 1 à 9 (QCM, vrai/faux)
     Entrée -> question suivante / bouton principal
     Échap  -> fermer la bulle d'un mot, sinon écran précédent */
addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const dansUnChamp = e.target.matches('input, textarea');
  if (e.key === 'Escape') {
    if (lecteurMot) fermerLecteurMot(); else if (pile.length > 1) history.back();
    return;
  }
  if (dansUnChamp) return; // la touche Entrée d'un champ est gérée par l'activité elle-même
  if (e.key === 'Enter' && e.target.matches('button')) return; // bouton déjà sélectionné : Entrée le clique déjà
  if (/^[1-9]$/.test(e.key)) {
    const choix = [...document.querySelectorAll('.liste-choix:not([hidden]) .choix:not(:disabled)')];
    choix[Number(e.key) - 1]?.click();
  } else if (e.key === 'Enter') {
    const suivant = document.querySelector('.retour .btn-principal, .resultat .btn-principal');
    if (suivant) { e.preventDefault(); suivant.click(); }
  }
});

demarrer();
