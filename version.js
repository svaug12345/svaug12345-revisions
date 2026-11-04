// =============================================================
//  NUMÉRO DE VERSION DE L'APPLI
//  -------------------------------------------------------------
//  Un seul endroit à modifier : ce fichier est lu à la fois par
//  l'appli (affiché en bas de l'écran) et par le service worker
//  (sw.js) qui s'en sert pour nommer son cache hors-ligne.
//  À chaque mise à jour du CODE, on augmente ce numéro :
//    1.0.0 -> 1.0.1 (petite correction)
//    1.0.0 -> 1.1.0 (nouvelle fonction)
//  ("var" et pas "const" : la variable doit être globale pour
//   être visible aussi dans le service worker.)
// =============================================================
var VERSION = '1.15.0'; // 1.13.2 : leçons de Titouan sur les homophones (a/à, et/est, son/sont) ; 1.13.1 : leçons de géographie de Titouan (relief et climats de la France) ; 1.13.0 : bouton « 📸 Envoyer une nouvelle leçon » ; 1.12.3 : correction — les réponses justes étaient comptées fausses avec le 🔈 ; 1.12.2 : procédure de suppression des données ; 1.12.1 : conversations avec Alex conservées (confidentialité mise à jour) ; 1.12.0 : leçons d'Ava (CP), lecture à voix haute, confort de lecture, orthographe souple, écriture attachée ; 1.11.0 : leçons en petits modules (parcours) + mini-jeu Tirs au but ; 1.10.0 : mode coup de pouce (2e essai + indice, manches courtes du plus facile au plus dur), rappels des bases, Alex personnalisé ; 1.9.0 : leçons de Titouan + visuels arrondi, droite graduée, multiplication posée ; 1.8.1 : Alex en pastille discrète + appel réparé ; 1.8.0 : mise en page tablette (portrait et paysage) ; 1.7.0 : Alex le coach vocal (leçons de Gaby), date d'ajout des leçons, profils Titouan et Ava ; 1.6.1 : appli Android (Play Store) + page de confidentialité ; 1.6.0 : logo SV qui se dessine, lecteur de mots sans clic, quiz plus vivant ; 1.5.0 : fiches illustrées (schémas, animations), audio réservé aux langues ; 1.4.0 : avatars, archives, deuxième chance, version PC, mots avec la voix de Papa ; 1.3.0 : mots étrangers cliquables (écouter / répéter) ; 1.2.0 : voix de Papa (MP3 ElevenLabs) ; 1.1.0 : option "strict"
