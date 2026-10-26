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

## Étoiles

⭐⭐⭐ ≥ 90 % · ⭐⭐ ≥ 70 % · ⭐ ≥ 40 %. Le meilleur score est gardé dans le téléphone (chaque téléphone a ses propres scores).
