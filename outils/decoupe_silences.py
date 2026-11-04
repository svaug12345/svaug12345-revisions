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
  Comme on connaît le nombre N de phrases, on coupe aux N-1 silences les plus longs (ffmpeg silencedetect),
  puis on vérifie que la découpe est sûre (voir decouper()). Sinon le script s'arrête (il ne devine pas) :
  on essaie l'autre prise, ou un autre seuil de silence.

Les MP3 sont nommés comme l'appli les cherche : empreinte FNV-1a de « fr|texte » (voir app.js).

Utilisation :
  python3 decoupe_silences.py lot.mp3 lot.json audio/ [seuil_de_silence_en_dB]
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


def silences(fichier, duree_min, seuil_db=-35):
    """Liste des silences (début, fin) d'au moins duree_min secondes, sous seuil_db."""
    sortie = subprocess.run(['ffmpeg', '-hide_banner', '-i', fichier, '-af', f'silencedetect=n={seuil_db}dB:d={duree_min}',
                             '-f', 'null', '-'], capture_output=True, text=True).stderr
    debuts = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', sortie)]
    fins = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', sortie)]
    return list(zip(debuts, fins))


def correlation(x, y):
    """Coefficient de corrélation de Pearson (1 = parfaitement liés)."""
    n = len(x); mx, my = sum(x) / n, sum(y) / n
    cov = sum((a - mx) * (b - my) for a, b in zip(x, y))
    vx = sum((a - mx) ** 2 for a in x) ** .5; vy = sum((b - my) ** 2 for b in y) ** .5
    return cov / (vx * vy) if vx and vy else 0


def duree(fichier):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', fichier],
                                capture_output=True, text=True).stdout)


def decouper(lot, phrases, sortie, seuil_db=-35):
    """Coupe lot (MP3) en un MP3 par phrase dans sortie/. Lève ValueError si la découpe n'est pas sûre.

    Méthode : on connaît le NOMBRE de phrases (N). Entre deux phrases, la voix marque un silence plus long
    qu'à l'intérieur d'une phrase : on garde donc les N-1 silences les plus longs comme coupures.
    Deux vérifications, puisqu'on ne peut pas écouter :
      - la plus courte des coupures doit être nettement plus longue que le plus long silence « intérieur » ;
      - la durée de chaque morceau doit suivre la longueur de son texte (corrélation ≥ 0,8).
    """
    os.makedirs(sortie, exist_ok=True)
    total = duree(lot)
    n = len(phrases)
    # silences intérieurs (début et fin du fichier exclus)
    s = [(a, b) for a, b in silences(lot, 0.12, seuil_db) if a > 0.05 and b < total - 0.05]
    if len(s) < n - 1:
        raise ValueError(f'{len(s)} silences seulement pour {n} phrases (seuil {seuil_db} dB)')
    tries = sorted(s, key=lambda x: x[1] - x[0], reverse=True)
    coupures = sorted(tries[:n - 1])
    plus_court = min(b - a for a, b in coupures)
    suivant = (tries[n - 1][1] - tries[n - 1][0]) if len(tries) >= n else 0
    if suivant and plus_court / suivant < 1.15:
        raise ValueError(f'coupures pas assez nettes (plus courte {plus_court:.2f} s, silence intérieur {suivant:.2f} s)')
    bornes, t = [], 0.0
    for a, b in coupures:
        bornes.append((t, a)); t = b
    bornes.append((t, total))
    r = correlation([len(p['texte']) for p in phrases], [b - a for a, b in bornes])
    if r < 0.8:
        raise ValueError(f'les durées ne suivent pas les textes (corrélation {r:.2f}) : décalage probable')
    print(f'coupures : plus courte {plus_court:.2f} s / plus long silence intérieur {suivant:.2f} s ; corrélation {r:.2f}')
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
                 float(sys.argv[4]) if len(sys.argv) > 4 else -35)
    except ValueError as e:
        sys.exit('❌ ' + str(e) + ' : essayer l\'autre prise ou un autre seuil.')
