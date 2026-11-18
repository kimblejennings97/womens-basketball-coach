"""Build js/data/real.js (real NCAA D1 + WNBA teams, rosters, coaches, derived 1-20 ratings) from the cached pages.
Run tools/scrape.py first. Ratings method (docs/data.md):
  level L = how good the player is overall, from per-40 production (Game Score), minutes per game and team strength (SRS /
  net rating), shrunk toward a prior (team strength + class) when minutes are few.
  Each skill = L + its stat profile (per-40 rates and percentages as z-scores, centred per player) * 2.6.
  Free throw rating is absolute: FT% = 0.47 + 0.024 * rating (the engine's own formula, so FT% carries over exactly).
Overrides: tools/overrides.json {player_id: {rating: value, ...}} is applied last."""
import os, re, sys, json, math, hashlib, collections
sys.path.insert(0, os.path.dirname(__file__))
from fetch import get, uncomment

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR, BR = 'https://www.sports-reference.com', 'https://www.basketball-reference.com'
RAT = ['fin', 'post', 'mid', 'three', 'ft', 'hdl', 'pas', 'vis', 'perD', 'postD', 'stl', 'blk', 'oreb', 'dreb', 'spd', 'str', 'vert', 'sta', 'iq', 'cons', 'clu']
ARCH = {
  'PG': dict(fin=0, post=-4, mid=1, three=1, ft=1, hdl=3.5, pas=3.5, vis=3, perD=1, postD=-3, stl=1.5, blk=-4, oreb=-3.5, dreb=-2, spd=2.5, str=-2, vert=0, sta=1, iq=1, cons=0, clu=0),
  'SG': dict(fin=0.5, post=-3, mid=2, three=2.5, ft=1.5, hdl=1.5, pas=0.5, vis=0, perD=1, postD=-2, stl=1, blk=-3, oreb=-2.5, dreb=-1.5, spd=1.5, str=-1, vert=0.5, sta=1, iq=0, cons=0, clu=0),
  'SF': dict(fin=1, post=-0.5, mid=0.5, three=0.5, ft=0, hdl=0, pas=0, vis=0, perD=1, postD=0, stl=0.5, blk=-0.5, oreb=0, dreb=0.5, spd=0.5, str=0.5, vert=1, sta=0.5, iq=0, cons=0, clu=0),
  'PF': dict(fin=1.5, post=2, mid=0, three=-1.5, ft=-0.5, hdl=-2, pas=-1, vis=-1, perD=-0.5, postD=2, stl=-0.5, blk=1.5, oreb=2.5, dreb=2.5, spd=-1, str=2, vert=0.5, sta=0, iq=0, cons=0, clu=0),
  'C': dict(fin=2, post=3, mid=-1.5, three=-4.5, ft=-1.5, hdl=-4, pas=-1.5, vis=-1.5, perD=-2.5, postD=3.5, stl=-1.5, blk=3.5, oreb=3.5, dreb=3.5, spd=-2.5, str=3, vert=0, sta=-1, iq=0, cons=0, clu=0),
}
CLS_BUMP = {'FR': 0, 'SO': 0.6, 'JR': 1.1, 'SR': 1.4, 'GR': 1.6}
POT_BUMP = {'FR': 4.5, 'SO': 3.2, 'JR': 2.0, 'SR': 1.0, 'GR': 0.5}
CLS_AGE = {'FR': 18, 'SO': 19, 'JR': 20, 'SR': 21, 'GR': 22}
STATS = ['g', 'gs', 'mp', 'fg', 'fga', 'fg3', 'fg3a', 'ft', 'fta', 'orb', 'drb', 'ast', 'stl', 'blk', 'tov', 'pf', 'pts']


def hrand(*key):
    """Deterministic N(0,1)-ish from a key (so rebuilding gives the same ratings)."""
    h = hashlib.md5('|'.join(map(str, key)).encode()).digest()
    u = [b / 255 for b in h[:4]]
    return (sum(u) - 2) * 1.7


def cells(row):
    out = {}
    for k, csk, v in re.findall(r'data-stat="([^"]+)"(?:[^>]*?csk="([^"]*)")?[^>]*>((?:<[^>]+>)*[^<]*)', row):
        out[k] = re.sub(r'<[^>]+>', '', v).strip()
        if csk:
            out[k + '_csk'] = csk
    m = re.search(r'data-append-csv="([^"]+)"', row)
    if m:
        out['_id'] = m.group(1)
    m = re.search(r"href=['\"]/wnba/players/./([^.]+)\.html", row)
    if m:
        out['_id'] = m.group(1)
    return out


