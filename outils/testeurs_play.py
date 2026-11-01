# -*- coding: utf-8 -*-
"""
INSCRIRE LES TESTEURS D'UNE PISTE DU PLAY STORE (sans passer par la Play Console)
==================================================================================

Lancé par le robot GitHub (.github/workflows/play-store.yml), avec la clé du compte
de service « robot-github ».

Comment ça marche ? L'API « Google Play Developer » fonctionne par « modifications »
(edits), comme un brouillon :
  1. on ouvre un brouillon pour l'appli          -> edits.insert
  2. on y change la liste de testeurs d'une piste -> edits.testers.update
  3. on valide le brouillon                       -> edits.commit
Rien n'est modifié sur le Play Store tant que l'étape 3 n'a pas réussi.

Utilisation :
  python3 testeurs_play.py cle_compte_service.json fastlane/publication.json
"""
import json
import sys

from google.oauth2 import service_account
from googleapiclient.discovery import build

PAQUET = 'io.github.svaug12345.revisions'


def main(fichier_cle, fichier_publication):
    reglages = json.load(open(fichier_publication, encoding='utf-8'))
    testeurs = reglages.get('testeurs', {})
    if not testeurs:
        print('Aucun testeur à inscrire.')
        return

    # Connexion avec la clé du compte de service (droit « androidpublisher » uniquement)
    identite = service_account.Credentials.from_service_account_file(
        fichier_cle, scopes=['https://www.googleapis.com/auth/androidpublisher'])
    play = build('androidpublisher', 'v3', credentials=identite, cache_discovery=False)

    brouillon = play.edits().insert(packageName=PAQUET, body={}).execute()['id']
    for piste, liste in testeurs.items():
        # Les adresses @googlegroups.com sont des groupes ; on accepte aussi les groupes Google Workspace
        groupes = [a for a in liste if '@googlegroups.com' in a or a.startswith('groupe:')]
        groupes = [g.replace('groupe:', '') for g in groupes]
        play.edits().testers().update(
            packageName=PAQUET, editId=brouillon, track=piste,
            body={'googleGroups': groupes}).execute()
        print(f'Piste « {piste} » : groupes de testeurs = {", ".join(groupes)}')
        autres = [a for a in liste if a not in groupes and not a.startswith('groupe:')]
        if autres:
            # L'API n'accepte que des groupes : les simples adresses Gmail se gèrent par liste
            # d'adresses dans la console (ou en les mettant dans un groupe Google).
            print('  ⚠️ adresses ignorées (pas des groupes) :', ', '.join(autres))
    play.edits().commit(packageName=PAQUET, editId=brouillon).execute()
    print('Testeurs enregistrés sur le Play Store ✅')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
