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
Pour le mode coup de pouce : `"niveau"` (1 facile, 2 moyen — par défaut, 3 difficile) et `"indice"` (🔎 montré avant le 2e essai).

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
| `multiplication` | Table en rangées de points (ou d'emojis avec `"emoji"`), à manipuler | `{"visuel":"multiplication","table":11,"emoji":"🧍"}` |
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
| `arrondi` | Arrondir et encadrer : le ballon ⚽ roule vers le but (nombre rond) le plus proche ; l'enfant peut taper son nombre | `{"visuel":"arrondi","exemples":["658 741","1 250"],"rangs":["dizaine","centaine","millier"]}` |
| `droite` | Droite graduée : on touche un objet, il tombe à sa place et on explique la lecture | `{"visuel":"droite","debut":500000,"fin":800000,"grande":100000,"petites":10,"points":[{"valeur":530000,"emoji":"⚽","nom":"Le ballon"}]}` |
| `posee` | Multiplication posée pas à pas (ordre de grandeur, retenues, 0 de décalage, addition) | `{"visuel":"posee","a":579,"b":64}` |
| `rangs` | Rappel : rang de chaque chiffre (classe des mille / des unités), on touche un chiffre | `{"visuel":"rangs","nombre":"658 741"}` |

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

- Dans la **fiche** et les **énoncés**, le mot devient un bouton : on le touche → il est prononcé et un petit
  **lecteur** apparaît en bas de l'écran (🔊 réécouter, 🐢 lentement, 🎤 répéter : le micro dit si c'est bien prononcé).
  Le lecteur ne bloque rien : on peut toucher le mot suivant directement ; il se range tout seul après 8 secondes.
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

## 🎙️ Fabriquer les sons des mots étrangers (pour Claude / Papa)

Une seule amorce par langue pour tout un lot de mots (≈ 60 % de crédits ElevenLabs en moins) :

1. Générer **un** enregistrement avec la voix « Sébastien Vaug » :
   `Listen and repeat in English... we are... you are... they are... she... he.`
   (en allemand : `Hör gut zu und sprich nach... der Vater... die Mutter...`). Éviter les points **à l'intérieur**
   d'un élément (mettre des virgules), les « ... » servent de séparateurs.
2. Le faire transcrire (ElevenLabs Scribe) : on obtient le début et la fin de chaque mot.
3. `python3 outils/decoupe_lot.py lot.mp3 transcription.json elements.json audio/` coupe un MP3 par élément,
   nommé comme l'appli l'attend, et affiche « attendu / entendu » pour vérifier chaque mot.
4. Mettre à jour `audio/index.json` (la liste des empreintes).

## 🎮 Quiz

- Une **piste de course** en haut : une case par question (verte = juste, orange = raté), l'avatar avance vers 🏁.
- Chaque type de question a sa couleur et son badge (🎯 QCM, ⚖️ Vrai ou faux, ✍️ À toi d'écrire, 🧩 Complète…).
- Réponses de QCM avec pastilles **A B C D** ; gerbe d'emojis quand c'est juste ; la carte tremble quand c'est raté.
- **Séries** : 🔥 3, 🚀 5, 🏆 10 bonnes réponses d'affilée ; l'avatar saute de joie ou fait la moue.

## ✍️ Écran de lancement

Le logo **SV** (charte « SV ») se dessine comme un coup de pinceau, en partant d'en haut à droite :
la virgule, l'épingle, puis le long trait. Le tracé est exactement celui du logo, dévoilé par des masques qui suivent
la ligne médiane de chaque trait (`#lancement` dans `index.html`, `.sv-pinceau` dans `style.css`). Toucher l'écran pour passer.

## Étoiles

⭐⭐⭐ ≥ 90 % · ⭐⭐ ≥ 70 % · ⭐ ≥ 40 %. Le meilleur score est gardé dans le téléphone (chaque téléphone a ses propres scores).

## 🤖 Appli Android (Play Store)

L'appli du Play Store est une **TWA** (Trusted Web Activity) : une fenêtre Chrome plein écran, sans barre d'adresse, qui ouvre `https://baiji.fr/svaug12345-revisions/`. Elle ne contient ni les leçons ni le code du jeu.

| Je veux…                                   | Ce qu'il faut faire                                     | Passage par Google ? |
|--------------------------------------------|---------------------------------------------------------|----------------------|
| ajouter / corriger une leçon, un son, le code | `git push` comme d'habitude                            | ❌ non, visible tout de suite |
| changer le texte ou les captures de la fiche Play | modifier `fastlane/metadata/android/fr-FR/` puis push | ✅ par le robot      |
| changer le nom, l'icône, les couleurs de l'appli | modifier `android/` puis push                       | ✅ par le robot      |

**Le robot** (`.github/workflows/play-store.yml`) construit le `.aab` signé, le dépose dans « Releases » et, si le secret `PLAY_SERVICE_ACCOUNT_JSON` existe, l'envoie sur le Play Store (piste `internal` par défaut, ou au choix depuis Actions > Play Store > Run workflow). Son compte rendu est écrit dans `statut.json` sur la branche `statut-play`.

**Secrets du dépôt** (Settings > Secrets and variables > Actions) :
- `ANDROID_KEYSTORE_BASE64` / `ANDROID_KEYSTORE_PASSWORD` : la clé d'envoi (alias `revisions`). **À garder précieusement hors du dépôt.**
- `PLAY_SERVICE_ACCOUNT_JSON` : la clé du compte de service Google autorisé à publier.

**Lien appli ↔ site** : `https://baiji.fr/.well-known/assetlinks.json` (dépôt `svaug12345.github.io`) doit contenir les empreintes SHA-256 de la clé d'envoi ET de la clé de signature Google Play (Play Console > Intégrité de l'appli). Sinon l'appli affiche une barre d'adresse.

