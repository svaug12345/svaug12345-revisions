/* =============================================================
   MES RÉVISIONS — moteur de l'appli
   -------------------------------------------------------------
   Ce fichier ne contient AUCUNE leçon : il lit lecons.json et
   fabrique les écrans. Pour ajouter du contenu, on ne touche
   qu'à lecons.json.

   Plan du fichier :
     1. Outils (créer des éléments, mélanger, comparer des réponses…)
     2. Progrès des enfants (étoiles, sauvegardées dans le téléphone)
     3. Sons, voix et confettis
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

/* ---------- 2. PROGRÈS (sauvegardés dans le téléphone) ------- */
// localStorage garde les données même quand on ferme l'appli.
// Structure : { tom: { "table-7": { etoiles: 2, meilleur: 80, fois: 3 } }, ... }

const CLE_PROGRES = 'revisions-progres';

function lireProgres() {
  try { return JSON.parse(localStorage.getItem(CLE_PROGRES)) || {}; }
  catch { return {}; }
}

function enregistrerScore(idEnfant, idLecon, etoiles, pourcentage) {
  const p = lireProgres();
  p[idEnfant] ??= {};
  const ancien = p[idEnfant][idLecon] || { etoiles: 0, meilleur: 0, fois: 0 };
  p[idEnfant][idLecon] = {
    etoiles: Math.max(ancien.etoiles, etoiles),      // on garde le meilleur résultat
    meilleur: Math.max(ancien.meilleur, pourcentage),
    fois: ancien.fois + 1,
    dernier: Date.now(),
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

addEventListener('popstate', () => {
  if (pile.length > 1) {
    pile.pop();
    const [fonctionEcran, args] = pile.at(-1);
    fonctionEcran(...args);
    scrollTo(0, 0);
  }
});

// Met à jour la barre du haut pour l'écran affiché
function entete(titre) {
  $('#titre').textContent = titre;
  $('#btn-retour').hidden = pile.length <= 1;
  $('#badge-enfant').replaceChildren(etat.enfant ? dessinAvatar(etat.enfant, 'mini-avatar') : '');
  couperVoix(); // on coupe la voix en changeant d'écran
  fermerLecteurMot(); // et on range le lecteur de mots étrangers
}

/* ---------- 5. LES ÉCRANS ------------------------------------ */

// --- Accueil : « Qui révise ? » ---
function afficherAccueil() {
  etat.enfant = null;
  entete('Qui révise ?');
  const d = etat.donnees;
  afficher(
    el('p', { class: 'intro' }, 'Choisis ton profil pour commencer 👇'),
    el('div', { class: 'grille-enfants' },
      d.enfants.map((enfant) => {
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
    ),
    d.maj ? el('p', { class: 'maj' }, `Leçons mises à jour le ${d.maj}`) : null,
  );
}

// --- Liste des leçons de l'enfant, rangées par matière ---
function afficherLecons() {
  const enfant = etat.enfant;
  entete(`Leçons de ${enfant.nom}`);
  const toutes = leconsDe(enfant.id);
  const lecons = toutes.filter((l) => !estArchivee(enfant.id, l));
  const archivees = toutes.filter((l) => estArchivee(enfant.id, l));

  // Bloc "📦 Leçons archivées" (replié par défaut), rangé lui aussi par matière,
  // avec un bouton pour ressortir chaque leçon
  const blocArchives = archivees.length ? el('details', { class: 'archives' },
    el('summary', {}, `📦 Leçons archivées (${archivees.length})`),
    parMatiere(archivees).map(([matiere, liste]) => el('section', { class: 'groupe' },
      el('h2', {}, matiere),
      liste.map((l) => el('div', { class: 'ligne-archive' },
        carteLecon(l, 'archivee'),
        el('button', {
          class: 'btn-petit', title: 'Remettre dans mes leçons',
          onclick: () => { changerArchive(enfant.id, l, false); afficherLecons(); },
        }, '📤 Ressortir')))))) : null;

  if (!lecons.length) {
    afficher(el('div', { class: 'vide' },
      el('div', { class: 'gros-emoji' }, '📭'),
      el('p', {}, archivees.length ? 'Toutes tes leçons sont archivées 📦' : 'Pas encore de leçon ici. Demande à Papa d’en ajouter 😉')),
      blocArchives);
    return;
  }

  afficher(...parMatiere(lecons).map(([matiere, liste]) =>
    el('section', { class: 'groupe' },
      el('h2', {}, matiere),
      liste.map((l) => carteLecon(l)),
    )), blocArchives);
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
function carteLecon(l, classe = '') {
  return el('button', { class: 'carte-lecon ' + classe, onclick: () => aller(afficherLecon, l) },
    el('span', { class: 'emoji' }, l.emoji || '📘'),
    el('span', { class: 'infos' }, el('b', {}, l.titre)),
    el('span', { class: 'etoiles' }, dessinEtoiles(etoilesDe(etat.enfant.id, l.id))));
}

// --- Une leçon : la fiche à relire + le bouton pour lancer le quiz ---
function afficherLecon(lecon) {
  entete(lecon.titre);
  langueLecon = lecon.langue || null;
  const nb = (lecon.activites || []).length;
  afficher(
    el('div', { class: 'tete-lecon' },
      el('span', { class: 'gros-emoji' }, lecon.emoji || '📘'),
      el('div', {}, el('small', {}, lecon.matiere || ''), el('h2', {}, lecon.titre))),
    dessinerFiche(lecon),
    nb
      ? el('button', { class: 'btn-principal collant', onclick: () => aller(lancerQuiz, lecon) },
        `🚀 C'est parti ! (${pluriel(nb, 'question')})`)
      : el('p', { class: 'vide' }, 'Pas encore de questions pour cette leçon.'),
    etat.enfant ? el('button', {
      class: 'btn-secondaire btn-archive',
      onclick: () => {
        const archiver = !estArchivee(etat.enfant.id, lecon);
        changerArchive(etat.enfant.id, lecon, archiver);
        afficherLecon(lecon); // redessine le bouton
        toast(archiver ? '📦 Leçon archivée' : '📤 Leçon remise dans ta liste');
      },
    }, estArchivee(etat.enfant.id, lecon) ? '📤 Ressortir cette leçon des archives' : '📦 Archiver cette leçon (je la connais !)') : null,
  );
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
    contenuBloc(b.contenu))));
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
  const questions = lecon.melanger === false ? [...lecon.activites] : melanger(lecon.activites);
  questionSuivante({ lecon, questions, i: 0, bons: 0, erreurs: [], entrainement: false, serie: 0, historique: [] });
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
    zone);
  const retour = el('div', { class: 'retour' });
  afficher(
    dessinPiste(q),
    el('p', { class: 'compteur' }, `${q.entrainement ? '🔁 Deuxième chance · ' : ''}Question ${q.i + 1} / ${q.questions.length}`,
      q.serie >= 2 ? el('span', { class: 'serie' }, ` · 🔥 ${q.serie} d’affilée`) : null),
    carte,
    retour,
  );

  dessiner(activite, zone, (reussi, bonneReponse) => {
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
          el('b', {}, auHasard(reussi ? BRAVO : OUPS))),
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
    enregistrerScore(etat.enfant.id, q.lecon.id, etoiles, pct);
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
    el('button', { class: restantes.length ? 'btn-secondaire' : 'btn-principal', onclick: () => lancerQuiz(lecon) }, '🔄 Rejouer toute la leçon'),
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
          boutons.find((b) => b.textContent === sansMots(bonne)).classList.add('bon'); // montre la bonne
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
      const ok = acceptees.some((r) => normaliser(r, act.strict) === normaliser(champ.value, act.strict));
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
      libre.textContent = etiquette.textContent;
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
            if (estPaire(choisi.textContent, texte)) {
              const aDire = motDeTuile(choisi.textContent) || motDeTuile(texte);
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
        const bon = b.textContent === String(act.elements[i]);
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

  // Premier écran = racine de la pile
  pile.push([afficherAccueil, []]);
  history.replaceState({ niveau: 1 }, '');
  afficherAccueil();

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
