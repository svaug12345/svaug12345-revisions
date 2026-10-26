# 📚 Mes Révisions

Appli Android (PWA) pour réviser les leçons des enfants en s'amusant.
Hébergée sur GitHub Pages, comme Lecteur QR.

## Les fichiers

| Fichier | Rôle | On y touche ? |
|---|---|---|
| `lecons.json` | **Tout le contenu** : enfants, leçons, questions | ✅ oui, c'est le seul |
| `app.js` | Le moteur (écrans, jeux, scores) | non |
| `style.css` | Couleurs et mise en page | rarement |
| `version.js` | Numéro de version du code | à chaque modif du code |
| `sw.js` | Mode hors-ligne | non |
| `index.html`, `manifest.json`, `icons/` | Page et installation Android | non |

## Mettre en ligne (une seule fois)

1. Créer un dépôt GitHub `svaug12345/revisions` (public).
2. Y déposer tous les fichiers (en gardant le dossier `icons/`).
3. *Settings → Pages → Branch : main / (root) → Save*.
4. Ouvrir `https://svaug12345.github.io/revisions/` dans Chrome sur le téléphone
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

## 🔊 La voix de Papa (depuis la v1.2.0)

Le bouton 🔊 lit la leçon ou la question avec la voix de Sébastien (clonée sur ElevenLabs).

- Chaque phrase lue est un MP3 dans le dossier `audio/`, nommé d'après une **empreinte** du texte
  (ex. `audio/8469ba9e.mp3`). `audio/index.json` liste toutes les empreintes disponibles.
- Si un texte n'a pas de MP3 (nouvelle leçon, phrase modifiée…), l'appli utilise
  automatiquement **la voix du téléphone** : rien ne casse.
- ⚠️ Modifier ne serait-ce qu'une virgule dans une phrase change son empreinte :
  elle repasse en voix du téléphone tant qu'on n'a pas régénéré son MP3.
- Pour les nouvelles leçons : envoyer les photos à Claude, il crée la leçon **et** ses MP3.
- Les MP3 sont gardés dans le téléphone après la 1re écoute (marche hors-ligne ensuite).

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
- Les voix sont natives : **Alice** (anglais britannique) et **Lola** (allemand). Les MP3 sont nommés d'après
  l'empreinte de `langue|texte prononcé` ; sans MP3, c'est la voix du téléphone dans la bonne langue.
- Le micro (🎤) utilise la reconnaissance vocale de Chrome : il faut internet et autoriser le micro la 1re fois.

## Étoiles

⭐⭐⭐ ≥ 90 % · ⭐⭐ ≥ 70 % · ⭐ ≥ 40 %. Le meilleur score est gardé dans le téléphone (chaque téléphone a ses propres scores).
