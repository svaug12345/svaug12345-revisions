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
const nombreFr = (n) => Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 6 });
// Texte -> nombre ("2,5" -> 2.5)
const lireNombre = (t) => Number(String(t).replace(/\s/g, '').replace(',', '.'));

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

  /* TABLE DE MULTIPLICATION en points : { table: 7, max: 10 }
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
          Array.from({ length: t }, () => el('span', { class: 'point' })),
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
};