def table(h, tid):
    i = h.find(f'id="{tid}"')
    if i < 0:
        return []
    j = h.find('</table>', i)
    rows = [cells(r) for r in re.findall(r'<tr[^>]*>(.*?)</tr>', h[i:j], re.S)]
    return [r for r in rows if r.get('_id')]


ALIAS = {'g': 'games', 'gs': 'games_started'}


def statrow(r):
    return {k: num(r.get(k) if r.get(k) not in (None, '') else r.get(ALIAS.get(k, k))) for k in STATS}


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return 0.0


def info(h):
    m = re.search(r'<div id="info".*?(?=<div id="bottom_nav"|<div class="filter"|$)', h, re.S)
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', m.group(0) if m else ''))


def pos5(p, ht, s):
    p = (p or 'G').upper()
    mp = max(s.get('mp', 0), 1)
    ast40 = s.get('ast', 0) / mp * 40 if mp > 30 else None
    tpa40 = s.get('fg3a', 0) / mp * 40 if mp > 30 else None
    if p.startswith('G'):
        if ht >= 73:
            return 'SF'
        if ast40 is not None:
            return 'PG' if ast40 >= 4.2 or (ht <= 67 and ast40 >= 3) else 'SG'
        return 'PG' if ht <= 67 else 'SG'
    if p.startswith('F'):
        if 'C' in p[1:] or ht >= 76:
            return 'PF' if ht < 77 else 'C'
        if ht <= 71:
            return 'SF'
        if ht >= 75:
            return 'PF'
        return 'SF' if (tpa40 or 0) >= 3 or (ast40 or 0) >= 3 else 'PF'
    return 'C'


def abbr_for(short, used):
    words = [w for w in re.split(r'[\s\-&().]+', short) if w and w.lower() not in ('of', 'the', 'at')]
    cands = []
    if len(words) > 1:
        cands.append(''.join(w[0] for w in words).upper())
        cands.append((words[0][:3] + words[-1][0]).upper())
    cands.append(re.sub(r'[^A-Za-z]', '', short)[:4].upper())
    cands.append(re.sub(r'[^A-Za-z]', '', short)[:5].upper())
    for c in cands:
        if c not in used and len(c) >= 2:
            used.add(c)
            return c
    i = 2
    while cands[0] + str(i) in used:
        i += 1
    used.add(cands[0] + str(i))
    return cands[0] + str(i)


# ---------------------------------------------------------------- NCAA
def ncaa():
    h = uncomment(get(f'{SR}/cbb/seasons/women/2027-school-stats.html'))
    schools = re.findall(r"href='/cbb/schools/([^/]+)/women/2027.html'>([^<]+)</a>", h)
    srs26 = {}
    h26 = uncomment(get(f'{SR}/cbb/seasons/women/2026-school-stats.html'))
    for r in re.findall(r'<tr[^>]*>(.*?)</tr>', h26, re.S):
        m = re.search(r"/cbb/schools/([^/]+)/women/2026.html", r)
        c = cells(r)
        if m and c.get('srs'):
            srs26[m.group(1)] = num(c['srs'])
    teams, stats, roster = [], collections.defaultdict(list), {}
    prev_cls = {}
    used = set()
    for slug, short in schools:
        p27 = get(f'{SR}/cbb/schools/{slug}/women/2027.html')
        if not p27:
            continue
        h27 = uncomment(p27)
        inf = info(h27)
        m = re.search(r"/cbb/conferences/([^/]+)/women/2027.html['\"]>([^<]+)<", h27)
        conf_slug, conf = (m.group(1), m.group(2).replace(' WBB', '').strip()) if m else ('ind', 'Independent')
        m = re.search(r'Coach:\s*([^\(]+?)\s+(?:\(|PS/G|Rank)', inf)
        coach = m.group(1).strip() if m else None
        m = re.search(r'<h1>\s*<span>[^<]*</span>\s*<span>([^<]+)</span>', h27)
        full = (m.group(1) if m else short).replace("Women's", '').strip()
        logo = re.search(r'class="teamlogo"\s+src="([^"]+)"', h27)
        t = dict(id=slug, league='ncaa', short=short, name=full, conf=conf, confId=conf_slug, coach=coach, srs=srs26.get(slug, -12.0),
                 logoUrl=logo.group(1) if logo else None, abbr=abbr_for(short, used), roster=[])
        for r in table(h27, 'roster'):
            pid = r['_id']
            roster[pid] = dict(id=pid, name=r.get('player', ''), num=r.get('number', ''), cls=(r.get('class') or 'FR').upper()[:2],
                               p=r.get('pos', ''), ht=num(r.get('height_csk')) or 72, home=r.get('hometown', ''), hs=r.get('high_school', ''), team=slug)
            t['roster'].append(pid)
        for r in table(h27, 'players_totals'):
            stats[r['_id']].append(dict(season=2027, team=slug, srs=t['srs'], **statrow(r)))
        p26 = get(f'{SR}/cbb/schools/{slug}/women/2026.html')
        if p26:
            h26p = uncomment(p26)
            for r in table(h26p, 'roster'):
                prev_cls[r['_id']] = (r.get('class') or '').upper()[:2]
            for r in table(h26p, 'players_totals'):
                stats[r['_id']].append(dict(season=2026, team=slug, srs=srs26.get(slug, -12.0), **statrow(r)))
        teams.append(t)
    # 5-in-5 eligibility: a senior who was already a senior (or graduate) on a 2025-26 roster is in year 5+ -> GR (5th year)
    n5 = 0
    for pid, p in roster.items():
        if p['cls'] == 'GR' or (p['cls'] == 'SR' and prev_cls.get(pid) in ('SR', 'GR')):
            p['cls'] = 'GR'; n5 += 1
    print('5th-year players:', n5)
    return teams, roster, stats


