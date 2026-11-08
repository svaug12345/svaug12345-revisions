/* =============================================================
   MES RÉVISIONS — visuels pédagogiques (schémas, animations, jeux)
   -------------------------------------------------------------
   Dans lecons.json, la "fiche" d'une leçon est une liste de lignes.
   En plus des lignes de texte, on peut y glisser des OBJETS :
       { "visuel": "eprouvette", "titre": "Lire un volume", ... }
   Chaque type de visuel est une fonction de l'objet VISUELS
   ci-dessous : elle reçoit l'objet du JSON et renvoie un élément HTML.

   Les animations démarrent quand le visuel apparaît à l'écran
   (IntersectionObserver ajoute la classe "vu" et l'événement "vu").

   Ce fichier est chargé AVANT app.js mais n'utilise les outils de
   app.js (el, ouvrirBulleMot, MOT_ETRANGER…) qu'au moment de dessiner,
   quand tout est déjà chargé.
   ============================================================= */
'use strict';

/* ---------- Outils communs ---------- */

// "**gras**" -> <b>gras</b> (renvoie une liste de morceaux)
function gras(texte) {
  return String(texte).split(/\*\*(.+?)\*\*/g)
    .map((x, i) => (i % 2 ? el('b', {}, x) : x))
    .filter((x) => x !== '');
}

/** Texte -> morceaux : **gras** + {{mots étrangers}} cliquables (bulle écouter / répéter). */
function enrichir(texte) {
  const s = String(texte ?? '');
  const res = [];
  let fin = 0;
  for (const m of s.matchAll(MOT_ETRANGER)) {
    res.push(...gras(s.slice(fin, m.index)));
    const affiche = m[1];
    const dit = (m[2] || m[1]).replace(/\*\*/g, '');
    res.push(el('button', { class: 'mot', onclick: (e) => { e.stopPropagation(); ouvrirBulleMot(affiche, dit); } }, gras(affiche)));
    fin = m.index + m[0].length;
  }
  res.push(...gras(s.slice(fin)));
  return res;
}

// Nombre -> texte à la française : 0.056 -> "0,056" ; 1000 -> "1 000"
// useGrouping: 'always' -> espace aussi à 4 chiffres (« 1 250 » et pas « 1250 »), comme à l'école
const nombreFr = (n) => Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 6, useGrouping: 'always' });
// Texte -> nombre ("2,5" -> 2.5)
const lireNombre = (t) => Number(String(t).replace(/\s/g, '').replace(',', '.'));

/** Nombre de 0 à 100 -> en toutes lettres : 34 -> "trente-quatre", 71 -> "soixante et onze", 80 -> "quatre-vingts".
    Sert à ce que la voix lit : écrit en chiffres, ElevenLabs lit parfois les nombres en anglais. */
function nomNombre(n) {
  const U = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
    'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
  const D = { 2: 'vingt', 3: 'trente', 4: 'quarante', 5: 'cinquante', 6: 'soixante' };
  if (n < 20) return U[n];
  if (n === 100) return 'cent';
  const d = Math.floor(n / 10), u = n % 10;
  if (d === 7 || d === 9) {                     // 70-79 = soixante + 10..19, 90-99 = quatre-vingt + 10..19
    const base = d === 7 ? 'soixante' : 'quatre-vingt';
    return base + (d === 7 && u === 1 ? ' et ' : '-') + U[10 + u];
  }
  if (d === 8) return u === 0 ? 'quatre-vingts' : 'quatre-vingt-' + U[u];
  if (u === 0) return D[d];
  return D[d] + (u === 1 ? ' et un' : '-' + U[u]);
}

// Déclenche les animations quand le visuel devient visible (au moins 30 %)
const observateur = 'IntersectionObserver' in window
  ? new IntersectionObserver((entrees) => {
    for (const e of entrees) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('vu');
      e.target.dispatchEvent(new Event('vu'));
      observateur.unobserve(e.target);
    }
  }, { threshold: 0.3 })
  : null;

/** Fabrique le cadre commun d'un visuel (titre, consigne) et branche l'animation. */
function dessinerVisuel(v) {
  const fabrique = VISUELS[v.visuel];
  if (!fabrique) return el('p', { class: 'erreur' }, `Visuel inconnu : ${v.visuel}`);
  const cadre = el('figure', { class: 'visuel visuel-' + v.visuel });
  if (v.titre) cadre.append(el('figcaption', {}, enrichir(v.titre)));
  cadre.append(fabrique(v, cadre));
  if (v.legende) cadre.append(el('p', { class: 'legende' }, enrichir(v.legende)));
  // L'observateur ne voit l'élément qu'une fois dans la page : on attend la prochaine image
  requestAnimationFrame(() => (observateur ? observateur.observe(cadre) : (cadre.classList.add('vu'), cadre.dispatchEvent(new Event('vu')))));
  return cadre;
}

// Petit délai d'apparition en cascade : style="--i:3" -> animation-delay calculé en CSS
const cascade = (i) => `--i:${i}`;

