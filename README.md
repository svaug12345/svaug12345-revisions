# 📚 Mes Révisions

Appli Android (PWA) pour réviser les leçons des enfants en s'amusant.
Hébergée sur GitHub Pages, comme Lecteur QR.

## Les fichiers

| Fichier | Rôle | On y touche ? |
|---|---|---|
| `lecons.json` | **Tout le contenu** : enfants, leçons, questions | ✅ oui, c'est le seul |
| `app.js` | Le moteur (écrans, jeux, scores) | non |
| `visuels.js` | Les schémas et animations des fiches | non |
| `style.css` | Couleurs et mise en page | rarement |
| `version.js` | Numéro de version du code | à chaque modif du code |
| `sw.js` | Mode hors-ligne | non |
| `index.html`, `manifest.json`, `icons/` | Page et installation Android | non |

## Mettre en ligne (une seule fois)

1. Créer un dépôt GitHub `svaug12345/svaug12345-revisions` (public).
2. Y déposer tous les fichiers (en gardant le dossier `icons/`).
3. *Settings → Pages → Branch : main / (root) → Save*.
4. Ouvrir `https://svaug12345.github.io/svaug12345-revisions/` dans Chrome sur le téléphone
   → menu ⋮ → **Ajouter à l'écran d'accueil**.

## Ajouter une leçon (depuis le téléphone)

1. App GitHub → dépôt `revisions` → `lecons.json` → ✏️ Modifier.
2. Copier un bloc de leçon existant, le coller à la suite (avec une **virgule** entre deux leçons), le modifier.
3. Mettre à jour la date `"maj"`. Commit.
4. Au prochain lancement de l'appli (avec internet), la leçon apparaît. 🎉

> Si l'appli affiche 😵 « Impossible de lire les leçons », c'est presque toujours
> une virgule en trop/en moins ou un guillemet oublié. Le message indique la position de l'erreur.

## Format d'une leçon

```json
{
  "id": "maths-table-8",          // identifiant unique, sans espace (sert à mémoriser les étoiles)
  "pour": ["tom"],                // ids des enfants, ou ["tous"]
  "matiere": "Maths",             // les leçons sont regroupées par matière
  "titre": "La table de 8",
  "emoji": "✖️",
  "fiche": [                      // la leçon à relire, une ligne par élément
    "# Titre",                    //   # = sous-titre
    "- une puce",                 //   - = liste à puces
    "Du texte avec du **gras**"
  ],
  "activites": [ ... ]            // les questions (voir ci-dessous), jouées dans un ordre mélangé
}
```
(Les `// commentaires` ci-dessus sont des explications : il ne faut **pas** les écrire dans le vrai fichier, le JSON ne les accepte pas.)

## Les 7 types d'activités

| Type | Exemple |
|---|---|
| **QCM** — la 1re proposition est la bonne, l'appli mélange | `{ "type": "qcm", "question": "7 × 6 ?", "choix": ["42", "48", "36"] }` |
| **Vrai / Faux** | `{ "type": "vraifaux", "affirmation": "7 × 9 = 63", "reponse": true }` |
| **Réponse à taper** — accents/majuscules ignorés | `{ "type": "saisie", "question": "Classe de « joie » ?", "reponse": ["nom", "un nom"] }` |
| **Texte à trous** — mots entre crochets | `{ "type": "trous", "texte": "Le [verbe] se conjugue.", "intrus": ["nom"] }` |
| **Associer** | `{ "type": "paires", "paires": [["7 × 3", "21"], ["7 × 5", "35"]] }` |
| **Remettre dans l'ordre** — écrire dans le bon ordre | `{ "type": "ordre", "consigne": "Du plus petit au plus grand", "elements": ["7", "14", "21"] }` |
| **Carte mémo** — l'enfant dit s'il savait | `{ "type": "carte", "recto": "7 × 7", "verso": "49" }` |

Options pour toutes les activités : `"explication"` (affichée après la réponse, 💡) et `"consigne"`.

Option de la réponse à taper : `"strict": true` → les accents comptent (pour la dictée, la conjugaison…). Sans elle, « cotes » = « côtés ».