# ---------------------------------------------------------------- WNBA
def wnba():
    h = uncomment(get(f'{BR}/wnba/years/2026.html'))
    names = dict(sorted(set(re.findall(r'href="/wnba/teams/([A-Z]{3})/2026.html">([^<]+)<', h))))
    teams, roster, stats = [], {}, collections.defaultdict(list)
    for ab, name in names.items():
        th = get(f'{BR}/wnba/teams/{ab}/2026.html')
        if not th:
            continue
        th = uncomment(th)
        inf = info(th)
        m = re.search(r'Coach:\s*([^\(]+?)\s*\(', inf)
        coach = m.group(1).strip() if m else None
        m = re.search(r'Net Rtg\s*:\s*([+\-]?[\d.]+)', inf)
        net = num(m.group(1)) if m else 0
        m = re.search(r'Record:\s*(\d+)-(\d+)', inf)
        logo = re.search(r'class="teamlogo"\s+src="([^"]+)"', th)
        conf = 'Eastern' if 'Eastern Conference' in inf else 'Western'
        tid = {'CON': 'ctsun'}.get(ab, ab.lower())   # 'con' is a reserved file name on Windows (logo file)
        t = dict(id=tid, league='wnba', short=name.split()[-1] if ab not in ('GSV',) else 'Valkyries', name=name, city=' '.join(name.split()[:-1]), conf=conf, confId=conf.lower(),
                 coach=coach, srs=net, logoUrl=logo.group(1) if logo else None, abbr=ab, roster=[], rec=[int(m.group(1)), int(m.group(2))] if m else None)
        for r in table(th, 'roster'):
            pid = r['_id']
            by = r.get('birth_date_csk', '')
            roster[pid] = dict(id=pid, name=r.get('player', ''), num=r.get('number', ''), p=r.get('pos', ''), ht=num(r.get('height_csk')) or 73,
                               born=int(by.split('-')[0]) if by[:4].isdigit() else None, exp=int(num(r.get('exp_csk') or r.get('exp'))), college=r.get('college', ''), team=t['id'])
            q = roster[pid]
            if not q['name'] and q['num'] and not q['num'].isdigit():   # no jersey number: the name sits in the first cell
                q['name'], q['num'] = q['num'], ''
            t['roster'].append(pid)
        for r in table(th, 'totals'):
            stats[r['_id']].append(dict(season=2026, team=t['id'], srs=net, **statrow(r)))
        teams.append(t)
    return teams, roster, stats


