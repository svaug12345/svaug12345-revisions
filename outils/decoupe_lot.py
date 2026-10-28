# -*- coding: utf-8 -*-
"""
DÉCOUPE D'UN ENREGISTREMENT GROUPÉ (« lot ») EN UN MP3 PAR MOT
================================================================

Pourquoi ?
  Pour que ma voix clonée prononce un petit mot étranger dans la bonne langue
  (« he » et pas « hé »), on le fait précéder d'une phrase d'amorce dans la langue :
  « Listen and repeat in English… » / « Hör gut zu und sprich nach… ».
  Plutôt que de payer l'amorce pour CHAQUE mot, on enregistre tout d'un coup :

      Listen and repeat in English... we are... you are... they are... she... he.

  puis ce script coupe l'enregistrement en un fichier par mot (≈ 60 % de crédits en moins).

Comment ça coupe ?
  On fait transcrire le lot par ElevenLabs (Scribe), qui donne le début et la fin de
  chaque mot entendu. On parcourt ces mots dans l'ordre : les mots de l'amorce d'abord,
  puis ceux du 1er élément, du 2e… Chaque élément est coupé de son premier mot
  (- 80 ms) à son dernier mot (+ 150 ms).
  Les MP3 sont nommés comme dans l'appli : empreinte FNV-1a de « langue|texte prononcé ».

Utilisation :
  python3 decoupe_lot.py lot.mp3 transcription.json elements.json dossier_sortie/
    - transcription.json : le résultat de creative_get_flow_run_status de la transcription
    - elements.json      : {"langue": "en", "amorce": "Listen and repeat in English",
                            "elements": ["we are", "you are", "they are", "she", "he"]}
"""
import json, re, subprocess, sys, os


def empreinte(texte):
    """Même calcul que la fonction empreinte() de app.js (FNV-1a 32 bits sur l'UTF-8)."""
    h = 0x811C9DC5
    for octet in texte.encode('utf-8'):
        h ^= octet
        h = (h * 0x01000193) & 0xFFFFFFFF
    return f'{h:08x}'


def mots(texte):
    """« He doesn't have a cat. » -> ['he', "doesn't", 'have', 'a', 'cat'] (pour compter les mots)."""
    return [m for m in re.split(r"[\s.,;:!?…]+", texte.lower()) if m]


def main(lot, fichier_transcription, fichier_elements, sortie):
    os.makedirs(sortie, exist_ok=True)
    statut = json.load(open(fichier_transcription, encoding='utf-8'))
    entendus = [w for w in statut['transcripts'][0]['words'] if w.get('type', 'word') == 'word']
    config = json.load(open(fichier_elements, encoding='utf-8'))
    langue, elements = config['langue'], config['elements']

    # On saute les mots de l'amorce, puis chaque élément « consomme » autant de mots qu'il en contient
    position = len(mots(config['amorce']))
    resultats = []
    for i, texte in enumerate(elements):
        n = len(mots(texte))
        bloc = entendus[position:position + n]
        if len(bloc) < n:
            sys.exit(f'Transcription trop courte pour « {texte} » : vérifier le lot à la main.')
        debut = max(0, bloc[0]['start'] - 0.08)
        fin = bloc[-1]['end'] + 0.15
        # sans déborder sur le mot suivant
        if position + n < len(entendus):
            fin = min(fin, entendus[position + n]['start'] - 0.05)
        position += n
        nom = empreinte(f'{langue}|{texte}')
        cible = os.path.join(sortie, nom + '.mp3')
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-ss', f'{debut:.3f}', '-to', f'{fin:.3f}', '-i', lot,
                        '-af', 'afade=t=in:d=0.02,apad=pad_dur=0.12', '-c:a', 'libmp3lame', '-b:a', '128k', cible], check=True)
        entendu = ' '.join(w['text'] for w in bloc)
        resultats.append((nom, texte, entendu, round(fin - debut, 2)))
    for nom, texte, entendu, duree in resultats:
        # La colonne « entendu » permet de vérifier d'un coup d'œil que chaque mot est le bon
        print(f'{nom}.mp3  {duree:>5}s  attendu « {texte} »  entendu « {entendu} »')


if __name__ == '__main__':
    main(*sys.argv[1:5])