/* ---------- Les visuels ---------- */
const VISUELS = {

  /* ENCADRÉ coloré : { style: "astuce"|"attention"|"retenir"|"exemple", titre, texte (ou liste) } */
  encadre(v) {
    const icones = { astuce: '💡', attention: '⚠️', retenir: '🧠', exemple: '👀' };
    const style = v.style || 'retenir';
    return el('div', { class: 'encadre ' + style },
      el('div', { class: 'encadre-titre' }, `${icones[style] || '📌'} `, enrichir(v.nom || { astuce: 'Astuce', attention: 'Attention !', retenir: 'À retenir', exemple: 'Exemple' }[style])),
      [].concat(v.texte || []).map((t) => el('p', {}, enrichir(t))));
  },

  /* CARTES : { elements: [{ emoji, titre, texte }] } — grille de cartes qui apparaissent une à une */
  cartes(v) {
    return el('div', { class: 'grille-cartes' },
      v.elements.map((c, i) => el('div', { class: 'carte-info', style: cascade(i) + (c.couleur ? `;--teinte:${c.couleur}` : '') },
        c.emoji ? el('div', { class: 'carte-emoji' }, c.emoji) : null,
        c.titre ? el('b', {}, enrichir(c.titre)) : null,
        c.texte ? el('p', {}, enrichir(c.texte)) : null)));
  },

  /* TUILES : { elements: ["7 × 1 = 7", ...] } — petites tuiles (résultats d'une table…) */
  tuiles(v) {
    return el('div', { class: 'grille-tuiles' },
      v.elements.map((t, i) => el('div', { class: 'tuile-info', style: cascade(i) }, enrichir(t))));
  },

  /* CONJUGAISON : { colonnes: [{ titre, sousTitre, formes: ["je montr**ai**", ...] }] }
     Les **terminaisons** sont colorées et s'allument l'une après l'autre. */
  conjugaison(v) {
    return el('div', { class: 'conjugaison' },
      v.colonnes.map((c) => el('div', { class: 'colonne-conj' },
        el('div', { class: 'tete-conj' }, el('b', {}, enrichir(c.titre)), c.sousTitre ? el('small', {}, enrichir(c.sousTitre)) : null),
        el('ul', {}, c.formes.map((f, i) => el('li', { style: cascade(i) }, enrichir(f)))))));
  },

  /* TABLE DE MULTIPLICATION en points : { table: 7, max: 10, emoji: "🧍" (facultatif) }
     L'enfant choisit le multiplicateur : on voit les rangées de points et le résultat. */
  multiplication(v) {
    const t = v.table, max = v.max || 10;
    let n = v.depart || 3;
    const resultat = el('div', { class: 'mult-resultat' });
    const points = el('div', { class: 'mult-points' });
    const boutons = el('div', { class: 'mult-boutons' });
    function montrer(k) {
      n = k;
      resultat.replaceChildren(`${t} × ${k} = `, el('b', {}, String(t * k)));
      // k rangées de t points (une couleur par rangée)
      points.replaceChildren(...Array.from({ length: k }, (_, r) =>
        el('div', { class: 'rangee', style: `${cascade(r)};--h:${(r * 37) % 360}` },
          // "emoji" (facultatif) : un emoji à la place de chaque point (ex. 🧍 pour des joueurs)
          Array.from({ length: t }, () => (v.emoji ? el('span', { class: 'point-emoji' }, v.emoji) : el('span', { class: 'point' }))),
          el('small', {}, String(t * (r + 1))))));
      [...boutons.children].forEach((b, i) => b.classList.toggle('actif', i + 1 === k));
    }
    for (let k = 1; k <= max; k++) boutons.append(el('button', { onclick: () => { arreter(); montrer(k); } }, '×' + k));
    // Lecture automatique de 1 à max
    let minuteur = null;
    const arreter = () => { clearInterval(minuteur); minuteur = null; lecture.textContent = '▶ Tout voir'; };
    const lecture = el('button', {
      class: 'btn-visuel',
      onclick: () => {
        if (minuteur) return arreter();
        let k = 0;
        lecture.textContent = '⏸ Pause';
        minuteur = setInterval(() => { k++; montrer(k); if (k >= max) arreter(); }, 1100);
      },
    }, '▶ Tout voir');
    montrer(n);
    return el('div', {}, boutons, resultat, points, lecture);
  },

  /* FRISE chronologique verticale : { elements: [{ date, titre, texte, emoji }] } */
  frise(v) {
    return el('ol', { class: 'frise' },
      v.elements.map((e, i) => el('li', { style: cascade(i) },
        el('span', { class: 'frise-pastille' }, e.emoji || '•'),
        el('div', { class: 'frise-carte' },
          el('span', { class: 'frise-date' }, e.date),
          e.titre ? el('b', {}, enrichir(e.titre)) : null,
          e.texte ? el('p', {}, enrichir(e.texte)) : null))));
  },

  /* PLANS DU RÉCIT (imparfait / passé simple) :
     { exemples: [{ phrase, bande, evenements: ["…"] }] }
     Une longue bande = l'arrière-plan (imparfait), des éclairs = actions du premier plan (passé simple). */
  plans(v) {
    const scene = el('div', { class: 'plans-scene' });
    const phrase = el('p', { class: 'plans-phrase' });
    const choix = el('div', { class: 'plans-choix' });
    let courant = 0;
    function jouer(k) {
      courant = k;
      const ex = v.exemples[k];
      phrase.replaceChildren(...enrichir(ex.phrase));
      // les actions (éclairs) tombent dans la moitié droite : le texte de la bande reste lisible à gauche
      const position = (i) => 58 + (36 / (ex.evenements.length + 1)) * (i + 1);
      const evts = ex.evenements.flatMap((t, i) => [
        el('div', { class: 'plans-impact', style: `left:${position(i)}%;animation-delay:${1.2 + i * 0.8}s` }),
        el('div', {
          class: 'plans-eclair',
          style: `left:${position(i)}%;animation-delay:${0.9 + i * 0.8}s`,
        }, el('span', { class: 'plans-etiquette' }, enrichir(t)), el('span', { class: 'eclair' }, '⚡')),
      ]);
      scene.replaceChildren(
        el('div', { class: 'plans-axe' }, el('span', {}, 'temps du récit →')),
        el('div', { class: 'plans-bande' }, el('span', {}, enrichir(ex.bande))),
        ...evts);
      [...choix.children].forEach((b, i) => b.classList.toggle('actif', i === k));
    }
    if (v.exemples.length > 1) v.exemples.forEach((_, k) => choix.append(el('button', { onclick: () => jouer(k) }, `Exemple ${k + 1}`)));
    jouer(0);
    return el('div', {},
      choix, phrase, scene,
      el('div', { class: 'plans-legende' },
        el('span', { class: 'puce-bande' }, 'Imparfait = arrière-plan (décor, durée)'),
        el('span', { class: 'puce-eclair' }, '⚡ Passé simple = premier plan (action qui fait avancer l’histoire)')),
      el('button', { class: 'btn-visuel', onclick: () => jouer(courant) }, '🔁 Rejouer l’animation'));
  },

  /* DÉCISION : { question, choix: [{ si, alors, exemple }] } — on touche un cas pour voir la règle */
  decision(v) {
    const reponse = el('div', { class: 'decision-reponse', hidden: '' });
    const boutons = v.choix.map((c) => el('button', {
      class: 'decision-choix',
      onclick: (e) => {
        boutons.forEach((b) => b.classList.remove('actif'));
        e.currentTarget.classList.add('actif');
        reponse.hidden = false;
        reponse.replaceChildren(el('b', {}, '→ ', enrichir(c.alors)), c.exemple ? el('p', {}, enrichir(c.exemple)) : '');
        reponse.classList.remove('pop'); void reponse.offsetWidth; reponse.classList.add('pop'); // relance l'animation
      },
    }, enrichir(c.si)));
    return el('div', {},
      el('p', { class: 'decision-question' }, '🤔 ', enrichir(v.question)),
      el('div', { class: 'decision-liste' }, boutons), reponse);
  },

  /* MACHINE À CALCULER : { depart: 41, operations: ["× 2", "× 2"] }
     Le nombre traverse les opérations une par une. L'enfant peut changer le nombre de départ. */
  machine(v) {
    const champ = el('input', { class: 'machine-champ', type: 'text', inputmode: 'decimal', value: nombreFr(v.depart) });
    const chaine = el('div', { class: 'machine-chaine' });
    const appliquer = (x, op) => {
      const [, signe, val] = op.match(/^\s*([×x*:÷/+\-−])\s*([\d\s,.]+)\s*$/) || [];
      const y = lireNombre(val);
      // arrondi à 6 décimales pour éviter 0.1 × 3 = 0.30000000000000004
      const r = { '×': x * y, x: x * y, '*': x * y, ':': x / y, '÷': x / y, '/': x / y, '+': x + y, '-': x - y, '−': x - y }[signe];
      return Math.round(r * 1e6) / 1e6;
    };
    function lancer() {
      let x = lireNombre(champ.value);
      if (Number.isNaN(x)) return;
      const morceaux = [el('span', { class: 'machine-nombre', style: cascade(0) }, nombreFr(x))];
      v.operations.forEach((op, i) => {
        x = appliquer(x, op);
        morceaux.push(el('span', { class: 'machine-op', style: cascade(2 * i + 1) }, op.trim(), el('i', {}, '➜')));
        morceaux.push(el('span', { class: 'machine-nombre' + (i === v.operations.length - 1 ? ' final' : ''), style: cascade(2 * i + 2) }, nombreFr(x)));
      });
      chaine.replaceChildren(...morceaux);
    }
    champ.addEventListener('keydown', (e) => { if (e.key === 'Enter') lancer(); });
    lancer();
    return el('div', {},
      chaine,
      el('div', { class: 'machine-essai' },
        el('label', {}, 'Essaie avec ton nombre : ', champ),
        el('button', { class: 'btn-visuel', onclick: lancer }, '▶ Calculer')));
  },

  /* VIRGULE QUI RECULE (× 0,1 ; × 0,01 ; × 0,001) : { nombre: 56, diviseurs: [10, 100, 1000] }
     Tableau de numération : chaque chiffre recule d'un rang par division par 10. */
  virgule(v) {
    const colonnes = ['D', 'U', ',', 'd', 'c', 'm'];
    const ligne = (valeur, etiquette, i) => {
      // on écrit la valeur avec 3 décimales, puis on place chaque chiffre dans sa colonne
      const [entier, dec] = valeur.toFixed(3).split('.');
      const cases = Array(6).fill('');
      entier.padStart(2, ' ').slice(-2).split('').forEach((c, k) => { cases[k] = c.trim(); });
      cases[2] = ',';
      dec.split('').forEach((c, k) => { cases[3 + k] = c; });
      // on retire les zéros inutiles à droite (5,600 -> 5,6) et à gauche (056 -> 56)
      for (let k = 5; k > 2 && cases[k] === '0'; k--) cases[k] = '';
      if (cases[3] === '' && cases[4] === '' && cases[5] === '') cases[2] = '';
      if (cases[0] === '0') cases[0] = '';
      return el('tr', { style: cascade(i) },
        el('th', {}, etiquette),
        cases.map((c, k) => el('td', { class: k === 2 ? 'col-virgule' : '' }, c)),
        el('td', { class: 'egal' }, '= ' + nombreFr(valeur)));
    };
    const lignes = [ligne(v.nombre, nombreFr(v.nombre), 0)];
    v.diviseurs.forEach((d, i) => lignes.push(ligne(v.nombre / d, `× ${nombreFr(1 / d)}`, i + 1)));
    return el('div', { class: 'defile' },
      el('table', { class: 'table-virgule' },
        el('thead', {}, el('tr', {}, el('th', {}, ''), colonnes.map((c) => el('th', {}, c)), el('th', {}, ''))),
        el('tbody', {}, lignes)));
  },

  /* ARBRE GÉNÉALOGIQUE : { niveaux: [{ titre, membres: [{ emoji, mot, fr, genre: "m"|"f"|"pl" }] }] } */
  arbre(v) {
    return el('div', { class: 'arbre' },
      v.niveaux.map((n, i) => el('div', { class: 'arbre-niveau', style: cascade(i) },
        n.titre ? el('div', { class: 'arbre-titre' }, enrichir(n.titre)) : null,
        el('div', { class: 'arbre-membres', style: `--n:${n.membres.length <= 2 || n.membres.length === 4 ? 2 : 3}` }, n.membres.map((m) => el('div', { class: 'arbre-membre genre-' + (m.genre || 'm') },
          el('span', { class: 'arbre-emoji' }, m.emoji || '🙂'),
          el('span', { class: 'arbre-mot' }, enrichir(m.mot)),
          el('small', {}, m.fr)))))),
      v.legende === undefined ? el('div', { class: 'arbre-legende' },
        el('span', { class: 'genre-m' }, 'der = masculin'), el('span', { class: 'genre-f' }, 'die = féminin'), el('span', { class: 'genre-pl' }, 'die = pluriel')) : null);
  },

  /* BARRES : { elements: [{ label, valeur, texte, couleur }] } — les barres se remplissent */
  barres(v) {
    const max = v.max || Math.max(...v.elements.map((e) => e.valeur));
    return el('div', { class: 'barres' },
      v.elements.map((e, i) => el('div', { class: 'barre-ligne', style: cascade(i) },
        el('span', { class: 'barre-label' }, enrichir(e.label)),
        el('div', { class: 'barre-fond' },
          el('div', { class: 'barre-remplie', style: `--w:${(e.valeur / max) * 100}%;--teinte:${e.couleur || 'var(--principal)'}` },
            el('span', {}, e.texte || nombreFr(e.valeur)))))));
  },

  /* DENSITÉ : { cases: [{ label, points, texte }] } — carrés de 1 km² remplis de petits habitants */
  densite(v) {
    // générateur pseudo-aléatoire "à graine" : les points sont toujours au même endroit
    let graine = 7;
    const hasard = () => ((graine = (graine * 16807) % 2147483647) / 2147483647);
    return el('div', { class: 'densite' },
      v.cases.map((c, i) => el('div', { class: 'densite-case' },
        el('div', { class: 'densite-carre' }, Array.from({ length: c.points }, (_, k) =>
          el('span', { class: 'habitant', style: `left:${hasard() * 92}%;top:${hasard() * 90}%;animation-delay:${0.3 + i * 0.4 + k * 0.008}s` }))),
        el('b', {}, enrichir(c.label)),
        c.texte ? el('small', {}, enrichir(c.texte)) : null)));
  },

  /* ÉPROUVETTE graduée interactive : { max: 100, unite: "mL", valeur: 50, objet: { emoji: "🪨", volume: 15 } }
     Curseur pour changer le volume ; on lit en bas du ménisque ; bouton pour plonger un objet. */
  eprouvette(v) {
    const max = v.max || 100, unite = v.unite || 'mL';
    const NS = 'http://www.w3.org/2000/svg';
    const svg = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };
    const haut = 24, bas = 236, y = (val) => bas - (val / max) * (bas - haut);
    const dessin = svg('svg', { viewBox: '0 0 240 260', class: 'eprouvette-svg', role: 'img', 'aria-label': 'Éprouvette graduée' });
    // Graduations : un trait tous les 5, un nombre tous les 10
    for (let g = 0; g <= max; g += max / 20) {
      const grand = Math.round(g) % Math.round(max / 10) === 0;
      dessin.append(svg('line', { x1: 80, x2: grand ? 100 : 92, y1: y(g), y2: y(g), stroke: '#475569', 'stroke-width': grand ? 1.6 : 1 }));
      if (grand) { const t = svg('text', { x: 74, y: y(g) + 4, 'text-anchor': 'end', class: 'grad' }); t.textContent = Math.round(g); dessin.append(t); }
    }
    const liquide = svg('path', { class: 'liquide' });
    const ligneLecture = svg('line', { x1: 40, x2: 200, 'stroke-dasharray': '5 4', class: 'ligne-lecture' });
    const oeil = svg('text', { x: 206, class: 'oeil' }); oeil.textContent = '👁️';
    const caillou = svg('text', { x: 120, 'text-anchor': 'middle', class: 'objet-plonge' }); caillou.textContent = v.objet?.emoji || '';
    caillou.style.opacity = 0;
    dessin.append(liquide, caillou,
      svg('rect', { x: 80, y: 14, width: 80, height: 224, rx: 6, fill: 'none', stroke: '#64748b', 'stroke-width': 3 }),
      svg('line', { x1: 72, x2: 168, y1: 14, y2: 14, stroke: '#64748b', 'stroke-width': 3 }),
      ligneLecture, oeil);

    const lecture = el('p', { class: 'eprouvette-lecture' });
    let volume = v.valeur ?? max / 2, plonge = false;
    function dessiner() {
      const total = volume + (plonge ? v.objet.volume : 0);
      const yy = y(total);
      // ménisque : les bords remontent, on lit au point le plus bas (au centre)
      liquide.setAttribute('d', `M82 ${yy - 6} Q120 ${yy + 6} 158 ${yy - 6} L158 ${bas} L82 ${bas} Z`);
      ligneLecture.setAttribute('y1', yy); ligneLecture.setAttribute('y2', yy);
      oeil.setAttribute('y', yy + 6);
      caillou.setAttribute('y', bas - 8);
      caillou.style.opacity = plonge ? 1 : 0;
      lecture.replaceChildren(plonge
        ? el('span', {}, `Avant : ${nombreFr(volume)} ${unite} · Après : `, el('b', {}, `${nombreFr(total)} ${unite}`),
          el('br'), `Volume du ${v.objet.nom || 'solide'} = ${nombreFr(total)} − ${nombreFr(volume)} = `, el('b', { class: 'surligne' }, `${nombreFr(v.objet.volume)} ${unite}`))
        : el('span', {}, 'On lit en bas du ménisque, l’œil à la hauteur du liquide : ', el('b', {}, `${nombreFr(volume)} ${unite}`)));
    }
    const curseur = el('input', { type: 'range', min: 0, max: max - (v.objet?.volume || 0), step: max / 100, value: volume, 'aria-label': 'Volume de liquide' });
    curseur.addEventListener('input', () => { volume = Number(curseur.value); dessiner(); });
    const bouton = v.objet ? el('button', {
      class: 'btn-visuel',
      onclick: () => { plonge = !plonge; bouton.textContent = plonge ? '↩️ Retirer' : `Plonger ${v.objet.emoji}`; curseur.disabled = plonge; dessiner(); },
    }, `Plonger ${v.objet.emoji}`) : null;
    dessiner();
    return el('div', { class: 'eprouvette' }, dessin, el('div', { class: 'eprouvette-commandes' }, lecture, el('label', {}, '💧 Verse ou retire du liquide', curseur), bouton));
  },

  /* TABLEAU DE CONVERSION : { unites: ["L","dL","cL","mL"], exemples: [{ valeur: "2,5", unite: "L" }] }
     On place le nombre dans le tableau, puis on lit sa valeur dans chaque unité. */
  conversion(v) {
    const u = v.unites, nb = u.length;
    const corps = el('tbody');
    const resultats = el('p', { class: 'conversion-resultats' });
    const boutons = el('div', { class: 'conversion-choix' });
    function montrer(k) {
      const ex = v.exemples[k];
      const pos = u.indexOf(ex.unite);
      // valeur exprimée dans la plus petite unité (ex. 2,5 L -> 2500 mL)
      const petit = Math.round(lireNombre(ex.valeur) * 10 ** (nb - 1 - pos));
      const chiffres = String(petit).padStart(nb, ' ').slice(-nb).split('');
      corps.replaceChildren(el('tr', {}, chiffres.map((c, i) => el('td', {
        class: (i === pos ? 'unite-depart ' : '') + 'chiffre', style: cascade(i),
      }, c.trim(), i === pos && i < nb - 1 ? el('span', { class: 'virgule-conv' }, ',') : ''))));
      resultats.replaceChildren(el('b', {}, `${ex.valeur} ${ex.unite}`),
        ...u.filter((x) => x !== ex.unite).map((x) => ` = ${nombreFr(petit / 10 ** (nb - 1 - u.indexOf(x)))} ${x}`));
      [...boutons.children].forEach((b, i) => b.classList.toggle('actif', i === k));
    }
    v.exemples.forEach((ex, k) => boutons.append(el('button', { onclick: () => montrer(k) }, `${ex.valeur} ${ex.unite}`)));
    montrer(0);
    return el('div', {}, boutons,
      el('div', { class: 'defile' }, el('table', { class: 'table-conversion' },
        el('thead', {}, el('tr', {}, u.map((x) => el('th', {}, x)))),
        corps)),
      resultats);
  },

  /* BALANCE : { gauche: { label, emoji, masse }, droite: {...}, unite: "g" } — le fléau penche du côté le plus lourd */
  balance(v) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = (tag, attrs, texte) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (texte) n.textContent = texte; return n; };
    const dessin = svg('svg', { viewBox: '0 0 300 190', class: 'balance-svg', role: 'img', 'aria-label': 'Balance' });
    dessin.append(svg('path', { d: 'M150 60 L125 170 H175 Z', fill: '#94a3b8' }), svg('rect', { x: 95, y: 168, width: 110, height: 10, rx: 4, fill: '#64748b' }));
    const fleau = svg('line', { x1: 50, x2: 250, y1: 60, y2: 60, stroke: '#334155', 'stroke-width': 6, 'stroke-linecap': 'round' });
    const plateau = (txt) => {
      const g = svg('g', {});
      g.append(svg('line', { x1: 0, x2: -26, y1: 0, y2: 40, stroke: '#94a3b8', 'stroke-width': 1.5 }),
        svg('line', { x1: 0, x2: 26, y1: 0, y2: 40, stroke: '#94a3b8', 'stroke-width': 1.5 }),
        svg('path', { d: 'M-34 40 H34 Q30 50 0 50 Q-30 50 -34 40 Z', fill: '#cbd5e1' }),
        svg('text', { x: 0, y: 36, 'text-anchor': 'middle', 'font-size': 26 }, txt));
      return g;
    };
    const pg = plateau(v.gauche.emoji), pd = plateau(v.droite.emoji);
    dessin.append(fleau, pg, pd, svg('circle', { cx: 150, cy: 60, r: 7, fill: '#f59e0b' }));
    // angle visé : proportionnel à la différence de masse (12° au maximum)
    const ecart = v.droite.masse - v.gauche.masse;
    const cible = Math.max(-12, Math.min(12, (ecart / Math.max(v.gauche.masse, v.droite.masse)) * 60));
    function poser(angle) {
      const a = (angle * Math.PI) / 180, dx = 100 * Math.cos(a), dy = 100 * Math.sin(a);
      fleau.setAttribute('x1', 150 - dx); fleau.setAttribute('y1', 60 - dy);
      fleau.setAttribute('x2', 150 + dx); fleau.setAttribute('y2', 60 + dy);
      pg.setAttribute('transform', `translate(${150 - dx} ${60 - dy})`);
      pd.setAttribute('transform', `translate(${150 + dx} ${60 + dy})`);
    }
    poser(0);
    // animation avec un petit rebond, déclenchée quand le visuel apparaît
    const animer = () => {
      const debut = performance.now();
      const pas = (t) => {
        const p = Math.min(1, (t - debut) / 1400);
        poser(cible * (1 - Math.cos(p * Math.PI * 2.5) * (1 - p)));
        if (p < 1) requestAnimationFrame(pas);
      };
      requestAnimationFrame(pas);
    };
    const bloc = el('div', { class: 'balance' }, dessin,
      el('div', { class: 'balance-etiquettes' },
        el('span', {}, enrichir(v.gauche.label), el('b', {}, ` ${nombreFr(v.gauche.masse)} ${v.unite || 'g'}`)),
        el('span', {}, enrichir(v.droite.label), el('b', {}, ` ${nombreFr(v.droite.masse)} ${v.unite || 'g'}`))),
      el('button', { class: 'btn-visuel', onclick: () => { poser(0); setTimeout(animer, 200); } }, '⚖️ Peser à nouveau'));
    // l'événement "vu" est envoyé sur le cadre <figure> parent
    requestAnimationFrame(() => bloc.closest('figure')?.addEventListener('vu', animer, { once: true }));
    return bloc;
  },

  /* FLOTTE OU COULE : { objets: [{ nom, emoji, densite }] } — moins dense que l'eau (1) = flotte */
  flottaison(v) {
    const bac = el('div', { class: 'bac' }, el('div', { class: 'eau' }, el('span', {}, 'eau (1 kg par litre)')));
    v.objets.forEach((o, i) => {
      // position finale : en surface (un peu enfoncé selon la densité) ou au fond
      // surface de l'eau à 40 % de la hauteur ; l'objet s'enfonce d'autant plus qu'il est dense
      const flotte = o.densite < 1;
      const fin = flotte ? `calc(40% - 34px + ${Math.round(o.densite * 30)}px)` : 'calc(100% - 74px)';
      bac.append(el('div', {
        class: 'objet-bac ' + (flotte ? 'flotte' : 'coule'),
        style: `left:${9 + (82 / v.objets.length) * (i + 0.5)}%;--fin:${fin};animation-delay:${0.4 + i * 0.5}s`,
      }, el('span', { class: 'objet-emoji' }, o.emoji), el('small', {}, `${o.nom}`, el('br'), `${nombreFr(o.densite)} kg/L`)));
    });
    return el('div', {}, bac,
      el('button', { class: 'btn-visuel', onclick: (e) => { const f = e.target.closest('figure'); f.classList.remove('vu'); void f.offsetWidth; f.classList.add('vu'); } }, '🔁 Relâcher les objets'));
  },

  /* COMPARAISON de deux milieux : { cotes: [{ titre, emoji, mesures: [{ label, valeur, max, unite }], texte }] } */
  comparaison(v) {
    return el('div', { class: 'comparaison' },
      v.cotes.map((c) => el('div', { class: 'cote' },
        el('div', { class: 'cote-titre' }, el('span', {}, c.emoji || ''), el('b', {}, enrichir(c.titre))),
        c.mesures.map((m, i) => el('div', { class: 'jauge', style: cascade(i) },
          el('span', { class: 'jauge-label' }, enrichir(m.label)),
          el('div', { class: 'jauge-fond' }, el('div', { class: 'jauge-remplie', style: `--w:${(m.valeur / m.max) * 100}%;--teinte:${m.couleur || 'var(--principal)'}` })),
          el('b', {}, `${nombreFr(m.valeur)} ${m.unite || ''}`))),
        c.texte ? el('p', { class: 'cote-texte' }, enrichir(c.texte)) : null)));
  },

  /* LIENS entre êtres vivants et milieu : { types: { cle: { label, couleur, emoji } }, liens: [{ de, vers, type, texte }] } */
  liens(v) {
    return el('div', { class: 'liens' },
      el('div', { class: 'liens-legende' }, Object.values(v.types).map((t) => el('span', { style: `--teinte:${t.couleur}` }, `${t.emoji || ''} ${t.label}`))),
      v.liens.map((l, i) => {
        const t = v.types[l.type] || {};
        return el('div', { class: 'lien', style: `${cascade(i)};--teinte:${t.couleur || '#64748b'}` },
          el('span', { class: 'lien-bout' }, enrichir(l.de)),
          el('span', { class: 'lien-fleche' }, el('small', {}, enrichir(l.texte || t.label)), el('i', {})),
          el('span', { class: 'lien-bout' }, enrichir(l.vers)));
      }));
  },

  /* ARRONDIR ET ENCADRER : { exemples: ["658 741", "47 862"], rangs: ["dizaine", "centaine", "millier"] }
     Le nombre est un ballon ⚽ posé entre deux « buts » : les deux nombres ronds qui l'encadrent.
     Le ballon roule vers le but le plus proche : c'est l'arrondi. L'enfant peut taper son nombre. */
  arrondi(v) {
    const PAS = { unite: 1, dizaine: 10, centaine: 100, millier: 1000, 'dizaine de mille': 10000, 'centaine de mille': 100000 };
    const NOMS = { dizaine: 'à la dizaine', centaine: 'à la centaine', millier: 'au millier', 'dizaine de mille': 'à la dizaine de mille', 'centaine de mille': 'à la centaine de mille' };
    const rangs = v.rangs || ['dizaine', 'centaine', 'millier'];
    let nombre = lireNombre(v.exemples?.[0] ?? 658741);
    let rang = rangs[0];
    const terrain = el('div', { class: 'arrondi-terrain' });
    const phrase = el('div', { class: 'arrondi-phrase' });
    const boutonsRang = el('div', { class: 'arrondi-rangs' });
    const champ = el('input', { class: 'machine-champ', type: 'text', inputmode: 'numeric', value: nombreFr(nombre) });

    function montrer() {
      const pas = PAS[rang];
      const bas = Math.floor(nombre / pas) * pas;   // le but de gauche (nombre rond juste en dessous)
      const haut = bas + pas;                        // le but de droite (nombre rond juste au-dessus)
      const exact = nombre % pas === 0;
      // Au milieu pile (…5, …50, …500), on arrondit au-dessus : c'est la règle
      const arrondi = exact ? nombre : (nombre - bas < haut - nombre ? bas : haut);
      const part = exact ? 0 : (nombre - bas) / pas; // position du ballon entre 0 et 1
      const ballon = el('span', { class: 'arrondi-ballon', style: `--depart:${part * 100}%;--arrivee:${(arrondi === bas ? 0 : 100)}%` }, '⚽');
      terrain.replaceChildren(
        el('div', { class: 'arrondi-ligne' },
          el('span', { class: 'arrondi-milieu' }),
          el('span', { class: 'arrondi-but gauche' + (arrondi === bas ? ' gagne' : '') }, '🥅', el('b', {}, nombreFr(bas))),
          el('span', { class: 'arrondi-but droite' + (arrondi === haut ? ' gagne' : '') }, '🥅', el('b', {}, nombreFr(haut))),
          exact ? null : ballon),
        // Le nombre est écrit sous la ligne, mais jamais collé aux étiquettes des buts (entre 32 % et 68 %) ;
        // un petit repère orange montre sa vraie place.
        exact ? null : el('div', { class: 'arrondi-nombre', style: `--depart:${Math.min(68, Math.max(32, part * 100))}%` }, nombreFr(nombre)));
      if (!exact) terrain.firstChild.append(el('span', { class: 'arrondi-repere', style: `left:${part * 100}%` }));
      // Relance l'animation à chaque changement
      if (!exact) { ballon.style.animation = 'none'; void ballon.offsetWidth; ballon.style.animation = ''; }
      phrase.replaceChildren(
        exact
          ? el('p', {}, el('b', {}, nombreFr(nombre)), ` est déjà un nombre rond ${NOMS[rang]} près !`)
          : el('p', {}, '📏 Encadrement : ', el('b', {}, `${nombreFr(bas)} < ${nombreFr(nombre)} < ${nombreFr(haut)}`)),
        exact ? null : el('p', {}, '🎯 Arrondi ', NOMS[rang], ' la plus proche : ', el('b', { class: 'arrondi-resultat' }, nombreFr(arrondi)),
          nombre - bas === haut - nombre ? ' (pile au milieu : on arrondit au-dessus)' : ''));
      [...boutonsRang.children].forEach((b) => b.classList.toggle('actif', b.dataset.rang === rang));
    }
    rangs.forEach((r) => boutonsRang.append(el('button', { 'data-rang': r, onclick: () => { rang = r; montrer(); } }, NOMS[r].replace(/^(à la|au) /, ''))));
    const exemples = el('div', { class: 'conversion-choix' },
      (v.exemples || []).map((x) => el('button', { onclick: () => { nombre = lireNombre(x); champ.value = nombreFr(nombre); montrer(); } }, x)));
    const essayer = () => { const n = Math.round(lireNombre(champ.value)); if (!Number.isNaN(n)) { nombre = Math.abs(n); montrer(); } };
    champ.addEventListener('keydown', (e) => { if (e.key === 'Enter') essayer(); });
    montrer();
    return el('div', {}, exemples,
      el('p', { class: 'arrondi-consigne' }, 'Arrondir à la… '), boutonsRang,
      terrain, phrase,
      el('div', { class: 'machine-essai' }, el('label', {}, 'Ton nombre : ', champ), el('button', { class: 'btn-visuel', onclick: essayer }, '⚽ Tirer')));
  },

  /* DROITE GRADUÉE : { debut: 500000, fin: 800000, grande: 100000, petites: 10,
                        points: [{ valeur: 630000, emoji: "⚽", nom: "le ballon" }] }
     On touche un point : il tombe sur la droite et on explique comment lire sa valeur. */
  droite(v) {
    const W = 380, G = 34, D = W - 34, Y = 46;            // largeur, marges gauche/droite, hauteur de la droite
    const x = (val) => G + ((val - v.debut) / (v.fin - v.debut)) * (D - G);
    const petit = v.grande / (v.petites || 10);          // valeur d'une petite graduation
    const NS = 'http://www.w3.org/2000/svg';
    const svg = (tag, attrs = {}, texte) => {
      const e = document.createElementNS(NS, tag);
      for (const [k, val] of Object.entries(attrs)) e.setAttribute(k, val);
      if (texte !== undefined) e.textContent = texte;
      return e;
    };
    const dessin = svg('svg', { viewBox: `0 0 ${W} 92`, class: 'droite-svg', role: 'img', 'aria-label': 'Droite graduée' });
    dessin.append(svg('line', { x1: 6, y1: Y, x2: W - 6, y2: Y, class: 'droite-axe' }));
    dessin.append(svg('path', { d: `M${W - 6} ${Y}l-9 -5v10z`, class: 'droite-fleche' }));
    // graduations : grandes (avec le nombre) et petites
    for (let val = v.debut; val <= v.fin + 1e-9; val += petit) {
      const grande = Math.abs(((val - v.debut) / v.grande) - Math.round((val - v.debut) / v.grande)) < 1e-9;
      dessin.append(svg('line', { x1: x(val), x2: x(val), y1: Y - (grande ? 9 : 5), y2: Y + (grande ? 9 : 5), class: grande ? 'droite-grande' : 'droite-petite' }));
      if (grande) dessin.append(svg('text', { x: x(val), y: Y + 30, class: 'droite-nombre' }, nombreFr(val)));
    }
    // accolade « 1 petite graduation = … » sur la 1re case
    dessin.append(svg('path', { d: `M${x(v.debut)} ${Y - 12}q0 -6 ${(x(v.debut + petit) - x(v.debut)) / 2} -6t${(x(v.debut + petit) - x(v.debut)) / 2} 6`, class: 'droite-accolade' }));
    dessin.append(svg('text', { x: x(v.debut + petit / 2), y: Y - 24, class: 'droite-petit-texte' }, nombreFr(petit)));
    const calque = svg('g');
    dessin.append(calque);

    const explication = el('div', { class: 'droite-explication' },
      el('p', {}, '📏 Une grande graduation = ', el('b', {}, nombreFr(v.grande)), ` · il y a ${v.petites || 10} petites cases dedans, donc une petite graduation = `, el('b', {}, nombreFr(petit))));
    const boutons = el('div', { class: 'conversion-choix' });
    function placer(k) {
      const p = v.points[k];
      calque.replaceChildren(
        svg('text', { x: x(p.valeur), y: Y - 8, class: 'droite-point' }, p.emoji || '⚽'),
        svg('line', { x1: x(p.valeur), x2: x(p.valeur), y1: Y - 4, y2: Y + 12, class: 'droite-repere' }));
      // explication : la grande graduation juste avant + combien de petites
      const avant = v.debut + Math.floor((p.valeur - v.debut) / v.grande) * v.grande;
      const n = Math.round((p.valeur - avant) / petit);
      explication.replaceChildren(
        el('p', {}, '📏 Une petite graduation = ', el('b', {}, nombreFr(petit))),
        el('p', { class: 'pop' }, `${p.emoji || '⚽'} ${p.nom || 'Le point'} : je pars de `, el('b', {}, nombreFr(avant)),
          n ? ` et j'avance de ${n} petite${n > 1 ? 's' : ''} graduation${n > 1 ? 's' : ''} → ` : ' → ',
          el('b', { class: 'arrondi-resultat' }, nombreFr(p.valeur))));
      [...boutons.children].forEach((b, i) => b.classList.toggle('actif', i === k));
    }
    (v.points || []).forEach((p, k) => boutons.append(el('button', { onclick: () => placer(k) }, `${p.emoji || '⚽'} ${p.nom || nombreFr(p.valeur)}`)));
    return el('div', {}, boutons, el('div', { class: 'defile' }, dessin), explication);
  },

  /* MULTIPLICATION POSÉE, pas à pas : { a: 579, b: 64 }
     Chaque appui sur « Étape suivante » fait un calcul : chiffre par chiffre, avec les retenues
     (petits nombres en couleur au-dessus), le 0 de décalage, puis l'addition finale. */
  posee(v) {
    const a = Number(v.a), b = Number(v.b);
    const chA = String(a).split('').map(Number), chB = String(b).split('').map(Number);
    const total = a * b;
    const W = Math.max(String(total).length, chA.length, chB.length) + 1; // + 1 colonne pour × / +
    const plusieurs = chB.length > 1;
    // --- 1. On prépare toutes les étapes : { ecrit: [[ligne, colonne, texte]], texte, voir: [[ligne, col]] }
    const etapes = [];
    const col = (rangDepuisDroite) => W - 1 - rangDepuisDroite;   // colonne d'un rang (0 = unités)
    const arrondir1 = (n) => { const p = 10 ** (String(n).length - 1); return Math.round(n / p) * p; };
    etapes.push({ ecrit: [], voir: [], texte: `🔮 Ordre de grandeur : ${nombreFr(arrondir1(a))} × ${nombreFr(arrondir1(b))} = ${nombreFr(arrondir1(a) * arrondir1(b))}. Le résultat doit être proche !` });
    const lignesProduits = [];
    [...chB].reverse().forEach((d, j) => {
      const ligne = 'p' + j, ret = 'r' + j;
      lignesProduits.push(ligne);
      if (j > 0) etapes.push({
        ecrit: Array.from({ length: j }, (_, z) => [ligne, col(z), '0']), voir: [['b', col(j)]],
        texte: `Je multiplie maintenant par le chiffre des ${j === 1 ? 'dizaines' : 'centaines'} (${d}) : il vaut ${nombreFr(d * 10 ** j)}, donc je pose d'abord ${j === 1 ? 'un 0' : `${j} zéros`} à droite.`,
      });
      let retenue = 0;
      [...chA].reverse().forEach((c, i) => {
        const p = d * c + retenue;
        const dernier = i === chA.length - 1;
        const ecrit = [[ligne, col(i + j), String(dernier ? p : p % 10).slice(-1)]];
        if (dernier && p >= 10) ecrit.push([ligne, col(i + j + 1), String(Math.floor(p / 10))]);
        const nouvelle = Math.floor(p / 10);
        if (!dernier && nouvelle) ecrit.push([ret, col(i + 1), '+' + nouvelle]);
        etapes.push({
          ecrit, voir: [['a', col(i)], ['b', col(j)]],
          texte: `${d} × ${c} = ${d * c}` + (retenue ? ` + ${retenue} de retenue = ${p}` : '') +
            (dernier ? ` : c'est le dernier chiffre, j'écris ${p}.` : (nouvelle ? ` : j'écris ${p % 10} et je retiens ${nouvelle}.` : ` : j'écris ${p}.`)),
        });
        retenue = dernier ? 0 : nouvelle;
      });
    });
    if (plusieurs) {
      // Addition des lignes, colonne par colonne
      const produits = [...chB].reverse().map((d, j) => a * d * 10 ** j);
      let retenue = 0;
      const n = String(total).length;
      for (let r = 0; r < n; r++) {
        const chiffres = produits.map((p) => Math.floor(p / 10 ** r) % 10).filter((_, k) => produits[k] >= 10 ** r || r === 0);
        const somme = chiffres.reduce((s, c) => s + c, 0) + retenue;
        const ecrit = [['t', col(r), String(r === n - 1 ? somme : somme % 10)]];
        const nouvelle = Math.floor(somme / 10);
        if (r < n - 1 && nouvelle) ecrit.push(['ra', col(r + 1), '+' + nouvelle]);
        etapes.push({ ecrit, voir: lignesProduits.map((l) => [l, col(r)]),
          texte: `J'additionne : ${chiffres.join(' + ')}${retenue ? ` + ${retenue} de retenue` : ''} = ${somme}` + (r < n - 1 && nouvelle ? ` : j'écris ${somme % 10} et je retiens ${nouvelle}.` : '.') });
        retenue = r < n - 1 ? nouvelle : 0;
      }
    }
    etapes.push({ ecrit: [], voir: [[plusieurs ? 't' : 'p0', -1]], texte: `✅ ${nombreFr(a)} × ${nombreFr(b)} = ${nombreFr(total)}. Proche de l'ordre de grandeur ? Oui, bravo !` });

    // --- 2. La grille (lignes du haut vers le bas)
    const ordre = [...lignesProduits.map((_, j) => 'r' + j).reverse(), 'a', 'b', 'trait', ...(plusieurs ? ['ra', ...lignesProduits, 'trait2', 't'] : lignesProduits)];
    const cases = {};
    const corps = el('tbody', {}, ordre.map((nom) => {
      if (nom.startsWith('trait')) return el('tr', { class: 'posee-trait' }, Array.from({ length: W }, () => el('td')));
      const classe = nom.startsWith('r') ? 'posee-retenues' + (nom === 'ra' ? ' addition' : ' r' + nom.slice(1)) : nom === 't' ? 'posee-total' : '';
      return el('tr', { class: classe }, Array.from({ length: W }, (_, c) => (cases[nom + ':' + c] = el('td'))));
    }));
    // a et b sont écrits dès le départ, avec le signe ×
    const ecrireNombre = (ligne, n) => String(n).split('').reverse().forEach((c, i) => { cases[ligne + ':' + col(i)].textContent = c; });
    ecrireNombre('a', a); ecrireNombre('b', b);
    cases['b:0'].textContent = '×';
    if (plusieurs) cases[lignesProduits.at(-1) + ':0'].textContent = '+';
    const ligneTotal = plusieurs ? 't' : 'p0';
    const texte = el('p', { class: 'posee-texte' });
    let k = 0;
    function afficherEtape() {
      // on efface tout ce qui est écrit après a et b, puis on rejoue les étapes 0..k
      Object.entries(cases).forEach(([cle, td]) => {
        td.classList.remove('vise', 'nouveau');
        if (!/^(a|b):/.test(cle) && !(td.textContent === '+' && cle.endsWith(':0'))) td.textContent = '';
      });
      for (let e = 0; e <= k; e++) etapes[e].ecrit.forEach(([l, c, t]) => {
        const td = cases[l + ':' + c];
        td.textContent = t;
        if (e === k) td.classList.add('nouveau');
      });
      etapes[k].voir.forEach(([l, c]) => (c >= 0 ? cases[l + ':' + c]?.classList.add('vise')
        : Object.keys(cases).filter((x) => x.startsWith(ligneTotal + ':')).forEach((x) => cases[x].classList.add('vise'))));
      texte.replaceChildren(el('span', { class: 'posee-num' }, `${k + 1}/${etapes.length}`), ' ', enrichir(etapes[k].texte));
      texte.classList.remove('pop'); void texte.offsetWidth; texte.classList.add('pop');
      suivant.disabled = k === etapes.length - 1;
    }
    const suivant = el('button', { class: 'btn-visuel', onclick: () => { if (k < etapes.length - 1) { k++; afficherEtape(); } } }, '▶ Étape suivante');
    const reprendre = el('button', { class: 'btn-visuel secondaire', onclick: () => { k = 0; afficherEtape(); } }, '↺ Recommencer');
    const toutVoir = el('button', { class: 'btn-visuel secondaire', onclick: () => { k = etapes.length - 1; afficherEtape(); } }, '⏩ Résultat');
    afficherEtape();
    return el('div', { class: 'posee' },
      el('div', { class: 'defile' }, el('table', { class: 'table-posee' }, corps)),
      texte, el('div', { class: 'posee-boutons' }, suivant, reprendre, toutVoir));
  },

  /* RANGS DES CHIFFRES (rappel) : { nombre: "658 741" }
     Tableau de numération : classe des mille / classe des unités. On touche un chiffre :
     son rang s'affiche (« 7 est le chiffre des dizaines »). */
  rangs(v) {
    const NOMS = ['unités', 'dizaines', 'centaines', 'unités de mille', 'dizaines de mille', 'centaines de mille'];
    const COURTS = ['u', 'd', 'c', 'u', 'd', 'c'];
    const chiffres = String(v.nombre).replace(/\s/g, '').split('');
    const n = chiffres.length;
    const texte = el('p', { class: 'rangs-texte' }, '👆 Touche un chiffre');
    const cases = chiffres.map((c, i) => {
      const rang = n - 1 - i; // 0 = unités
      return el('button', {
        class: 'rangs-chiffre' + (rang >= 3 ? ' mille' : ''), style: cascade(i),
        onclick: (e) => {
          cases.forEach((b) => b.classList.remove('actif'));
          e.currentTarget.classList.add('actif');
          texte.replaceChildren(el('b', {}, c), ` est le chiffre des `, el('b', {}, NOMS[rang]), '.');
          texte.classList.remove('pop'); void texte.offsetWidth; texte.classList.add('pop');
        },
      }, el('small', {}, COURTS[rang]), c);
    });
    const mille = cases.filter((_, i) => n - 1 - i >= 3), unites = cases.filter((_, i) => n - 1 - i < 3);
    return el('div', {},
      el('div', { class: 'rangs' },
        mille.length ? el('div', { class: 'rangs-classe mille' }, el('span', {}, 'classe des mille'), el('div', {}, mille)) : null,
        el('div', { class: 'rangs-classe' }, el('span', {}, 'classe des unités'), el('div', {}, unites))),
      texte);
  },

  /* TIRS AU BUT (mini-jeu) : { tirs: [{ texte: "4 682 arrondi à la centaine ?", choix: ["4 700", "4 600"] }] }
     Comme dans le quiz, la 1re proposition est la bonne (l'ordre est mélangé à l'affichage).
     Bonne réponse = BUT ⚽ (le ballon file dans le filet) ; mauvaise = le gardien arrête 🧤.
     Le score s'affiche comme au stade, puis on peut rejouer (les tirs sont remélangés). */
  tirs(v) {
    // Thèmes : "foot" (par défaut), "chat" (la pelote 🧶 à lancer dans le panier, la souris 🐭 essaie de la voler)
    // ou "dino" (depuis la v1.17.0, pour Elouan : l'œuf 🥚 à ramener au nid, le T-rex 🦖 essaie de l'attraper)
    const THEMES = {
      chat: { balle: '🧶', gardien: '🐭', toi: '🐱 Toi', autre: 'Souris 🐭', jouer: 'pelotes à lancer', bravo: ['Dans le panier ! 🧶', 'Miaou, bravo ! 🐱', 'Super lancer ! ⭐'], rate: 'La souris a pris la pelote 🐭 La bonne réponse : ' },
      dino: { balle: '🥚', gardien: '🦖', toi: '🦕 Toi', autre: 'T-rex 🦖', jouer: 'œufs à sauver', bravo: ['Dans le nid ! 🥚', 'Bravo, petit dino ! 🦕', 'Super ! ⭐'], rate: 'Le T-rex a attrapé l’œuf 🦖 La bonne réponse : ' },
      foot: { balle: '⚽', gardien: '🧤', toi: '⚽ Toi', autre: 'Gardien 🧤', jouer: 'tirs au but', bravo: ['BUUUT ! ⚽', 'Quel tir ! 🔥', 'Lucarne ! 🎯', 'Imparable ! 💥'], rate: 'Arrêté par le gardien 🧤 La bonne réponse : ' },
    };
    const T = THEMES[v.theme] || THEMES.foot;
    // la classe "theme-chat" / "theme-dino" change les couleurs du terrain (style.css)
    const scene = el('div', { class: 'tirs-scene' + (THEMES[v.theme] && v.theme !== 'foot' ? ' theme-' + v.theme : '') });
    const tableau = el('div', { class: 'tirs-score' });
    const zone = el('div', { class: 'tirs-zone' });
    let liste = [], k = 0, buts = 0;
    const majScore = () => tableau.replaceChildren(
      el('span', {}, T.toi + ' ', el('b', {}, String(buts))), el('span', {}, ' – '),
      el('span', {}, el('b', {}, String(k - buts)), ' ' + T.autre));

    function commencer() {
      liste = melanger(v.tirs); k = 0; buts = 0;
      majScore(); tirer();
    }
    function tirer() {
      if (k >= liste.length) return fin();
      const t = liste[k];
      // Le terrain : le but, le gardien au milieu, le ballon au point de penalty
      scene.replaceChildren(
        el('div', { class: 'tirs-but' }, el('span', { class: 'tirs-gardien' }, T.gardien)),
        el('span', { class: 'tirs-ballon' }, T.balle));
      // CP : la question est lue à voix haute (profil "lectureAuto")
      if (etat.enfant?.lectureAuto) setTimeout(() => lireAVoixHaute(t.dire || t.texte), 300);
      zone.replaceChildren(
        el('p', { class: 'tirs-question' }, el('small', {}, `Tir ${k + 1} / ${liste.length}`), enrichir(t.texte)),
        el('div', { class: 'tirs-choix' }, melanger(t.choix).map((c) => el('button', {
          class: 'tirs-bouton' + (t.attache ? ' attache' : ''), // "attache": true -> lettres en écriture attachée
          onclick: (e) => frapper(c === t.choix[0], e.currentTarget, t),
        }, enrichir(c)))));
    }
    function frapper(juste, bouton, t) {
      zone.querySelectorAll('button').forEach((b) => (b.disabled = true));
      bouton.classList.add(juste ? 'bon' : 'faux');
      // le ballon part vers le filet ; s'il est raté, le gardien plonge dessus
      scene.classList.remove('but', 'arret'); void scene.offsetWidth;
      scene.classList.add(juste ? 'but' : 'arret');
      if (juste) { buts++; son('bon'); eclats(scene, ['⚽', '🎉', '⭐']); } else son('faux');
      k++; majScore();
      zone.append(el('p', { class: 'tirs-annonce ' + (juste ? 'ok' : 'ko') },
        juste ? auHasard(T.bravo)
          : [T.rate, el('b', { class: t.attache ? 'attache' : '' }, enrichir(t.choix[0]))]));
      setTimeout(tirer, juste ? 1300 : 2300);
    }
    function fin() {
      const n = liste.length;
      const titre = buts === n ? '🏆 Sans faute, champion !' : buts >= n / 2 ? '💪 Victoire !' : '🙂 Bien joué, on retente ?';
      scene.replaceChildren(el('div', { class: 'tirs-fin' }, titre));
      zone.replaceChildren(
        el('p', { class: 'tirs-question' }, `Tu as marqué ${buts} but${buts > 1 ? 's' : ''} sur ${n} tirs.`),
        el('button', { class: 'btn-visuel', onclick: commencer }, '🔁 Rejouer'));
      if (buts === n) eclats(scene, ['🏆', '⚽', '🎉', '⭐']);
    }
    // Écran d'accueil du jeu : on ne commence que quand l'enfant le décide
    scene.append(el('div', { class: 'tirs-but' }, el('span', { class: 'tirs-gardien' }, T.gardien)), el('span', { class: 'tirs-ballon' }, T.balle));
    zone.append(el('button', { class: 'btn-visuel', onclick: commencer }, `${T.balle} Jouer : ${v.tirs.length} ${T.jouer}`));
    return el('div', { class: 'tirs' }, tableau, scene, zone);
  },

  /* DICTÉE : { visuel: "dictee", phrases: ["Plus ils marchaient,", "…"] }
     La voix (MP3 ElevenLabs, voir lireAVoixHaute dans app.js) dicte le texte MORCEAU PAR MORCEAU,
     lentement. L'enfant écrit sur son cahier, réécoute autant qu'il veut, passe au morceau suivant,
     puis réécoute tout le texte d'un coup pour se relire, et compare avec le texte de la fiche. */
  dictee(v) {
    const phrases = v.phrases || [];
    let k = 0, lent = true;
    const progres = el('div', { class: 'dictee-progres' });
    const info = el('p', { class: 'dictee-info' });
    const dire = () => lireAVoixHaute(phrases[k], { lent });
    const ecouter = el('button', { class: 'btn-visuel', onclick: dire }, '🎧 Écouter');
    const suivant = el('button', { class: 'btn-visuel', onclick: () => { k++; maj(); if (k < phrases.length) dire(); } }, 'Suivant ⏭');
    const vitesse = el('button', { class: 'btn-visuel secondaire', onclick: () => { lent = !lent; maj(); } });
    function maj() {
      const fini = k >= phrases.length;
      // une pastille par morceau : faite / en cours / à venir
      progres.replaceChildren(...phrases.map((_, i) => el('i', { class: i < k ? 'fait' : i === k ? 'actuel' : '' })));
      // replaceChildren attend les éléments un par un : d'où le « ... » devant le tableau
      info.replaceChildren(...(fini
        ? [el('b', {}, '✅ Dictée terminée ! Réécoute tout pour te relire, puis compare avec le texte.')]
        : [el('b', {}, `Morceau ${k + 1} / ${phrases.length}`), ' — écoute, écris, puis passe au suivant.']));
      ecouter.hidden = suivant.hidden = fini;
      vitesse.textContent = lent ? '🐢 Lent' : '🐇 Normal';
    }
    maj();
    return el('div', { class: 'dictee' }, progres, info,
      el('div', { class: 'dictee-boutons' }, ecouter, suivant, vitesse),
      el('div', { class: 'dictee-boutons' },
        el('button', { class: 'btn-visuel secondaire', onclick: () => lireAVoixHaute(phrases) }, '🔁 Tout réécouter'),
        el('button', { class: 'btn-visuel secondaire', onclick: () => { couperVoix(); k = 0; maj(); } }, '↺ Recommencer')));
  },

  /* ===================== VISUELS DU CP (Ava) =====================
     Peu de texte, beaucoup d'images, et une voix qui lit (lireAVoixHaute : MP3 ElevenLabs). */

  /* OÙ EST LE CHAT ? (vocabulaire de position) : { objet: "🐱", nom: "le chat" }
     On touche un mot (sur, sous, devant…) : le chat se place et la phrase est lue. */
  position(v) {
    const objet = v.objet || '🐱', nom = v.nom || 'Le chat';
    const MOTS = [
      ['sur', 'sur la table'], ['sous', 'sous la table'], ['devant', 'devant la table'], ['derriere', 'derrière la table'],
      ['a-cote', 'à côté de la table'], ['au-dessus', 'au-dessus de la table'], ['dans', 'dans la boîte'], ['entre', 'entre les deux sapins'],
    ];
    const scene = el('div', { class: 'pos-scene' });
    const phrase = el('p', { class: 'pos-phrase' });
    const boutons = el('div', { class: 'pos-boutons' });
    function placer(cle, texte) {
      // Le décor change selon le mot : une table, une boîte (dans) ou deux sapins (entre)
      const decor = cle === 'dans' ? [el('div', { class: 'pos-boite' })]
        : cle === 'entre' ? [el('span', { class: 'pos-sapin gauche' }, '🌲'), el('span', { class: 'pos-sapin droite' }, '🌲')]
        : [el('div', { class: 'pos-table' }, el('i'), el('i'))];
      scene.replaceChildren(...decor, el('span', { class: 'pos-objet ' + cle }, objet));
      const p = `${nom} est ${texte}.`;
      phrase.replaceChildren(el('b', {}, p));
      phrase.classList.remove('pop'); void phrase.offsetWidth; phrase.classList.add('pop');
      [...boutons.children].forEach((b) => b.classList.toggle('actif', b.dataset.cle === cle));
      lireAVoixHaute(p);
    }
    MOTS.forEach(([cle, texte]) => boutons.append(el('button', { 'data-cle': cle, onclick: () => placer(cle, texte) },
      texte.split(' ')[0] === 'à' ? 'à côté' : texte.split(' ')[0] === 'au-dessus' ? 'au-dessus' : texte.split(' ')[0])));
    // premier affichage, sans voix (la page vient de s'ouvrir)
    scene.append(el('div', { class: 'pos-table' }, el('i'), el('i')), el('span', { class: 'pos-objet sur' }, objet));
    phrase.append(el('b', {}, `${nom} est sur la table.`));
    return el('div', {}, scene, phrase, el('p', { class: 'pos-consigne' }, '👆 Touche un mot :'), boutons);
  },

  /* GAUCHE / DROITE : le chat court à gauche ou à droite quand on touche un bouton */
  gauchedroite(v) {
    const objet = v.objet || '🐈';
    const bete = el('span', { class: 'gd-objet' }, objet);
    const phrase = el('p', { class: 'pos-phrase' }, el('b', {}, 'Touche GAUCHE ou DROITE 👇'));
    const aller = (cote) => {
      bete.className = 'gd-objet ' + cote;
      // "nom" (depuis la v1.18.0) : « La voiture » au lieu du chat (Ava garde ses phrases et ses MP3)
      const qui = v.nom || 'Le chat', verbe = v.verbe || 'court';
      const p = `${qui} ${verbe} vers la ${cote} !`;
      phrase.replaceChildren(el('b', {}, p)); lireAVoixHaute(p);
    };
    return el('div', {},
      el('div', { class: 'gd-scene' }, el('span', { class: 'gd-mot gauche' }, '⬅️ GAUCHE'), el('span', { class: 'gd-mot droite' }, 'DROITE ➡️'), bete),
      phrase,
      el('div', { class: 'pos-boutons gd-boutons' },
        el('button', { class: 'gauche', onclick: () => aller('gauche') }, '⬅️ à gauche'),
        el('button', { class: 'droite', onclick: () => aller('droite') }, 'à droite ➡️')));
  },

  /* LA DIZAINE : une boîte de 10 cases à remplir de chats. À 10 : « 10 = dix = 1 dizaine ! » */
  dizaine(v) {
    const objet = v.objet || '🐱';
    let n = 0;
    const NOMBRES = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix'];
    const boite = el('div', { class: 'diz-boite' });
    const compteur = el('div', { class: 'diz-compteur' });
    const bilan = el('div', { class: 'diz-bilan' });
    function dessiner() {
      boite.replaceChildren(...Array.from({ length: 10 }, (_, i) => el('button', {
        class: 'diz-case' + (i < n ? ' pleine' : ''), 'aria-label': `case ${i + 1}`,
        onclick: () => { if (i === n) { n++; lireAVoixHaute(NOMBRES[n]); dessiner(); } },
      }, i < n ? objet : '')));
      compteur.replaceChildren(el('b', {}, String(n)), ` ${objet}`);
      bilan.replaceChildren();
      if (n === 10) {
        lireAVoixHaute('Dix ! Une dizaine !');
        bilan.append(el('p', { class: 'diz-bravo pop' }, '🎉 10 = dix = 1 dizaine !'),
          el('div', { class: 'grille-cartes' }, [['✋✋', '2 mains'], ['⚄ ⚄', '5 et 5'], ['🔟', '1 dizaine'], ['10', 'dix']]
            .map(([e, t], i) => el('div', { class: 'carte-info', style: cascade(i) }, el('div', { class: 'carte-emoji' }, e), el('b', {}, t)))));
        eclats(boite, [objet, '⭐', '🎉']);
      }
    }
    dessiner();
    return el('div', {}, el('p', { class: 'pos-consigne' }, '👆 Touche les cases une par une et compte avec moi !'), compteur, boite, bilan,
      el('button', { class: 'btn-visuel secondaire', onclick: () => { n = 0; couperVoix(); dessiner(); } }, '↺ Vider la boîte'));
  },

  /* LES NOMBRES DE 11 À 19 : { de: 11, a: 19 } — une barre de 10 + des cubes, le nom du nombre lu */
  nombres(v) {
    const NOMS = { 11: 'onze', 12: 'douze', 13: 'treize', 14: 'quatorze', 15: 'quinze', 16: 'seize', 17: 'dix-sept', 18: 'dix-huit', 19: 'dix-neuf', 20: 'vingt' };
    const vue = el('div', { class: 'nb-vue' });
    const boutons = el('div', { class: 'nb-boutons' });
    function montrer(x, parler = true) {
      const u = x - 10;
      vue.replaceChildren(
        el('div', { class: 'nb-grand' }, String(x)),
        el('div', { class: 'nb-mot' }, NOMS[x].startsWith('dix-') ? [el('b', {}, 'dix'), NOMS[x].slice(3)] : NOMS[x]),
        el('div', { class: 'nb-cubes' }, el('span', { class: 'nb-barre', title: '1 dizaine' }, Array.from({ length: 10 }, () => el('i'))),
          Array.from({ length: u }, (_, i) => el('span', { class: 'nb-cube', style: cascade(i) }))),
        el('p', { class: 'nb-phrase' }, `1 dizaine et ${u} unité${u > 1 ? 's' : ''}`));
      [...boutons.children].forEach((b) => b.classList.toggle('actif', Number(b.textContent) === x));
      if (parler) lireAVoixHaute(`${NOMS[x]} : une dizaine et ${u}`);
    }
    for (let x = v.de || 11; x <= (v.a || 19); x++) boutons.append(el('button', { onclick: () => montrer(x) }, String(x)));
    montrer(v.de || 11, false);
    return el('div', {}, boutons, vue);
  },

  /* PLUS ET MOINS EN IMAGES : { exemples: [{ calcul: "2 + 1 + 2", emoji: "🧒", histoire: "…" }] }
     Étape par étape : les objets arrivent (+) ou sont barrés (−), puis le résultat. */
  calcul(v) {
    const vue = el('div', { class: 'calc-vue' });
    const texte = el('p', { class: 'calc-texte' });
    const histoire = el('p', { class: 'calc-histoire' });
    const choix = el('div', { class: 'conversion-choix' });
    let ex, etapes, k;
    // "8 - 2" -> [["+", 8], ["-", 2]] : le 1er nombre est toujours « ajouté » (c'est le départ)
    const decouper = (calcul) => calcul.replace(/−/g, '-').match(/[+-]?\s*\d+/g)
      .map((m, j) => [j === 0 || m.trim().startsWith('+') ? '+' : '-', Number(m.replace(/[^\d]/g, ''))]);
    function preparer(i, parler = true) {
      ex = v.exemples[i]; etapes = decouper(ex.calcul); k = 0;
      [...choix.children].forEach((b, j) => b.classList.toggle('actif', j === i));
      histoire.replaceChildren(ex.histoire ? '📖 ' + ex.histoire : '');
      dessiner();
      if (parler) lireAVoixHaute(ex.histoire || ex.calcul);
    }
    function dessiner() {
      const objets = [];
      let total = 0;
      const ecrit = [];
      etapes.slice(0, k + 1).forEach(([signe, nb], j) => {
        ecrit.push(j === 0 ? String(nb) : `${signe === '+' ? '+' : '−'} ${nb}`);
        if (signe === '+') { for (let z = 0; z < nb; z++) objets.push({ barre: false, nouveau: j === k && j > 0 }); total += nb; }
        else { // on barre les derniers objets encore là
          let reste = nb;
          for (let z = objets.length - 1; z >= 0 && reste; z--) if (!objets[z].barre) { objets[z].barre = true; objets[z].nouveau = j === k; reste--; }
          total -= nb;
        }
      });
      const fini = k === etapes.length - 1;
      vue.replaceChildren(el('div', { class: 'calc-objets' }, objets.map((o, i) => el('span', {
        class: 'calc-objet' + (o.barre ? ' barre' : '') + (o.nouveau ? ' nouveau' : ''), style: cascade(o.nouveau ? i % 5 : 0),
      }, ex.emoji || '🐱'))));
      // un nombre seul (« 3 », pour compter) : pas de « = 3 » ni de bouton « Et après ? » (depuis la v1.17.0)
      const seul = etapes.length === 1;
      texte.replaceChildren(el('b', {}, ecrit.join(' ') + (fini && !seul ? ` = ${total}` : '')), fini && !seul ? ' 🎉' : '');
      suivant.disabled = fini;
      suivant.hidden = seul;
      if (fini && k > 0) lireAVoixHaute(`${ecrit.join(' ')} égale ${total}`);
    }
    const suivant = el('button', { class: 'btn-visuel', onclick: () => { k++; dessiner(); } }, '▶ Et après ?');
    v.exemples.forEach((e, i) => choix.append(el('button', { onclick: () => preparer(i) }, `${e.emoji || ''} ${e.calcul}`)));
    preparer(0, false); // premier exemple affiché sans voix (la page vient de s'ouvrir)
    return el('div', {}, choix, histoire, vue, texte, suivant);
  },

  /* UN SON, UNE LETTRE : { lettres: "a A", geste: "J'ouvre ma main…", son: "a", graphies: ["a", "â"],
                            mots: [{ emoji: "🐱", mot: "chat" }] }
     Grande lettre (script + attaché), le geste, et des mots-images : on touche, on entend,
     la lettre du son est colorée dans le mot. */
  son(v) {
    const graphies = v.graphies || [v.son];
    // colore la lettre du son dans le mot (on cherche d'abord les graphies les plus longues)
    const colorer = (mot) => {
      const motif = new RegExp(`(${[...graphies].sort((a, b) => b.length - a.length).join('|')})`, 'g');
      return mot.split(motif).map((m, i) => (i % 2 ? el('b', { class: 'son-lettre' }, m) : m));
    };
    const carte = el('button', { class: 'son-carte', onclick: () => lireAVoixHaute(v.direSon || v.son) },
      el('span', { class: 'son-script' }, v.lettres),
      el('span', { class: 'son-attache attache' }, v.attache || v.lettres.split(' ').filter((x) => x === x.toLowerCase()).join(' ')),
      el('span', { class: 'son-ecoute' }, '🔊'));
    return el('div', {},
      el('div', { class: 'son-tete' }, carte, el('p', { class: 'son-geste' }, '🖐️ ', v.geste)),
      el('div', { class: 'son-mots' }, v.mots.map((m, i) => el('button', {
        class: 'son-mot', style: cascade(i), onclick: (e) => { lireAVoixHaute(m.mot); e.currentTarget.classList.remove('pop'); void e.currentTarget.offsetWidth; e.currentTarget.classList.add('pop'); },
      }, el('span', { class: 'son-emoji' }, m.emoji), el('span', { class: 'son-texte' }, colorer(m.mot))))));
  },

  /* SYLLABES : { consonnes: ["f", "n"], voyelles: ["a", "i", "o", "u", "é", "e"] }
     On choisit une consonne : « f + a = fa ». On touche une syllabe pour l'entendre. */
  syllabes(v) {
    // Ce que la voix doit dire pour bien prononcer chaque syllabe (« fe » se dit « feu »)
    // Depuis la v1.17.0 (Malo) : aussi les sons à 2 lettres. « ai » et « ei » se disent « è » (« mai » serait lu
    // comme le mois), « en » se dit « an ».
    const DIRE_V = { a: 'a', i: 'i', o: 'o', u: 'u', é: 'é', è: 'è', e: 'eu', y: 'i',
      ou: 'ou', on: 'on', an: 'an', en: 'an', ai: 'è', ei: 'è', oi: 'oi', in: 'in' };
    const grille = el('div', { class: 'syl-grille' });
    const boutons = el('div', { class: 'arrondi-rangs' });
    function montrer(c) {
      grille.replaceChildren(...v.voyelles.map((voy, i) => el('button', {
        class: 'syl-case', style: cascade(i),
        onclick: () => lireAVoixHaute(c + DIRE_V[voy]),
      }, el('small', {}, `${c} + ${voy}`), el('b', {}, c + voy), el('b', { class: 'attache' }, c + voy))));
      [...boutons.children].forEach((b) => b.classList.toggle('actif', b.textContent === c));
    }
    v.consonnes.forEach((c) => boutons.append(el('button', { onclick: () => montrer(c) }, c)));
    montrer(v.consonnes[0]);
    return el('div', {}, el('p', { class: 'pos-consigne' }, 'Choisis une lettre, puis touche une syllabe pour l’entendre 👂'), boutons, grille);
  },

  /* ALPHABET : lettres en script -> en attaché ; on touche une lettre pour entendre son nom */
  alphabet(v) {
    const lettres = (v.lettres || 'abcdefghijklmnopqrstuvwxyz').split('');
    return el('div', { class: 'alpha-grille' }, lettres.map((l, i) => el('button', {
      class: 'alpha-case', style: cascade(i % 8), onclick: () => lireAVoixHaute(l),
    }, el('span', {}, l), el('i', {}, '→'), el('span', { class: 'attache' }, l))));
  },

  /* ===================== DEPUIS LA v1.17.0 : MALO (CP) ET ELOUAN (MATERNELLE) ===================== */

  /* DIZAINES ET UNITÉS (Malo) : { exemples: ["34", "20 + 30", "23 + 14"] }
     - un nombre seul ("34") : 3 barres de 10 + 4 cubes, « trente-quatre : 3 dizaines et 4 unités » ;
     - une addition ("23 + 14") : étape par étape avec « ▶ Et après ? » :
         1) le 1er nombre (barres bleues)   2) le 2e nombre arrive (barres vertes)
         3) on compte les dizaines ensemble 4) puis les unités   5) le résultat.
     Ce qui est lu est écrit EN LETTRES (« vingt-trois ») : la voix ElevenLabs lit « 10 » en anglais. */
  dizaines(v) {
    const vue = el('div', { class: 'dz-vue' });
    const texte = el('p', { class: 'calc-texte' });
    const choix = el('div', { class: 'conversion-choix' });
    const suivant = el('button', { class: 'btn-visuel' }, '▶ Et après ?');
    const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;            // 1 dizaine, 2 dizaines
    const enLettres = (n, mot) => `${n === 1 ? 'une' : nomNombre(n)} ${mot}${n > 1 ? 's' : ''}`; // « une dizaine », « deux dizaines »
    // Barres de 10 et cubes d'un nombre ; "b" = 2e nombre (autre couleur), "nouveau" = animation d'arrivée
    const paquet = (n, b, nouveau) => el('div', { class: 'dz-paquet' + (b ? ' b' : '') + (nouveau ? ' nouveau' : '') },
      el('div', { class: 'dz-dizaines' }, Array.from({ length: Math.floor(n / 10) }, (_, i) =>
        el('span', { class: 'nb-barre', style: cascade(i) }, Array.from({ length: 10 }, () => el('i'))))),
      el('div', { class: 'dz-unites' }, Array.from({ length: n % 10 }, (_, i) => el('span', { class: 'nb-cube', style: cascade(i) }))),
      el('b', { class: 'dz-nombre' }, String(n)));
    let etapes = [], k = 0;

    function preparer(i, parler = true) {
      const ex = String(v.exemples[i]);
      [...choix.children].forEach((b, j) => b.classList.toggle('actif', j === i));
      const [a, b] = ex.split('+').map((x) => Number(x.trim()));
      const da = Math.floor(a / 10), ua = a % 10;
      if (b === undefined) {
        // Un nombre seul : une seule étape
        etapes = [{
          dessin: () => [paquet(a)],
          ecrit: [el('b', {}, `${a} = ${pluriel(da, 'dizaine')} et ${pluriel(ua, 'unité')}`)],
          dit: `${nomNombre(a)} : ${enLettres(da, 'dizaine')} et ${enLettres(ua, 'unité')}`,
        }];
      } else {
        const db = Math.floor(b / 10), ub = b % 10, total = a + b;
        etapes = [
          { dessin: () => [paquet(a)], ecrit: [el('b', {}, `${a}`), ` : ${pluriel(da, 'dizaine')} et ${pluriel(ua, 'unité')}`],
            dit: `${nomNombre(a)} : ${enLettres(da, 'dizaine')} et ${enLettres(ua, 'unité')}` },
          { dessin: () => [paquet(a), el('span', { class: 'dz-plus' }, '+'), paquet(b, true, true)],
            ecrit: [el('b', {}, `+ ${b}`), ` : ${pluriel(db, 'dizaine')} et ${pluriel(ub, 'unité')}`],
            dit: `plus ${nomNombre(b)} : ${enLettres(db, 'dizaine')} et ${enLettres(ub, 'unité')}` },
          { dessin: () => [paquet(a), el('span', { class: 'dz-plus' }, '+'), paquet(b, true)], classe: 'voir-dizaines',
            ecrit: ['Les dizaines : ', el('b', {}, `${da} + ${db} = ${pluriel(da + db, 'dizaine')}`)],
            dit: `Les dizaines : ${nomNombre(da)} plus ${nomNombre(db)}, ça fait ${enLettres(da + db, 'dizaine')}` },
          { dessin: () => [paquet(a), el('span', { class: 'dz-plus' }, '+'), paquet(b, true)], classe: 'voir-unites',
            ecrit: ['Les unités : ', el('b', {}, `${ua} + ${ub} = ${pluriel(ua + ub, 'unité')}`)],
            dit: `Les unités : ${nomNombre(ua)} plus ${nomNombre(ub)}, ça fait ${enLettres(ua + ub, 'unité')}` },
          { dessin: () => [paquet(total, false, true)], fini: true,
            ecrit: [el('b', {}, `${a} + ${b} = ${total}`), ' 🎉'],
            dit: `${nomNombre(a)} plus ${nomNombre(b)} égale ${nomNombre(total)}` },
        ];
      }
      k = 0;
      dessiner(parler);
    }
    function dessiner(parler = true) {
      const e = etapes[k];
      vue.className = 'dz-vue ' + (e.classe || '');
      vue.replaceChildren(...e.dessin());
      texte.replaceChildren(...e.ecrit);
      suivant.hidden = etapes.length === 1;
      suivant.disabled = k === etapes.length - 1;
      if (e.fini) eclats(vue, ['⭐', '🎉']);
      if (parler) lireAVoixHaute(e.dit);
    }
    suivant.addEventListener('click', () => { k++; dessiner(); });
    v.exemples.forEach((e, i) => choix.append(el('button', { onclick: () => preparer(i) }, String(e))));
    preparer(0, false); // premier exemple affiché sans voix (la page vient de s'ouvrir)
    return el('div', {}, choix, vue, texte, suivant);
  },

  /* IMAGIER (Elouan, maternelle) : { mots: [{ emoji: "🦕", mot: "le diplodocus", phrase: "Il a un très long cou.",
                                            syllabes: ["di", "plo", "do", "cus"] }] }
     On touche une image : elle grossit, le mot puis la petite phrase sont lus. « 🗣️ À toi ! » invite à répéter.
     Avec "syllabes" : « 👏 En morceaux » dit le mot syllabe par syllabe (on tape dans ses mains à chaque morceau),
     pour travailler la prononciation des mots longs. "dit" (facultatif) = ce que la voix lit à la place du mot. */
  imagier(v) {
    const zoom = el('div', { class: 'img-zoom' });
    const grille = el('div', { class: 'img-grille' });
    function montrer(m, i, parler = true) {
      [...grille.children].forEach((b, j) => b.classList.toggle('actif', j === i));
      const dire = () => lireAVoixHaute([m.dit || m.mot, m.phrase].filter(Boolean));
      const morceaux = el('div', { class: 'img-syllabes' });
      const enMorceaux = () => {
        // les bulles s'allument l'une après l'autre (CSS : délai --i), à peu près au rythme de la voix
        morceaux.replaceChildren(...m.syllabes.map((s, j) => el('span', { class: 'img-syl', style: cascade(j) }, '👏 ', s)));
        lireAVoixHaute([...m.syllabes, m.dit || m.mot]);
      };
      zoom.replaceChildren(
        el('div', { class: 'img-grand pop' }, m.emoji),
        el('p', { class: 'img-mot' }, m.mot),
        m.phrase ? el('p', { class: 'img-phrase' }, m.phrase) : null,
        morceaux,
        el('div', { class: 'img-actions' },
          el('button', { class: 'btn-visuel secondaire', onclick: dire }, '🔊 Encore'),
          m.syllabes ? el('button', { class: 'btn-visuel secondaire', onclick: enMorceaux }, '👏 En morceaux') : null),
        el('p', { class: 'img-a-toi' }, '🗣️ À toi : dis-le avec moi !'));
      if (parler) dire();
    }
    v.mots.forEach((m, i) => grille.append(el('button', { class: 'img-carte', style: cascade(i), onclick: () => montrer(m, i) },
      el('span', { class: 'img-emoji' }, m.emoji))));
    zoom.append(el('p', { class: 'pos-consigne' }, '👆 Touche une image pour entendre son nom.'));
    return el('div', {}, grille, zoom);
  },

  /* LE CORPS DU DINOSAURE (Elouan) : { visuel: "corpsdino" } (option "parties": liste des clés à garder)
     Un dinosaure dessiné en SVG. Mode « découvrir » : on touche une partie, elle s'allume et son nom est lu.
     Mode « 🎯 Jeu » : la voix demande « Montre-moi la queue ! », l'enfant touche ; s'il se trompe,
     la voix dit ce qu'il a touché (« Ça, c'est le cou. ») puis redemande. */
  corpsdino(v) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };
    // [clé, nom lu, formes SVG]  — l'ordre compte : ce qui est dessiné après passe au-dessus
    const PARTIES = [
      ['queue', 'la queue', [['path', { d: 'M232 96 Q290 100 314 150 Q282 128 236 132 Z' }]]],
      ['pattes', 'les pattes', [['rect', { x: 128, y: 132, width: 22, height: 46, rx: 9 }], ['rect', { x: 158, y: 136, width: 22, height: 42, rx: 9 }],
        ['rect', { x: 200, y: 134, width: 24, height: 44, rx: 9 }], ['rect', { x: 228, y: 128, width: 22, height: 48, rx: 9 }]]],
      ['dos', 'le dos', [['path', { d: 'M126 82 L138 52 L152 74 L166 44 L182 70 L198 46 L212 74 L226 58 L234 92 Z' }]]],
      ['corps', 'le ventre', [['ellipse', { cx: 182, cy: 108, rx: 62, ry: 36 }]]],
      ['cou', 'le cou', [['path', { d: 'M86 66 Q112 64 136 86 L134 122 Q100 104 74 84 Z' }]]],
      ['tete', 'la tête', [['ellipse', { cx: 62, cy: 60, rx: 34, ry: 23 }]]],
      ['bouche', 'la bouche', [['path', { d: 'M30 66 Q52 82 78 72 Q56 76 32 62 Z' }], ['path', { d: 'M40 69 l3 6 l3 -5 M52 73 l3 6 l3 -6', class: 'dino-dents' }]]],
      ['oeil', 'l’œil', [['circle', { cx: 60, cy: 52, r: 8 }]]],
      ['griffes', 'les griffes', [['path', { d: 'M128 178 l4 8 l4 -8 l4 8 l4 -8 M200 178 l4 8 l4 -8 l4 8 l4 -8 M228 176 l4 8 l4 -8 l4 8 l4 -8 M158 178 l4 8 l4 -8 l4 8 l4 -8' }]]],
    ].filter(([cle]) => !v.parties || v.parties.includes(cle));
    const dessin = svg('svg', { viewBox: '0 0 320 196', class: 'dino-svg', role: 'img', 'aria-label': 'Un dinosaure' });
    const groupes = {};
    for (const [cle, , formes] of PARTIES) {
      const g = svg('g', { class: 'dino-partie dino-' + cle });
      formes.forEach(([tag, attrs]) => g.append(svg(tag, attrs)));
      if (cle === 'oeil') g.append(svg('circle', { cx: 62, cy: 51, r: 3.5, class: 'dino-pupille' }));
      g.addEventListener('click', () => toucher(cle));
      groupes[cle] = g;
      dessin.append(g);
    }
    const nom = Object.fromEntries(PARTIES.map(([cle, n]) => [cle, n]));
    const phrase = el('p', { class: 'pos-phrase' }, el('b', {}, '👆 Touche le dinosaure !'));
    const bouton = el('button', { class: 'btn-visuel' }, '🎯 Jeu : trouve la partie !');
    let jeu = null; // { reste: [clés à trouver], cible: clé demandée } quand on joue
    const allumer = (cle, classe = 'actif') => {
      Object.values(groupes).forEach((g) => g.classList.remove('actif', 'trouve'));
      if (cle) groupes[cle].classList.add(classe);
    };
    const ecrire = (t) => { phrase.replaceChildren(el('b', {}, t)); phrase.classList.remove('pop'); void phrase.offsetWidth; phrase.classList.add('pop'); };
    function demander() {
      if (!jeu.reste.length) {
        ecrire('🏆 Bravo ! Tu as tout trouvé !'); lireAVoixHaute('Bravo ! Tu as trouvé toutes les parties du dinosaure !');
        eclats(dessin, ['🦕', '⭐', '🎉']); jeu = null; bouton.textContent = '🔁 Rejouer'; return;
      }
      jeu.cible = jeu.reste[0];
      allumer(null);
      ecrire(`Montre-moi ${nom[jeu.cible]} !`); lireAVoixHaute(`Montre-moi ${nom[jeu.cible]} !`);
    }
    function toucher(cle) {
      if (!jeu) { allumer(cle); ecrire(nom[cle]); lireAVoixHaute(nom[cle]); return; }  // mode découvrir
      if (cle === jeu.cible) {
        allumer(cle, 'trouve'); son('bon'); ecrire('Bravo ! ⭐'); lireAVoixHaute('Bravo !');
        jeu.reste.shift(); setTimeout(demander, 1600);
      } else {
        // On ne dit pas « non » : on nomme ce qu'il a touché, puis on redemande (c'est aussi du vocabulaire)
        const ca = `Ça, ${nom[cle].startsWith('les ') ? 'ce sont' : 'c’est'} ${nom[cle]}.`; // « ce sont les pattes »
        allumer(cle); ecrire(`${ca} Cherche ${nom[jeu.cible]} !`);
        lireAVoixHaute([ca, `Montre-moi ${nom[jeu.cible]} !`]);
      }
    }
    bouton.addEventListener('click', () => { jeu = { reste: melanger(Object.keys(nom)) }; bouton.textContent = '🎯 Jeu en cours…'; demander(); });
    return el('div', { class: 'dino' }, dessin, phrase, bouton);
  },

  /* CODER UN DÉPLACEMENT SUR UN QUADRILLAGE (CP, depuis la v1.18.0) :
       { colonnes: 6, lignes: 5, depart: [0, 4], objet: "🐝",       // case = [colonne, ligne], [0, 0] = en haut à gauche
         arrivee: { case: [4, 1], emoji: "🌸" }, code: ["↑", "↑", "→"],
         decors: [{ case: [2, 2], emoji: "🐞" }] }                    // facultatif
     « ▶ Lancer le code » : l'objet suit les flèches une par une (la flèche en cours s'allume).
     « 🎮 À moi ! » : l'enfant pilote avec 4 boutons flèches ; son code s'écrit au fur et à mesure,
     et c'est gagné quand il arrive sur la case d'arrivée. */
  codage(v) {
    const C = v.colonnes || 6, L = v.lignes || 5;
    const PAS = { '↑': [0, -1], '↓': [0, 1], '←': [-1, 0], '→': [1, 0] };
    const grille = el('div', { class: 'cod-grille', style: `grid-template-columns:repeat(${C},1fr)` });
    const bande = el('div', { class: 'cod-code' });
    const info = el('p', { class: 'pos-phrase' });
    let pos, minuterie = null, monCode = [];
    const egal = (a, b) => a[0] === b[0] && a[1] === b[1];
    function dessiner() {
      grille.replaceChildren(...Array.from({ length: C * L }, (_, i) => {
        const c = [i % C, Math.floor(i / C)];
        const deco = (v.decors || []).find((d) => egal(d.case, c));
        const contenu = egal(c, pos) ? v.objet || '🐝'
          : v.arrivee && egal(c, v.arrivee.case) ? v.arrivee.emoji : deco ? deco.emoji : '';
        return el('span', { class: 'cod-case' + (egal(c, pos) ? ' ici' : '') }, contenu);
      }));
    }
    // la bande de flèches : celle d'indice "actif" s'allume
    const montrerCode = (code, actif = -1) => bande.replaceChildren(
      el('span', { class: 'cod-fleche depart' }, v.objet || '🐝'),
      ...code.map((f, i) => el('span', { class: 'cod-fleche' + (i === actif ? ' actif' : i < actif ? ' fait' : '') }, f)),
      v.arrivee ? el('span', { class: 'cod-fleche depart' }, v.arrivee.emoji) : null);
    const ecrire = (t) => info.replaceChildren(el('b', {}, t));
    // un pas : on ne sort jamais du quadrillage
    const bouger = (f) => {
      const [dx, dy] = PAS[f];
      pos = [Math.min(C - 1, Math.max(0, pos[0] + dx)), Math.min(L - 1, Math.max(0, pos[1] + dy))];
      dessiner();
    };
    const arrive = () => v.arrivee && egal(pos, v.arrivee.case);
    function remettre() {
      clearInterval(minuterie); pos = [...v.depart]; monCode = []; dessiner();
    }
    function lancer() {
      remettre(); manette.hidden = true;
      let k = 0;
      montrerCode(v.code, 0); ecrire('Le robot lit le code…');
      minuterie = setInterval(() => {
        if (k >= v.code.length) {
          clearInterval(minuterie); montrerCode(v.code, v.code.length);
          ecrire(arrive() ? 'Arrivé ! 🎉' : 'Fin du code.');
          if (arrive()) eclats(grille, ['⭐', '🎉']);
          return;
        }
        montrerCode(v.code, k); bouger(v.code[k]); k++;
      }, 700);
    }
    // mode « à moi » : 4 boutons flèches
    const manette = el('div', { class: 'cod-manette', hidden: true },
      ['↑', '←', '↓', '→'].map((f) => el('button', { class: 'cod-btn', onclick: () => {
        if (arrive()) return;
        monCode.push(f); bouger(f); montrerCode(monCode, monCode.length);
        if (arrive()) { ecrire(`Bravo ! Ton code a ${monCode.length} flèches. 🎉`); son('bon'); eclats(grille, ['⭐', '🎉']); }
      } }, f)),
      el('button', { class: 'cod-btn efface', onclick: () => { remettre(); montrerCode([]); ecrire('On recommence !'); } }, '↺'));
    const aMoi = () => {
      remettre(); manette.hidden = false; montrerCode([]);
      ecrire(v.arrivee ? `À toi ! Amène ${v.objet || '🐝'} jusqu'à ${v.arrivee.emoji}` : 'À toi ! Déplace le robot.');
    };
    remettre(); montrerCode(v.code || []);
    ecrire('👆 Lance le code, ou pilote toi-même !');
    return el('div', { class: 'cod' }, bande, grille, info, manette,
      el('div', { class: 'img-actions' },
        v.code ? el('button', { class: 'btn-visuel', onclick: lancer }, '▶ Lancer le code') : null,
        el('button', { class: 'btn-visuel secondaire', onclick: aMoi }, '🎮 À moi !')));
  },

  /* CROQUIS D'UNE AIRE URBAINE (géographie, depuis la v1.16.0) :
       { zones: [{ nom, couleur, texte }, …]   // du centre vers l'extérieur (4 au maximum)
         etalement: "texte", mobilites: "texte" }   // explications des deux sortes de flèches
     Dessin façon cahier : taches de couleur emboîtées, grosses flèches noires = étalement urbain,
     flèches fines à deux pointes = mobilités quotidiennes (migrations pendulaires).
     On touche une zone (sur le dessin ou dans la légende) : elle s'allume et son explication s'affiche.
     Le bouton « 🙈 Cacher la légende » remplace les noms par « ? » pour réciter le croquis de tête. */
  croquis(v) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };
    const zones = (v.zones || []).slice(0, 4);
    // Une tache « faite main » : ellipse un peu bosselée (rayons rx, ry autour de 160, 110)
    const tache = (rx, ry, graine) => {
      let d = '';
      const n = 14;
      for (let k = 0; k <= n; k++) {
        const a = (k / n) * Math.PI * 2;
        const bosse = 1 + 0.07 * Math.sin(a * 3 + graine) + 0.04 * Math.cos(a * 5 + graine * 2);
        const x = 160 + Math.cos(a) * rx * bosse, y = 110 + Math.sin(a) * ry * bosse;
        d += (k ? ' L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
      }
      return d + ' Z';
    };
    // Tailles des taches, de l'extérieur (espace rural = tout le cadre) vers le centre
    const tailles = [null, [128, 88], [78, 54], [38, 24]];
    const dessin = svg('svg', { viewBox: '0 0 320 220', class: 'croquis-svg', role: 'img' });
    const formes = [];
    // On dessine de l'extérieur vers l'intérieur pour que le centre soit au-dessus
    for (let i = zones.length - 1; i >= 0; i--) {
      const z = zones[i];
      const rang = zones.length - 1 - i; // 0 = zone la plus extérieure
      const forme = rang === 0 && zones.length === 4
        ? svg('rect', { x: 2, y: 2, width: 316, height: 216, rx: 8 })
        : svg('path', { d: tache(...tailles[rang + (4 - zones.length)], i + 1) });
      forme.setAttribute('fill', z.couleur || '#ddd');
      forme.setAttribute('class', 'croquis-zone');
      forme.addEventListener('click', () => choisir(i));
      formes[i] = forme;
      dessin.append(forme);
    }
    // Grosses flèches noires (étalement) : partent de la banlieue vers l'extérieur
    const grosseFleche = (x, y, angle) => {
      const g = svg('g', { transform: `translate(${x} ${y}) rotate(${angle})`, class: 'croquis-etalement' });
      g.append(svg('path', { d: 'M0 -7 L22 -7 L22 -14 L40 0 L22 14 L22 7 L0 7 Z' }));
      g.addEventListener('click', () => choisir('etalement'));
      return g;
    };
    [[228, 58, -35], [76, 66, 200], [222, 158, 40], [84, 150, 150]].forEach((f) => dessin.append(grosseFleche(...f)));
    // Flèches fines à deux pointes (mobilités quotidiennes) : entre la couronne et le centre
    // Pointe de flèche réutilisable (« marker » SVG), posée aux deux bouts des traits fins
    const defs = svg('defs', {});
    const pointe = svg('marker', { id: 'croquis-pointe', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' });
    pointe.append(svg('path', { d: 'M0 0 L10 5 L0 10 Z' }));
    defs.append(pointe);
    dessin.append(defs);
    [[100, 104, 138, 110], [178, 114, 236, 118], [160, 74, 160, 96]].forEach(([x1, y1, x2, y2]) => {
      const l = svg('line', { x1, y1, x2, y2, class: 'croquis-mobilite', 'marker-start': 'url(#croquis-pointe)', 'marker-end': 'url(#croquis-pointe)' });
      l.addEventListener('click', () => choisir('mobilites'));
      dessin.append(l);
    });

    // Légende (boutons) + zone d'explication
    const explication = el('p', { class: 'croquis-explication' }, 'Touche une couleur ou une flèche 👆');
    const boutons = [];
    const legende = el('div', { class: 'croquis-legende' });
    const ajouterBouton = (cle, pastille, nom) => {
      const b = el('button', { onclick: () => choisir(cle) }, pastille, el('span', { class: 'croquis-nom' }, nom));
      b.dataset.nom = nom;
      boutons.push([cle, b]);
      legende.append(b);
    };
    zones.forEach((z, i) => ajouterBouton(i, el('i', { class: 'croquis-pastille', style: `background:${z.couleur}` }), z.nom));
    if (v.etalement) ajouterBouton('etalement', el('i', { class: 'croquis-picto' }, '➡'), 'étalement urbain');
    if (v.mobilites) ajouterBouton('mobilites', el('i', { class: 'croquis-picto fin' }, '⟷'), 'mobilités quotidiennes');

    // Allume l'élément choisi et affiche son explication (le nom reste caché si la légende l'est)
    let cache = false;
    function choisir(cle) {
      formes.forEach((f, i) => f.classList.toggle('eteinte', typeof cle === 'number' && i !== cle));
      dessin.classList.toggle('montre-etalement', cle === 'etalement');
      dessin.classList.toggle('montre-mobilites', cle === 'mobilites');
      boutons.forEach(([c, b]) => b.classList.toggle('actif', c === cle));
      const texte = typeof cle === 'number' ? zones[cle].texte : v[cle];
      const nom = typeof cle === 'number' ? zones[cle].nom : (cle === 'etalement' ? 'Étalement urbain' : 'Mobilités quotidiennes');
      explication.replaceChildren(...(cache
        ? [el('b', {}, '❓ Comment ça s’appelle ? '), el('button', { class: 'croquis-reveler', onclick: () => explication.replaceChildren(el('b', {}, nom + ' : '), ...enrichir(texte || '')) }, 'Voir la réponse')]
        : [el('b', {}, nom + ' : '), ...enrichir(texte || '')]));
    }
    // Cacher / montrer les noms de la légende, pour s'entraîner à refaire le croquis
    const basculer = el('button', { class: 'croquis-cacher', onclick: () => {
      cache = !cache;
      boutons.forEach(([, b]) => (b.querySelector('.croquis-nom').textContent = cache ? '?' : b.dataset.nom));
      basculer.textContent = cache ? '👀 Montrer la légende' : '🙈 Cacher la légende';
      explication.textContent = cache ? 'Touche une couleur : sauras-tu dire son nom ?' : 'Touche une couleur ou une flèche 👆';
    } }, '🙈 Cacher la légende');

    return el('div', { class: 'croquis' }, dessin, legende, explication, basculer);
  },

  /* FRACTIONS (depuis la v1.20.0, leçon de Titouan) :
       { forme: "barre" | "disque", parts: 5, grisees: 1, choix: [2, 3, 4, 5, 6, 10] }
     L'unité (une barre ou une pizza 🍕) est partagée en parts ÉGALES.
     - les boutons du haut choisissent en combien de parts on partage (le dénominateur) ;
     - on touche une part pour la colorier (ou l'effacer) : c'est le numérateur ;
     - à côté, la fraction s'écrit en grand et se lit en toutes lettres (« trois cinquièmes »). */
  fraction(v) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };
    const choix = v.choix || [2, 3, 4, 5, 6, 10];
    let n = v.parts || 5;                       // nombre de parts égales (dénominateur)
    let forme = v.forme || 'barre';
    // les parts coloriées : au départ, les « grisees » premières
    let coloriees = new Set(Array.from({ length: Math.min(v.grisees ?? 1, n) }, (_, i) => i));

    // Nom d'une fraction en toutes lettres : (3, 5) -> « trois cinquièmes »
    const nomFraction = (k, d) => {
      const SPECIAUX = { 2: ['demi', 'demis'], 3: ['tiers', 'tiers'], 4: ['quart', 'quarts'] };
      let nom;
      if (SPECIAUX[d]) nom = SPECIAUX[d][k > 1 ? 1 : 0];
      else {
        // cinq -> cinquième, neuf -> neuvième, six -> sixième (on enlève le « e » final)
        const base = nomNombre(d).replace(/e$/, '').replace(/q$/, 'qu').replace(/f$/, 'v');
        nom = base + 'ième' + (k > 1 ? 's' : '');
      }
      return `${k === 1 ? 'un' : nomNombre(k)} ${nom}`;
    };

    const dessin = el('div', { class: 'frac-dessin' });
    const ecriture = el('div', { class: 'frac-ecriture' });
    const phrase = el('p', { class: 'frac-phrase' });

    function dessiner() {
      const k = coloriees.size;
      let image;
      if (forme === 'disque') {
        // une « pizza » : n parts en éventail, en partant de midi
        image = svg('svg', { viewBox: '0 0 200 200', class: 'frac-svg disque', role: 'img' });
        for (let i = 0; i < n; i++) {
          const a0 = -Math.PI / 2 + (2 * Math.PI * i) / n, a1 = a0 + (2 * Math.PI) / n;
          const p = (a) => `${(100 + 90 * Math.cos(a)).toFixed(2)} ${(100 + 90 * Math.sin(a)).toFixed(2)}`;
          const part = svg('path', { d: `M100 100 L${p(a0)} A90 90 0 ${1 / n > 0.5 ? 1 : 0} 1 ${p(a1)} Z` });
          part.setAttribute('class', 'frac-part' + (coloriees.has(i) ? ' pleine' : ''));
          part.addEventListener('click', () => basculer(i));
          image.append(part);
        }
      } else {
        // une barre partagée en n rectangles
        image = svg('svg', { viewBox: '0 0 304 64', class: 'frac-svg barre', role: 'img' });
        const l = 300 / n;
        for (let i = 0; i < n; i++) {
          const part = svg('rect', { x: (2 + i * l).toFixed(2), y: 2, width: l.toFixed(2), height: 60 });
          part.setAttribute('class', 'frac-part' + (coloriees.has(i) ? ' pleine' : ''));
          part.addEventListener('click', () => basculer(i));
          image.append(part);
        }
      }
      dessin.replaceChildren(image);
      // la fraction écrite « en étage » : numérateur / trait / dénominateur
      ecriture.replaceChildren(
        el('div', { class: 'frac-grande' }, el('span', { class: 'frac-num' }, String(k)), el('span', { class: 'frac-den' }, String(n))),
        el('div', { class: 'frac-nom' }, k === 0 ? 'rien de colorié' : nomFraction(k, n)));
      phrase.replaceChildren(
        'L\'unité est partagée en ', el('b', { class: 'frac-coul-den' }, `${n} parts égales`), ' (le dénominateur) ; ',
        'on en colorie ', el('b', { class: 'frac-coul-num' }, String(k)), ' (le numérateur).',
        // (replaceChildren écrirait « null » : on n'ajoute la ligne que si tout est colorié)
        ...(k === n ? [el('span', { class: 'frac-entier' }, `🎉 Tout est colorié : ${k}/${n} = 1 unité entière !`)] : []));
      [...boutons.children].forEach((b) => b.classList.toggle('actif', Number(b.textContent) === n));
    }
    function basculer(i) {
      if (coloriees.has(i)) coloriees.delete(i); else coloriees.add(i);
      dessiner();
    }
    // les boutons « en combien de parts ? »
    const boutons = el('div', { class: 'nb-boutons' }, choix.map((d) => el('button', { onclick: () => {
      n = d; coloriees = new Set([0]); dessiner();
    } }, String(d))));
    // changer la forme de l'unité : même fraction, autre dessin
    const changerForme = el('button', { class: 'btn-visuel secondaire', onclick: () => {
      forme = forme === 'disque' ? 'barre' : 'disque';
      changerForme.textContent = forme === 'disque' ? '▭ En barre' : '🍕 En pizza';
      dessiner();
    } }, forme === 'disque' ? '▭ En barre' : '🍕 En pizza');
    dessiner();
    return el('div', { class: 'frac' },
      el('p', { class: 'pos-consigne' }, 'En combien de parts égales ?'), boutons,
      el('div', { class: 'frac-vue' }, dessin, ecriture), phrase,
      el('p', { class: 'pos-consigne' }, '👆 Touche les parts pour les colorier'),
      el('div', { class: 'img-actions' }, changerForme));
  },

  /* DROITES PERPENDICULAIRES OU PARALLÈLES (depuis la v1.20.0, leçon de Titouan) :
       { exemples: [{ type: "perpendiculaires" | "paralleles" | "secantes", noms: ["d", "f"], angle: 20 }, …] }
     Deux droites sont dessinées. L'enfant devine (3 boutons), puis l'équerre 📐 vient vérifier :
     - perpendiculaires : le petit carré de l'angle droit se pose au croisement -> codage (d) ⊥ (f) ;
     - parallèles : une 3e droite (en pointillés) les coupe toutes les deux à angle droit -> codage (m) // (n) ;
     - sécantes : l'équerre ne colle pas, l'angle n'est pas droit.
     « Autre exemple » passe au dessin suivant de la liste. */
  droites(v) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = (tag, attrs, texte) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (texte) n.textContent = texte; return n; };
    const exemples = v.exemples && v.exemples.length ? v.exemples
      : [{ type: 'perpendiculaires', noms: ['d', 'f'] }, { type: 'paralleles', noms: ['m', 'n'] }, { type: 'secantes', noms: ['a', 'b'] }];
    const NOMS_TYPES = { perpendiculaires: 'Perpendiculaires', paralleles: 'Parallèles', secantes: 'Ni l\'un ni l\'autre' };
    let rang = 0;
    const dessin = el('div', { class: 'dr-dessin' });
    const message = el('p', { class: 'pos-phrase' });
    const boutons = el('div', { class: 'pos-boutons' });

    // outils de géométrie : vecteur unitaire d'angle a (en degrés), point + t × vecteur
    const dir = (a) => [Math.cos((a * Math.PI) / 180), Math.sin((a * Math.PI) / 180)];
    const plus = (p, u, t) => [p[0] + u[0] * t, p[1] + u[1] * t];
    const C = [160, 105];
    // une droite qui traverse tout le dessin, avec son nom « (d) » près d'un bout
    const droite = (p, u, nom, classe = 'dr-ligne') => {
      const a = plus(p, u, -220), b = plus(p, u, 220);
      const g = svg('g', {});
      g.append(svg('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: classe }));
      if (nom) {
        const t = plus(p, u, 85);
        g.append(svg('text', { x: t[0] + 8, y: t[1] - 8, class: 'dr-nom' }, `(${nom})`));
      }
      return g;
    };
    // le codage de l'angle droit : petit carré au point I, le long des directions u et w
    const angleDroit = (I, u, w, classe = 'dr-carre') => {
      const s = 16, a = plus(I, u, s), b = plus(a, w, s), c = plus(I, w, s);
      return svg('path', { d: `M${a[0]} ${a[1]} L${b[0]} ${b[1]} L${c[0]} ${c[1]}`, class: classe });
    };

    function montrer(verifier = false) {
      const ex = exemples[rang];
      const [n1, n2] = ex.noms || ['d', 'f'];
      const a = ex.angle ?? 15;
      const u = dir(a), w = dir(a + 90);
      const image = svg('svg', { viewBox: '0 0 320 210', class: 'dr-svg', role: 'img' });
      if (ex.type === 'paralleles') {
        // deux droites de même direction, décalées de 46 de part et d'autre du centre
        const p1 = plus(C, w, -46), p2 = plus(C, w, 46);
        image.append(droite(p1, u, n1), droite(p2, u, n2));
        if (verifier) {
          image.append(droite(C, w, null, 'dr-ligne verif'), angleDroit(p1, u, w), angleDroit(p2, u, w));
        }
      } else {
        // deux droites qui se croisent au centre (à 90° si perpendiculaires, sinon à 55°)
        const u2 = ex.type === 'perpendiculaires' ? w : dir(a + 55);
        image.append(droite(C, u, n1), droite(C, u2, n2));
        if (verifier) image.append(angleDroit(C, u, w, ex.type === 'perpendiculaires' ? 'dr-carre' : 'dr-carre rate'));
      }
      dessin.replaceChildren(image);
      if (!verifier) message.replaceChildren('Perpendiculaires, parallèles… ou ni l\'un ni l\'autre ?');
    }
    // l'enfant choisit, puis l'équerre vérifie
    function repondre(choixType) {
      const ex = exemples[rang];
      const [n1, n2] = ex.noms || ['d', 'f'];
      montrer(true);
      const bon = choixType === ex.type;
      const explication = {
        perpendiculaires: [`📐 L'équerre colle : angle droit ! On écrit `, el('b', {}, `(${n1}) ⊥ (${n2})`)],
        paralleles: [`📐 Elles sont toutes les deux perpendiculaires à la même droite : elles ne se couperont jamais. On écrit `, el('b', {}, `(${n1}) // (${n2})`)],
        secantes: ['📐 Elles se coupent, mais l\'équerre ne colle pas : l\'angle n\'est pas droit. Ni perpendiculaires, ni parallèles.'],
      }[ex.type];
      message.replaceChildren(el('b', {}, bon ? 'Bravo ! ' : 'Pas tout à fait… '), ...explication);
      if (bon) { son('bon'); eclats(dessin, ['📐', '⭐']); }
      [...boutons.children].forEach((b) => {
        b.classList.toggle('actif', b.dataset.type === ex.type);
        b.disabled = true;
      });
    }
    function suivant() {
      rang = (rang + 1) % exemples.length;
      [...boutons.children].forEach((b) => { b.classList.remove('actif'); b.disabled = false; });
      montrer();
    }
    Object.entries(NOMS_TYPES).forEach(([type, nom]) => {
      const b = el('button', { onclick: () => repondre(type) }, nom);
      b.dataset.type = type;
      boutons.append(b);
    });
    montrer();
    return el('div', { class: 'dr' }, dessin, boutons, message,
      el('div', { class: 'img-actions' }, el('button', { class: 'btn-visuel secondaire', onclick: suivant }, '🔄 Autre exemple')));
  },
};