# ---------------------------------------------------------------- ratings
def features(S, ftp=0.71):
    """Season totals (summed) -> rate features. Shrunk toward league priors by volume."""
    mp = max(S['mp'], 1)
    fg2, fg2a = S['fg'] - S['fg3'], S['fga'] - S['fg3a']
    f = {}
    f['f2pct'] = (fg2 + 0.45 * 40) / (fg2a + 40)
    f['fg3pct'] = (S['fg3'] + 0.30 * 50) / (S['fg3a'] + 50)
    f['ftpct'] = (S['ft'] + ftp * 25) / (S['fta'] + 25)
    K = 150  # minutes of prior
    def per40(k, prior):
        return (S[k] + prior * K / 40) / (mp + K) * 40
    f['ftr'] = (S['fta'] + 0.28 * 30) / (S['fga'] + 30)
    f['fg2a40'] = per40('fga', 13) - per40('fg3a', 4.5)
    f['fg3a40'] = per40('fg3a', 4.5)
    f['ast40'] = per40('ast', 3.0)
    f['stl40'] = per40('stl', 1.8)
    f['blk40'] = per40('blk', 0.7)
    f['orb40'] = per40('orb', 2.5)
    f['drb40'] = per40('drb', 5.0)
    f['pf40'] = per40('pf', 3.8)
    f['tovpct'] = (S['tov'] + 3) / (S['fga'] + 0.44 * S['fta'] + S['tov'] + 15)
    f['astto'] = (S['ast'] + 3) / (S['tov'] + 3)
    gm = S['pts'] + 0.4 * S['fg'] - 0.7 * S['fga'] - 0.4 * (S['fta'] - S['ft']) + 0.7 * S['orb'] + 0.3 * S['drb'] + S['stl'] + 0.7 * S['ast'] + 0.7 * S['blk'] - 0.4 * S['pf'] - S['tov']
    f['gs40'] = (gm + 4.0 * K / 40) / (mp + K) * 40
    f['mpg'] = S['mp'] / max(S['g'], 1)
    return f


def zscorer(rows):
    """rows: list of (features, weight). Returns z(key, value)."""
    keys = rows[0][0].keys()
    mu, sd = {}, {}
    W = sum(w for _, w in rows)
    for k in keys:
        m = sum(f[k] * w for f, w in rows) / W
        v = sum((f[k] - m) ** 2 * w for f, w in rows) / W
        mu[k], sd[k] = m, math.sqrt(v) or 1
    return lambda k, x: (x - mu[k]) / sd[k]


def rate(p, f, z, L, pos):
    zz = {k: z(k, v) for k, v in f.items()}
    size = (p['ht'] - 72) / 3.0
    sk = {
        'fin': .55 * zz['f2pct'] + .3 * zz['ftr'] + .15 * zz['fg2a40'],
        'post': .35 * zz['f2pct'] + .25 * zz['fg2a40'] + .25 * zz['orb40'] + .35 * size,
        'mid': .45 * zz['ftpct'] + .35 * zz['fg2a40'] + .2 * zz['f2pct'] - .15 * size,
        'three': .55 * zz['fg3pct'] + .5 * zz['fg3a40'],
        'hdl': .55 * zz['ast40'] - .35 * zz['tovpct'] + .15 * zz['fg3a40'] - .3 * size,
        'pas': .75 * zz['ast40'] - .25 * zz['tovpct'],
        'vis': .55 * zz['ast40'] + .45 * zz['astto'],
        'perD': .55 * zz['stl40'] - .2 * zz['pf40'] - .3 * size,
        'postD': .4 * zz['blk40'] + .3 * zz['drb40'] + .4 * size,
        'stl': zz['stl40'], 'blk': zz['blk40'], 'oreb': zz['orb40'], 'dreb': zz['drb40'],
        'spd': .45 * zz['stl40'] + .25 * zz['ftr'] - .45 * size,
        'str': .35 * zz['orb40'] + .3 * zz['ftr'] + .45 * size,
        'vert': .4 * zz['blk40'] + .3 * zz['orb40'] + .2 * zz['drb40'],
        'iq': .45 * zz['astto'] - .3 * zz['pf40'] - .3 * zz['tovpct'],
    }
    core = ['fin', 'post', 'mid', 'three', 'hdl', 'pas', 'perD', 'postD', 'stl', 'blk', 'oreb', 'dreb']
    c = sum(sk[k] for k in core) / len(core)
    r = {}
    for k, v in sk.items():
        off = max(-7, min(6, 2.6 * (v - c) + 0.25 * ARCH[pos][k]))
        r[k] = L + off + 0.5 * hrand(p['id'], k)
    r['ft'] = (f['ftpct'] - 0.47) / 0.024
    r['sta'] = L + max(-4, min(4, 1.6 * zz['mpg'])) + 0.8 * hrand(p['id'], 'sta')
    r['cons'] = L - 0.5 + max(-3, min(3, 1.2 * zz['mpg'])) + 1.2 * hrand(p['id'], 'cons')
    r['clu'] = 10 + (L - 10) * 0.5 + 2.4 * hrand(p['id'], 'clu')
    if f['fg3a40'] < 0.8:
        r['three'] = min(r['three'], 3 + f['fg3a40'] * 4)
    return {k: int(max(1, min(20, round(r[k])))) for k in RAT}


