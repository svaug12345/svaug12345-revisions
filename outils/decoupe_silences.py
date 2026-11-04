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
  Comme on connaît le nombre N de phrases ET la longueur de chacune, on choisit les N-1 coupures qui
  donnent à la fois de longues pauses et des durées cohérentes avec les textes (voir choisir_coupures()),
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


def choisir_coupures(cands, total, longueurs, n):
    """Choisit n-1 coupures parmi les silences candidats (dans l'ordre du temps), par programmation dynamique.

    Chaque coupure rapporte un bonus selon la longueur de son silence (une vraie pause est longue) ;
    chaque morceau coûte selon l'écart entre sa durée et la durée « attendue » d'après la longueur
    de son texte (durée ≈ a + b × nombre de lettres, a et b estimés sur l'enregistrement lui-même).
    On garde la combinaison au meilleur score : les pauses longues ET des durées cohérentes.
    """
    m = len(cands)
    parole = total - sum(f - d for d, f in cands)  # estimation grossière du temps de parole
    b = parole / max(1, sum(longueurs) + 4 * n) ; a = 4 * b   # ~ 4 « lettres » de marge par phrase
    for _ in range(2):  # 2 passes : on réestime a et b sur la 1re découpe
        attendu = [a + b * L for L in longueurs]
        INF = float('inf')
        # cout[i][j] : meilleur score pour les phrases 0..i, la phrase i finissant au silence j
        cout = [[INF] * m for _ in range(n - 1)]
        prec = [[-1] * m for _ in range(n - 1)]
        def morceau(i, debut, fin):
            d = fin - debut
            if d <= 0.05: return INF
            return ((d - attendu[i]) / (0.3 + 0.25 * attendu[i])) ** 2
        def bonus(j):
            return -3.0 * min(cands[j][1] - cands[j][0], 1.6)
        for j in range(m):
            cout[0][j] = morceau(0, 0.0, cands[j][0]) + bonus(j)
        for i in range(1, n - 1):
            for j in range(i, m):
                meilleur, k_mieux = INF, -1
                for k in range(i - 1, j):
                    c = cout[i - 1][k]
                    if c == INF: continue
                    c += morceau(i, cands[k][1], cands[j][0])
                    if c < meilleur: meilleur, k_mieux = c, k
                if k_mieux >= 0:
                    cout[i][j], prec[i][j] = meilleur + bonus(j), k_mieux
        fin_ideal = min(range(n - 2, m), key=lambda j: cout[n - 2][j] + morceau(n - 1, cands[j][1], total)
                        if cout[n - 2][j] < INF else INF)
        choix = [fin_ideal]
        for i in range(n - 2, 0, -1):
            choix.append(prec[i][choix[-1]])
        coupures = [cands[j] for j in reversed(choix)]
        # réestimation de a et b (moindres carrés) sur cette découpe
        bornes, t = [], 0.0
        for d_, f_ in coupures: bornes.append((t, d_)); t = f_
        bornes.append((t, total))
        durees = [y - x for x, y in bornes]
        mx = sum(longueurs) / n; my = sum(durees) / n
        vx = sum((L - mx) ** 2 for L in longueurs) or 1
        b = max(0.02, sum((L - mx) * (d - my) for L, d in zip(longueurs, durees)) / vx); a = max(0.1, my - b * mx)
    return coupures


def decouper(lot, phrases, sortie, seuil_db=-35):
    """Coupe lot (MP3) en un MP3 par phrase dans sortie/. Lève ValueError si la découpe n'est pas sûre.

    Méthode : on connaît le NOMBRE de phrases (N). On repère tous les silences (candidats), puis on choisit
    les N-1 coupures qui donnent à la fois de longues pauses et des morceaux dont la durée colle à la longueur
    de leur texte (voir choisir_coupures). Vérification finale, puisqu'on ne peut pas écouter : la durée de
    chaque morceau doit suivre la longueur de son texte (corrélation ≥ 0,85).
    """
    os.makedirs(sortie, exist_ok=True)
    total = duree(lot)
    n = len(phrases)
    cands = [(a, b) for a, b in silences(lot, 0.2, seuil_db) if a > 0.05 and b < total - 0.05]
    if len(cands) < n - 1:
        raise ValueError(f'{len(cands)} silences seulement pour {n} phrases (seuil {seuil_db} dB)')
    # "dit" (facultatif) = ce que la voix a réellement lu, quand on a dû l'écrire autrement (« dix » pour « 10 »)
    longueurs = [len(p.get('dit', p['texte'])) for p in phrases]
    coupures = choisir_coupures(cands, total, longueurs, n)
    bornes, t = [], 0.0
    for a, b in coupures:
        bornes.append((t, a)); t = b
    bornes.append((t, total))
    r = correlation(longueurs, [b - a for a, b in bornes])
    plus_court = min(b - a for a, b in coupures)
    if r < 0.85:
        raise ValueError(f'les durées ne suivent pas les textes (corrélation {r:.2f}) : décalage probable')
    print(f'coupures : plus courte {plus_court:.2f} s ; corrélation durées/textes {r:.2f}')
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