## 🎨 Fiches illustrées (depuis la v1.5.0)

Chaque ligne `# Titre` de la fiche ouvre une **carte colorée**. Entre les lignes de texte, on peut glisser des
**visuels** (schémas animés, petits jeux) : ce sont des objets `{ "visuel": "…" }` dans la liste `"fiche"`.
Tous acceptent `"titre"` et `"legende"`, et leurs textes acceptent le **gras** et les `{{mots étrangers}}`.

| Visuel | À quoi ça sert | Exemple |
|---|---|---|
| `encadre` | Astuce 💡, attention ⚠️, à retenir 🧠, exemple 👀 | `{"visuel":"encadre","style":"astuce","texte":["…"]}` |
| `cartes` | Grille de cartes avec emoji | `{"visuel":"cartes","elements":[{"emoji":"🌡️","titre":"…","texte":"…"}]}` |
| `tuiles` | Petites tuiles (résultats, mots pièges) | `{"visuel":"tuiles","elements":["7 × 1 = **7**"]}` |
| `conjugaison` | Colonnes de conjugaison, terminaisons en **gras** qui s'allument | `{"visuel":"conjugaison","colonnes":[{"titre":"…","formes":["je chant**ai**"]}]}` |
| `multiplication` | Table en rangées de points, à manipuler | `{"visuel":"multiplication","table":7}` |
| `frise` | Frise chronologique | `{"visuel":"frise","elements":[{"date":"1939","emoji":"⚔️","titre":"…","texte":"…"}]}` |
| `plans` | Imparfait (bande) / passé simple (éclairs ⚡) | `{"visuel":"plans","exemples":[{"phrase":"…","bande":"…","evenements":["…"]}]}` |
| `decision` | « Dans quel cas ? » : on touche un cas, la règle s'affiche | `{"visuel":"decision","question":"…","choix":[{"si":"…","alors":"…","exemple":"…"}]}` |
| `machine` | Calcul en chaîne, l'enfant peut changer le nombre | `{"visuel":"machine","depart":41,"operations":["× 2","× 2"]}` |
| `virgule` | Tableau de numération : × 0,1 / 0,01 / 0,001 | `{"visuel":"virgule","nombre":56,"diviseurs":[10,100,1000]}` |
| `arbre` | Arbre généalogique (der / die en couleur) | `{"visuel":"arbre","niveaux":[{"titre":"…","membres":[{"emoji":"👴","mot":"{{der Opa}}","fr":"…","genre":"m"}]}]}` |
| `barres` | Barres qui se remplissent | `{"visuel":"barres","elements":[{"label":"…","valeur":8.2,"texte":"…"}]}` |
| `densite` | Carrés de 1 km² remplis d'habitants | `{"visuel":"densite","cases":[{"label":"…","points":120}]}` |
| `eprouvette` | Éprouvette graduée interactive (+ objet à plonger) | `{"visuel":"eprouvette","max":100,"unite":"mL","valeur":50,"objet":{"emoji":"🪨","nom":"caillou","volume":15}}` |
| `conversion` | Tableau de conversion d'unités | `{"visuel":"conversion","unites":["L","dL","cL","mL"],"exemples":[{"valeur":"2,5","unite":"L"}]}` |
| `balance` | Balance qui penche | `{"visuel":"balance","gauche":{"label":"…","emoji":"💧","masse":1000},"droite":{…},"unite":"g"}` |
| `flottaison` | Objets qui flottent ou coulent selon leur densité | `{"visuel":"flottaison","objets":[{"nom":"Chêne","emoji":"🪵","densite":0.7}]}` |
| `comparaison` | Deux milieux côte à côte avec des jauges | `{"visuel":"comparaison","cotes":[{"titre":"…","mesures":[{"label":"…","valeur":20,"max":35,"unite":"°C"}]}]}` |
| `liens` | Relations (alimentation, support…) avec flèches | `{"visuel":"liens","types":{…},"liens":[{"de":"…","vers":"…","type":"…","texte":"…"}]}` |