def gen_ratings(p, L, pos):
    r = {k: L + ARCH[pos][k] + 1.5 * hrand(p['id'], k) for k in RAT}
    r['ft'] = L + ARCH[pos]['ft'] + 2 * hrand(p['id'], 'ft')
    return {k: int(max(1, min(20, round(v)))) for k, v in r.items()}


def build_league(teams, roster, stats, league):
    agg = {}
    for pid, lst in stats.items():
        S = {k: sum(x[k] for x in lst) for k in STATS}
        srs = sum(x['srs'] * x['mp'] for x in lst) / max(sum(x['mp'] for x in lst), 1)
        agg[pid] = (S, srs)
    ftp = 0.71 if league == 'ncaa' else 0.79
    pool = [(features(S, ftp), S['mp']) for S, _ in agg.values() if S['mp'] >= 100]
    z = zscorer(pool)
    tsrs = {t['id']: t['srs'] for t in teams}
    players = {}
    for pid, p in roster.items():
        S, srs = agg.get(pid, (None, None))
        tp = tsrs.get(p['team'], 0)
        cls = p.get('cls', 'SR') if league == 'ncaa' else None
        if league == 'ncaa':
            prior = 7.2 + 0.065 * tp + CLS_BUMP.get(cls, 1)
        else:
            prior = 12.6 + 0.08 * tp + min(p.get('exp', 0), 6) * 0.15
        if S and S['mp'] > 0:
            f = features(S, ftp)
            if league == 'ncaa':
                Lstat = 8.4 + 1.5 * z('gs40', f['gs40']) + 1.0 * z('mpg', f['mpg']) + 0.068 * srs + 0.4 * CLS_BUMP.get(cls, 1)
            else:
                Lstat = 13.6 + 1.5 * z('gs40', f['gs40']) + 1.0 * z('mpg', f['mpg']) + 0.1 * srs
            w = S['mp'] / (S['mp'] + 250)
            L = w * Lstat + (1 - w) * prior
        else:
            f, L = None, prior + 1.3 * hrand(pid, 'L')
        # soft cap at the top of each scale (college stars ~ a good WNBA starter, WNBA MVPs ~18-19)
        cap0, span = (13.5, 3.8) if league == 'ncaa' else (15.5, 3.6)
        if L > cap0:
            L = cap0 + span * math.tanh((L - cap0) / span)
        L = max(3, L)
        pos = pos5(p['p'], p['ht'], S or {})
        r = rate(p, f, z, L, pos) if f else gen_ratings(p, L, pos)
        if league == 'ncaa':
            pot = L + POT_BUMP.get(cls, 1) + 1.5 * hrand(pid, 'pot')
            age = CLS_AGE.get(cls, 21)
        else:
            age = 2027 - p['born'] if p.get('born') else 26
            pot = L + (3 if age < 24 else 1.5 if age < 27 else 0.3 if age < 30 else 0) + 1.0 * hrand(pid, 'pot')
        out = dict(id=pid, name=p['name'], pos=pos, ht=int(round(p['ht'])), team=p['team'], r=r, pot=int(max(1, min(20, round(max(pot, L))))), age=age, L=round(L, 2))
        if league == 'ncaa':
            out.update(cls=cls, home=p.get('home', ''), hs=p.get('hs', ''))
            last = [x for x in stats.get(pid, []) if x['season'] == 2026]
            if last:
                x = last[0]
                out['prev'] = dict(team=x['team'], g=int(x['g']), mp=int(x['mp']), pts=int(x['pts']), trb=int(x['orb'] + x['drb']), ast=int(x['ast']))
        else:
            out.update(exp=p.get('exp', 0), college=p.get('college', ''))
            last = stats.get(pid, [])
            if last:
                x = last[0]
                out['prev'] = dict(team=x['team'], g=int(x['g']), mp=int(x['mp']), pts=int(x['pts']), trb=int(x['orb'] + x['drb']), ast=int(x['ast']))
        if p.get('num'):
            out['num'] = p['num']
        players[pid] = out
    return players


