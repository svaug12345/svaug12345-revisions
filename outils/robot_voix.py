# -*- coding: utf-8 -*-
"""
ROBOT « VOIX » — appelé par .github/workflows/voix.yml
=======================================================
Pourquoi un robot ? Claude génère les lots de phrases avec ElevenLabs, mais son espace de travail
ne peut pas télécharger les fichiers audio d'ElevenLabs. GitHub, lui, le peut : Claude dépose
outils/voix-a-decouper.json (liens des enregistrements + phrases attendues), le robot télécharge,
découpe (outils/decoupe_silences.py) et range les MP3 dans audio/.

Format de outils/voix-a-decouper.json :
  {"lots": [ {"nom": "lot0",
              "prises": ["https://…mp3", "https://…mp3"],      # 2 prises du même lot : on essaie l'une puis l'autre
              "phrases": [{"texte": "…", "h": "1a2b3c4d"}, …]} ]}

Pour chaque lot : on essaie chaque prise avec plusieurs seuils de silence ; dès qu'une découpe donne
exactement le bon nombre de morceaux, c'est gagné. Les lots réussis sont retirés du fichier ; s'il ne reste
rien, le fichier est supprimé. Le résultat (réussites, échecs, journal) va dans statut.json.
"""
import json, os, sys, tempfile, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
from decoupe_silences import decouper

DEMANDE = 'outils/voix-a-decouper.json'
SEUILS = [0.75, 0.6, 0.9, 0.5, 1.1]   # durée minimale (s) d'un silence « entre deux phrases »


def main():
    demande = json.load(open(DEMANDE, encoding='utf-8'))
    index = set(json.load(open('audio/index.json', encoding='utf-8')))
    restants, compte_rendu = [], []
    for lot in demande['lots']:
        reussi = False
        for i, url in enumerate(lot['prises']):
            fichier = os.path.join(tempfile.gettempdir(), f"{lot['nom']}-{i}.mp3")
            try:
                urllib.request.urlretrieve(url, fichier)
            except Exception as e:
                compte_rendu.append(f"{lot['nom']} prise {i + 1} : téléchargement impossible ({e})")
                continue
            for seuil in SEUILS:
                try:
                    noms = decouper(fichier, lot['phrases'], 'audio', seuil)
                    index.update(noms)
                    compte_rendu.append(f"{lot['nom']} : ✅ {len(noms)} MP3 (prise {i + 1}, seuil {seuil} s)")
                    reussi = True
                    break
                except ValueError as e:
                    compte_rendu.append(f"{lot['nom']} prise {i + 1} : {e}")
            if reussi:
                break
        if not reussi:
            restants.append(lot)
    json.dump(sorted(index), open('audio/index.json', 'w', encoding='utf-8'))
    if restants:
        json.dump({'lots': restants}, open(DEMANDE, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    else:
        os.remove(DEMANDE)
    json.dump({'reussis': len(demande['lots']) - len(restants), 'echecs': [l['nom'] for l in restants],
               'journal': compte_rendu}, open(os.environ.get('RUNNER_TEMP', '.') + '/voix.json', 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    print('\n'.join(compte_rendu))


if __name__ == '__main__':
    main()
