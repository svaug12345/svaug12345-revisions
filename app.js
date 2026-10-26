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
 * Rend une réponse tapée « comparable » : minuscules, sans accents,
 * sans ponctuation, espaces simplifiés. Ainsi "Évaporation !" = "evaporation".
 */
function normaliser(texte) {
  return String(texte)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // enlève les accents
    .replace(/[.,;:!?'’"«»()\-\s]+/g, ' ')            // ponctuation -> espace
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
    const ligne = brute.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
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

// La fiche peut être écrite dans le JSON comme un tableau de lignes (plus pratique) ou un seul texte
const texteFiche = (lecon) => (Array.isArray(lecon.fiche) ? lecon.fiche.join('\n') : lecon.fiche || '');

// Leçons visibles par un enfant : "pour" absent ou contenant son id ou "tous"
function leconsDe(idEnfant) {
  return etat.donnees.lecons.filter(
    (l) => !l.pour || l.pour.includes(idEnfant) || l.pour.includes('tous')
  );
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

/** Lecture à voix haute avec la synthèse vocale du téléphone (en français). */
function parler(texte) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const phrase = new SpeechSynthesisUtterance(texte.replace(/\*\*|^#\s|^-\s/gm, ''));
  phrase.lang = 'fr-FR';
  phrase.rate = 0.95;
  speechSynthesis.speak(phrase);
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
  $('#badge-enfant').textContent = etat.enfant ? etat.enfant.avatar || '🙂' : '';
  window.speechSynthesis?.cancel(); // on coupe la voix en changeant d'écran
}

/* ---------- 5. LES ÉCRANS ------------------------------------ */

// --- Accueil : « Qui révise ? » ---
function afficherAccueil() {
  etat.enfant = null;
  entete('Qui révise ?');
  const d = etat.donnees;
  ecran.replaceChildren(
    el('p', { class: 'intro' }, 'Choisis ton profil pour commencer 👇'),
    el('div', { class: 'grille-enfants' },
      d.enfants.map((enfant) => {
        const lecons = leconsDe(enfant.id);
        const total = lecons.reduce((s, l) => s + etoilesDe(enfant.id, l.id), 0);
        return el('button', {
          class: 'carte-enfant',
          style: `--c:${enfant.couleur || '#14b8a6'}`,
          onclick: () => { etat.enfant = enfant; aller(afficherLecons); },
        },
          el('span', { class: 'avatar' }, enfant.avatar || '🙂'),
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
  const lecons = leconsDe(enfant.id);

  if (!lecons.length) {
    ecran.replaceChildren(el('div', { class: 'vide' },
      el('div', { class: 'gros-emoji' }, '📭'),
      el('p', {}, 'Pas encore de leçon ici. Demande à Papa d’en ajouter 😉')));
    return;
  }

  // Regroupe par matière en gardant l'ordre du fichier
  const groupes = new Map();
  for (const l of lecons) {
    const m = l.matiere || 'Divers';
    if (!groupes.has(m)) groupes.set(m, []);
    groupes.get(m).push(l);
  }

  ecran.replaceChildren(...[...groupes].map(([matiere, liste]) =>
    el('section', { class: 'groupe' },
      el('h2', {}, matiere),
      liste.map((l) => el('button', { class: 'carte-lecon', onclick: () => aller(afficherLecon, l) },
        el('span', { class: 'emoji' }, l.emoji || '📘'),
        el('span', { class: 'infos' },
          el('b', {}, l.titre),
          el('small', {}, pluriel((l.activites || []).length, 'question'))),
        el('span', { class: 'etoiles' }, dessinEtoiles(etoilesDe(enfant.id, l.id))),
      )),
    )));
}

// --- Une leçon : la fiche à relire + le bouton pour lancer le quiz ---
function afficherLecon(lecon) {
  entete(lecon.titre);
  const fiche = texteFiche(lecon);
  const nb = (lecon.activites || []).length;
  ecran.replaceChildren(
    el('div', { class: 'tete-lecon' },
      el('span', { class: 'gros-emoji' }, lecon.emoji || '📘'),
      el('div', {}, el('small', {}, lecon.matiere || ''), el('h2', {}, lecon.titre))),
    fiche ? el('article', { class: 'fiche' },
      el('div', { class: 'fiche-haut' },
        el('h3', {}, '📖 La leçon'),
        el('button', { class: 'btn-icone', 'aria-label': 'Écouter la leçon', onclick: () => parler(fiche) }, '🔊')),
      el('div', { html: miseEnForme(fiche) })) : null,
    nb
      ? el('button', { class: 'btn-principal collant', onclick: () => aller(lancerQuiz, lecon) },
        `🚀 C'est parti ! (${pluriel(nb, 'question')})`)
      : el('p', { class: 'vide' }, 'Pas encore de questions pour cette leçon.'),
  );
}

// --- Le quiz : on enchaîne les activités dans un ordre mélangé ---
function lancerQuiz(lecon) {
  entete(lecon.titre);
  const questions = lecon.melanger === false ? [...lecon.activites] : melanger(lecon.activites);
  questionSuivante({ lecon, questions, i: 0, bons: 0, erreurs: [], entrainement: false });
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

  const zone = el('div', { class: 'zone-question' });
  const retour = el('div', { class: 'retour' });
  ecran.replaceChildren(
    el('div', { class: 'progression' },
      el('div', { class: 'barre', style: `width:${(q.i / q.questions.length) * 100}%` })),
    el('p', { class: 'compteur' }, `${q.entrainement ? '🔁 ' : ''}Question ${q.i + 1} / ${q.questions.length}`),
    zone,
    retour,
  );

  dessiner(activite, zone, (reussi, bonneReponse) => {
    if (reussi) q.bons++; else q.erreurs.push(activite);
    son(reussi ? 'bon' : 'faux');
    if (!reussi) vibrer(120);

    const derniere = q.i + 1 >= q.questions.length;
    retour.replaceChildren(
      el('div', { class: 'bandeau ' + (reussi ? 'ok' : 'ko') },
        el('b', {}, auHasard(reussi ? BRAVO : OUPS)),
        !reussi && bonneReponse ? el('p', {}, 'La bonne réponse : ', el('b', {}, bonneReponse)) : null,
        activite.explication ? el('p', { class: 'explication' }, '💡 ' + activite.explication) : null),
      el('button', { class: 'btn-principal', onclick: () => { q.i++; questionSuivante(q); scrollTo(0, 0); } },
        derniere ? 'Voir mon score 🏁' : 'Question suivante →'),
    );
    retour.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

// --- Écran de fin : étoiles, message, rejouer ---
function afficherResultat(q) {
  const total = q.questions.length;
  const pct = Math.round((q.bons / total) * 100);
  const etoiles = pct >= 90 ? 3 : pct >= 70 ? 2 : pct >= 40 ? 1 : 0;
  // Le mode "retravailler mes erreurs" ne compte pas dans les étoiles
  if (!q.entrainement) enregistrerScore(etat.enfant.id, q.lecon.id, etoiles, pct);

  const messages = ['On recommence ? Tu vas y arriver 💪', 'Pas mal ! Encore un petit effort 🙂', 'Très bien ! 👏', 'Magnifique ! 🏆'];
  const nbErreurs = q.erreurs.length;

  ecran.replaceChildren(el('div', { class: 'resultat' },
    el('div', { class: 'grosses-etoiles' },
      [0, 1, 2].map((i) => el('span', { class: i < etoiles ? 'pleine' : 'eteinte', style: `animation-delay:${i * 0.25}s` }, '★'))),
    el('h2', {}, q.entrainement && nbErreurs === 0 ? 'Erreurs corrigées ! 🎯' : messages[etoiles]),
    el('p', { class: 'score' }, `${q.bons} / ${total} bonne${q.bons > 1 ? 's' : ''} réponse${q.bons > 1 ? 's' : ''}`),
    nbErreurs ? el('button', { class: 'btn-principal', onclick: () => revoirErreurs(q) },
      `🔁 Retravailler ${nbErreurs > 1 ? `mes ${nbErreurs} erreurs` : 'mon erreur'}`) : null,
    el('button', { class: nbErreurs ? 'btn-secondaire' : 'btn-principal', onclick: () => lancerQuiz(q.lecon) }, '🔄 Rejouer toute la leçon'),
    el('button', { class: 'btn-secondaire', onclick: () => history.back() }, '📖 Revenir à la fiche'),
  ));

  son(etoiles >= 2 ? 'fin' : 'petit');
  if (etoiles >= 2 || (q.entrainement && nbErreurs === 0)) confettis();
}

// Rejoue seulement les questions ratées
function revoirErreurs(q) {
  questionSuivante({ lecon: q.lecon, questions: melanger(q.erreurs), i: 0, bons: 0, erreurs: [], entrainement: true });
  scrollTo(0, 0);
}

/* ---------- 6. LES TYPES D'ACTIVITÉS ------------------------- */
// Chaque fonction reçoit : l'activité (lue dans le JSON), la zone où
// dessiner, et fin(reussi, bonneReponse) à appeler quand c'est répondu.

// Énoncé + bouton 🔊 pour l'écouter (pratique pour les plus jeunes)
function enonce(texte) {
  return el('div', { class: 'enonce' },
    el('p', {}, texte),
    el('button', { class: 'btn-icone', 'aria-label': 'Lire à voix haute', onclick: () => parler(texte) }, '🔊'));
}

const ACTIVITES = {

  /* QCM — "choix": la PREMIÈRE proposition est la bonne (l'appli mélange) */
  qcm(act, zone, fin) {
    zone.append(enonce(act.question));
    const bonne = String(act.choix[0]);
    const boutons = melanger(act.choix.map(String)).map((texte) =>
      el('button', {
        class: 'choix',
        onclick: (e) => {
          boutons.forEach((b) => (b.disabled = true));
          const ok = texte === bonne;
          e.currentTarget.classList.add(ok ? 'bon' : 'faux');
          boutons.find((b) => b.textContent === bonne).classList.add('bon'); // montre la bonne
          fin(ok, bonne);
        },
      }, texte));
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
     Majuscules, accents et ponctuation ne comptent pas. */
  saisie(act, zone, fin) {
    zone.append(enonce(act.question));
    const acceptees = [].concat(act.reponse).map(String);
    const queDesChiffres = acceptees.every((r) => /^[\d\s.,-]+$/.test(r));
    const champ = el('input', {
      class: 'champ', type: 'text', autocomplete: 'off', autocapitalize: 'off',
      placeholder: 'Ta réponse…', inputmode: queDesChiffres ? 'decimal' : 'text', // clavier numérique si besoin
    });
    const valider = () => {
      if (!champ.value.trim()) { champ.focus(); return; }
      champ.disabled = true;
      bouton.disabled = true;
      const ok = acceptees.some((r) => normaliser(r) === normaliser(champ.value));
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
    const estPaire = (g, d) => act.paires.some((p) => String(p[0]) === g && String(p[1]) === d);

    const colGauche = el('div', { class: 'colonne' },
      melanger(act.paires.map((p) => String(p[0]))).map((texte) => {
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
      melanger(act.paires.map((p) => String(p[1]))).map((texte) => {
        const b = el('button', {
          class: 'tuile droite',
          onclick: () => {
            if (!choisi) { secouer(colGauche); return; } // il faut d'abord choisir à gauche
            if (estPaire(choisi.textContent, texte)) {
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
      },
    },
      el('div', { class: 'face recto' }, el('span', {}, act.recto), el('small', {}, 'Touche pour retourner')),
      el('div', { class: 'face verso' }, el('span', {}, act.verso)));
    zone.append(enonce(act.consigne || 'Réfléchis, puis retourne la carte'), carte, boutons);
  },
};

/* ---------- 7. DÉMARRAGE ------------------------------------- */

async function demarrer() {
  $('#version').textContent = 'v' + VERSION;

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
  } catch (err) {
    ecran.replaceChildren(el('div', { class: 'vide' },
      el('div', { class: 'gros-emoji' }, '😵'),
      el('p', {}, 'Impossible de lire les leçons.'),
      el('pre', { class: 'erreur' }, err.message),
      el('p', { class: 'aide' }, 'Vérifie lecons.json (une virgule ou un guillemet oublié ?)')));
    return;
  }

  // Premier écran = racine de la pile
  pile.push([afficherAccueil, []]);
  history.replaceState({ niveau: 1 }, '');
  afficherAccueil();

  // Active le mode hors-ligne
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

demarrer();