def main():
    nt, nr, ns = ncaa()
    wt, wr, ws = wnba()
    players = build_league(nt, nr, ns, 'ncaa')
    players.update(build_league(wt, wr, ws, 'wnba'))
    ov_path = os.path.join(os.path.dirname(__file__), 'overrides.json')
    if os.path.exists(ov_path):
        for pid, ov in json.load(open(ov_path, encoding='utf-8')).items():
            if pid in players:
                for k, v in ov.items():
                    if k in RAT:
                        players[pid]['r'][k] = v
                    else:
                        players[pid][k] = v
    teams = nt + wt
    cpath = os.path.join(os.path.dirname(__file__), 'colors.json')
    colors = json.load(open(cpath)) if os.path.exists(cpath) else {}
    for t in teams:
        t['logo'] = f"assets/logos/{t['league']}/{t['id']}.png"
        if t['id'] in colors:
            t['color'], t['color2'] = colors[t['id']]
    # name pools for generated players: real first names (weighted by count), real surnames
    firsts = collections.Counter(p['name'].split()[0] for p in players.values() if p['name'])
    lasts = collections.Counter(p['name'].split()[-1] for p in players.values() if len(p['name'].split()) > 1)
    with open(os.path.join(ROOT, 'js', 'data', 'real.js'), 'w', encoding='utf-8') as fo:
        fo.write('// GENERATED by tools/build_data.py from Sports-Reference / Basketball-Reference pages (2026-27 NCAA rosters with\n')
        fo.write('// 2025-26 + 2026-27 stats; 2026 WNBA rosters and stats). Ratings are derived, see docs/data.md. Do not edit by hand:\n')
        fo.write('// use tools/overrides.json and rebuild.\n')
        fo.write('export const RATING_KEYS = ' + json.dumps(RAT) + ';\n')
        fo.write('export const TEAMS = ' + json.dumps(teams, separators=(',', ':')) + ';\n')
        compact = {pid: {**{k: v for k, v in p.items() if k != 'r'}, 'r': [p['r'][k] for k in RAT]} for pid, p in players.items()}
        fo.write('export const PLAYERS = ' + json.dumps(compact, separators=(',', ':')) + ';\n')
    with open(os.path.join(ROOT, 'js', 'data', 'names.js'), 'w', encoding='utf-8') as fo:
        fo.write('// Name pools for generated players (GENERATED by tools/build_data.py): first names and surnames of real D1 / WNBA\n')
        fo.write('// players, most common first. Generated players get random combinations, not real people.\n')
        fo.write('export const FIRST = ' + json.dumps([n for n, c in firsts.most_common() if re.match(r"^[A-Z][A-Za-z'\-]+$", n)]) + ';\n')
        fo.write('export const LAST = ' + json.dumps([n for n, c in lasts.most_common() if re.match(r"^[A-Z][A-Za-z'\-]+$", n)]) + ';\n')
    # report
    nc = [p for p in players.values() if p['team'] in {t['id'] for t in nt}]
    wn = [p for p in players.values() if p not in nc]
    print('teams', len(nt), len(wt), 'players', len(nc), len(wn))
    for lab, ps in (('NCAA', nc), ('WNBA', wn)):
        Ls = sorted(p['L'] for p in ps)
        print(lab, 'L mean %.2f  p10 %.1f  p50 %.1f  p90 %.1f  max %.1f' % (sum(Ls) / len(Ls), Ls[len(Ls) // 10], Ls[len(Ls) // 2], Ls[len(Ls) * 9 // 10], Ls[-1]))
        for p in sorted(ps, key=lambda p: -p['L'])[:15]:
            print('  %-24s %-4s %-3s %-16s L %.1f  %s' % (p['name'], p['pos'], p.get('cls', p['age']), p['team'], p['L'], ' '.join(f'{k}{p["r"][k]}' for k in ('fin', 'three', 'ft', 'pas', 'perD', 'blk', 'dreb'))))
    by_team = collections.defaultdict(list)
    for p in players.values():
        by_team[p['team']].append(p['L'])
    for t in sorted(teams, key=lambda t: -t['srs'])[:8] + [t for t in teams if t['league'] == 'wnba'][:3]:
        top = sorted(by_team[t['id']], reverse=True)[:8]
        print('  %-28s srs %6.1f  top8 avg L %.1f  n=%d' % (t['name'], t['srs'], sum(top) / max(len(top), 1), len(by_team[t['id']])))


if __name__ == '__main__':
    main()