Le code de chaque visuel est dans `visuels.js` (une fonction par visuel, bien commentée).

## 🔊 Audio

La voix (MP3) sert **uniquement aux mots étrangers** des leçons de langues : les autres leçons n'ont plus de lecture audio.

## 🇬🇧🇩🇪 Leçons de langues : écouter et répéter (depuis la v1.3.0)

1. Ajouter à la leçon `"langue": "en"` (anglais) ou `"de"` (allemand).
2. Entourer les mots étrangers de **doubles accolades**, partout (fiche, questions, choix, paires, cartes, explications) :

| On écrit | On voit | On entend |
|---|---|---|
| `{{der Vater}}` | der Vater 🔈 | « der Vater » |
| `{{he / she / it is\|he is. she is. it is.}}` | he / she / it is 🔈 | « he is. she is. it is. » |

- Dans la **fiche** et les **énoncés**, le mot devient un bouton : on le touche → une bulle s'ouvre avec
  🔊 Écouter, 🐢 Lentement et 🎤 **À toi !** (le micro écoute l'enfant et lui dit si c'est bien prononcé).
- Dans les **QCM** et les **paires**, la bonne réponse est prononcée quand elle est trouvée.
- Une **explication** contenant `{{…}}` est lue juste après la réponse (pratique pour réentendre la phrase complète).
- Les mots étrangers sont lus avec **la voix de Papa** (clonée sur ElevenLabs, qui parle aussi anglais et allemand).
  Pour que les petits mots (he, she, we, be…) soient prononcés dans la bonne langue, chaque MP3 est généré avec une
  **amorce** (« Listen and repeat in English… he. » / « Hör gut zu und sprich nach… ich. ») puis l'amorce est coupée.
  Les MP3 sont nommés d'après l'empreinte de `langue|texte prononcé` ; sans MP3, c'est la voix du téléphone dans la bonne langue.
- Le micro (🎤) utilise la reconnaissance vocale de Chrome : il faut internet et autoriser le micro la 1re fois.

## 🔁 Deuxième chance (depuis la v1.4.0)

À la fin d'un quiz, s'il y a des erreurs, l'appli enchaîne **une fois** sur les questions ratées.
Les étoiles comptent seulement le premier passage ; l'écran final dit combien d'erreurs ont été corrigées
et propose de revoir celles qui restent.

## 📦 Archiver une leçon

- Sur la fiche d'une leçon : bouton **« 📦 Archiver cette leçon »**. Elle disparaît de la liste et va dans
  **« 📦 Leçons archivées »** (en bas, replié), d'où on peut la **ressortir** 📤.
- Ce choix est gardé **dans l'appareil** (le téléphone et le PC ont chacun le leur).
- Pour archiver une leçon pour tout le monde, Papa peut ajouter `"archive": true` à la leçon dans `lecons.json`
  (on peut quand même la ressortir depuis l'appli).

## 🧒 Avatars

Dans `lecons.json`, `"avatar"` accepte un emoji (`"🦄"`) **ou** une image du dossier `avatars/`
(`"avatars/gaby.svg"` : guerrière ninja, `tom.svg` : sabre laser, `nanon.svg` : fusée).

## 💻 Sur ordinateur

Même adresse que sur le téléphone : https://svaug12345.github.io/svaug12345-revisions/
La page s'élargit sur grand écran (leçons sur 2 colonnes) et se pilote au clavier :
**1 à 4** pour répondre, **Entrée** pour continuer, **Échap** pour revenir.

## 🔄 Mises à jour

`lecons.json` contient `"versionApp"` : la version minimale du moteur nécessaire. Si un appareil a gardé
un vieux `app.js`, il se met à jour et recharge tout seul. **Quand on ajoute une nouveauté au moteur
utilisée par les leçons, on augmente ce numéro en même temps que `version.js`.**

## Étoiles

⭐⭐⭐ ≥ 90 % · ⭐⭐ ≥ 70 % · ⭐ ≥ 40 %. Le meilleur score est gardé dans le téléphone (chaque téléphone a ses propres scores).