- Identifiant : `io.github.svaug12345.revisions`
- Confidentialité : `https://baiji.fr/svaug12345-revisions/confidentialite.html`

**Piste et testeurs** : `fastlane/publication.json` dit où va chaque nouvelle version (`internal`, `alpha` = test fermé, `production`) et quels groupes Google peuvent tester. Le robot inscrit ces groupes lui-même (`outils/testeurs_play.py`).

## 🎧 Alex, le coach vocal (depuis la v1.7.0)

Sur une leçon qui a `"assistant": true`, une pastille discrète « 🎧 Alex » (à droite du titre) permet de parler avec un coach (agent ElevenLabs, voix « Alexandre – Calm, Warm »). Il répond aux questions, interroge l'enfant une question à la fois, donne des exemples concrets et des astuces pour retenir.

- **Un seul agent** pour toutes les leçons : son identifiant est dans `lecons.json` (rubrique `"assistant"`). À chaque appel, l'appli lui envoie en « variables dynamiques » le prénom, l'âge (`"age"` dans `enfants`), la matière, le titre, la fiche et le quiz. Ajouter une leçon avec `"assistant": true` suffit : rien à créer chez ElevenLabs.
- **Réglages de l'agent** (ElevenLabs) : mode zéro conservation (ni voix ni texte gardés), aucune restriction de site (la liste « sites autorisés » d'ElevenLabs faisait refuser tous les appels depuis l'appli), 30 appels/jour, 2 en même temps, 10 min par appel.
- Pour l'instant : les 9 leçons de Gaby.

## 📅 Date d'ajout d'une leçon

`"ajoutee": "2026-10-26"` (format AAAA-MM-JJ) après `"emoji"` : affichée discrètement (« ajoutée le 26 oct. ») dans la liste et sur la fiche. À modifier à la main si besoin ; sans ce champ, rien ne s'affiche.

## 📱 Tablette (depuis la v1.8.0)

Tout est dans `style.css`, section « TABLETTE ET ORDINATEUR » :
- **Tablette en portrait** (≥ 700 px de large et ≥ 600 px de haut) : textes plus grands (18 px de base sur écran tactile), profils en grandes cartes centrées, matières rangées sur 2 colonnes, réponses du quiz sur 2 colonnes.
- **Tablette en paysage** (≥ 1024 px) : les 5 profils sur une ligne, matières sur 3 colonnes, et la fiche de leçon à gauche avec une **colonne d'actions toujours visible** à droite (Alex, « C'est parti », archiver).
- Un téléphone tourné en paysage garde la mise en page téléphone (il est trop bas).

## 🍀 Mode « coup de pouce » (depuis la v1.10.0)

Pour un enfant qui a besoin d'enchaîner les réussites (aujourd'hui : Titouan). Dans `lecons.json`, sur l'enfant :
`"coupDePouce": true`, `"questionsParManche": 10`, et `"conseilsAlex": "…"` (consignes envoyées à Alex à chaque appel).
- **Manches courtes**, du plus facile au plus difficile (selon le `"niveau"` des questions, mélangées à l'intérieur d'un niveau).
- **2e essai** après une erreur : « Presque ! Essaie encore », avec l'`"indice"` de la question ; la bonne réponse n'est pas dévoilée. Réussi au 2e essai = réussi.
- Ses leçons commencent par un **🧰 Rappel** des bases et des questions d'échauffement (niveau 1).
