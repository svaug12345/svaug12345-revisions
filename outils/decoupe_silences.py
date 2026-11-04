# -*- coding: utf-8 -*-
"""
DÉCOUPE D'UN LOT DE PHRASES FRANÇAISES EN UN MP3 PAR PHRASE (voix ElevenLabs)
==============================================================================

Pourquoi ?
  Les phrases lues à voix haute (questions du CP, dictées, activités des sons et des nombres)
  sont enregistrées À L'AVANCE avec ElevenLabs : bien plus agréable que la voix du téléphone.
  Pour ne pas lancer 240 générations, on les enregistre par lots :

      [warmly]
      Dans quel mot entends-tu a ?
      [pause]
      chat.
      [pause]
      hibou.

  La balise [pause] fait dire à la voix un vrai silence (≈ 1 à 1,5 s) entre deux phrases,
  alors qu'à l'intérieur d'une phrase les silences sont courts (virgules, points ≈ 0,3 s).
  On coupe donc l'enregistrement aux silences LONGS (ffmpeg silencedetect).

  Si on ne trouve pas exactement autant de morceaux que de phrases, le script s'arrête
  (il ne devine pas) : on essaie l'autre prise, ou un seuil un peu différent.

Les MP3 sont nommés comme l'appli les cherche : empreinte FNV-1a de « fr|texte » (voir app.js).

Utilisation :
  python3 decoupe_silences.py lot.mp3 lot.json audio/ [silence_min_en_s]
    - lot.json : liste de {"texte": "...", "h": "empreinte"} dans l'ordre du lot
                 (le "texte" est celui que l'appli fait lire, après pourLaVoix())
"""
import json, re, subprocess, sys, os


def empreinte(texte):
    """Même calcul que la fonction empreinte() de app.js (FNV-1a 32 bits sur l'UTF-8)."""
    h = 0x811C9DC5
    for octet in texte.encode('utf-8'):
        h ^= octet
        h = (h * 0x01000193) & 0xFFFFFFFF
    return f'{h:08x}'


def silences(fichier, duree_min):
    """Liste des silences (début, fin) d'au moins duree_min secondes, sous -40 dB."""
    sortie = subprocess.run(['ffmpeg', '-hide_banner', '-i', fichier, '-af', f'silencedetect=n=-40dB:d={duree_min}',
                             '-f', 'null', '-'], capture_output=True, text=True).stderr
    debuts = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', sortie)]
    fins = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', sortie)]
    return list(zip(debuts, fins))


def duree(fichier):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', fichier],
                                capture_output=True, text=True).stdout)


def decouper(lot, phrases, sortie, duree_min=0.75):
    """Coupe lot (MP3) en un MP3 par phrase dans sortie/. Lève ValueError si le compte n'y est pas."""
    os.makedirs(sortie, exist_ok=True)
    total = duree(lot)
    # Les zones de parole = ce qui se trouve ENTRE les grands silences
    s = [x for x in silences(lot, duree_min) if x[1] - x[0] >= duree_min]
    bornes, t = [], 0.0
    for debut, fin in s:
        if debut - t > 0.08:                       # un vrai bout de parole (pas un clic)
            bornes.append((t, debut))
        t = fin
    if total - t > 0.08:
        bornes.append((t, total))
    # Le tout début peut contenir un petit souffle avant la 1re phrase : on l'ignore s'il est minuscule
    if len(bornes) == len(phrases) + 1 and bornes[0][1] - bornes[0][0] < 0.25:
        bornes = bornes[1:]
    if len(bornes) != len(phrases):
        raise ValueError(f'{len(bornes)} morceaux trouvés pour {len(phrases)} phrases (seuil {duree_min} s)')
    for (a, b), p in zip(bornes, phrases):
        h = empreinte('fr|' + p['texte'])
        assert h == p.get('h', h), 'empreinte différente de celle de l\'appli'
        # 60 ms de marge avant, 120 ms après (déjà du silence : pas de « clic » à la fin) ;
        # silenceremove enlève un éventuel silence au début du morceau, puis petit fondu d'entrée
        a, b = max(0, a - 0.06), min(total, b + 0.12)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', f'{a:.3f}', '-to', f'{b:.3f}', '-i', lot,
                        '-af', 'silenceremove=start_periods=1:start_silence=0.04:start_threshold=-45dB,afade=t=in:d=0.02',
                        '-ac', '1', '-ar', '44100', '-b:a', '64k', os.path.join(sortie, h + '.mp3')], check=True)
        print(f'{b - a:5.2f} s  {h}  {p["texte"][:70]}')
    print(f'✅ {len(phrases)} MP3 écrits dans {sortie}')
    return [empreinte('fr|' + p['texte']) for p in phrases]


if __name__ == '__main__':
    try:
        decouper(sys.argv[1], json.load(open(sys.argv[2], encoding='utf-8')), sys.argv[3],
                 float(sys.argv[4]) if len(sys.argv) > 4 else 0.75)
    except ValueError as e:
        sys.exit('❌ ' + str(e) + ' : essayer l\'autre prise ou un autre seuil.')
