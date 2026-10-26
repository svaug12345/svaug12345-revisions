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
var VERSION = '1.1.0'; // 1.1.0 : option "strict" (accents exigés) + "1 000" = "1000"
