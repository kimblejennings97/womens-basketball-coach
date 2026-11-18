"""Real league averages (per team per game) the engine is calibrated to."""
import sys, re, os, json
sys.path.insert(0, os.path.dirname(__file__))
from fetch import get, uncomment

def cells(row):
    return {k: v for k, v in re.findall(r'data-stat="([^"]+)"[^>]*>(?:<[^>]+>)*([^<]*)', row)}

def summarize(rows, name):
    keys = ['g', 'pts', 'fg', 'fga', 'fg3', 'fg3a', 'ft', 'fta', 'orb', 'trb', 'drb', 'ast', 'stl', 'blk', 'tov', 'pf']
    tot = {k: 0.0 for k in keys}
    for c in rows:
        for k in keys:
            try: tot[k] += float(c.get(k) or 0)
            except ValueError: pass
    g = tot['g']
    if not tot['drb']: tot['drb'] = tot['trb'] - tot['orb']
    pg = {k: round(tot[k] / g, 2) for k in keys if k != 'g'}
    poss = (tot['fga'] - tot['orb'] + tot['tov'] + 0.44 * tot['fta']) / g
    pg.update(poss=round(poss, 1), fg_pct=round(tot['fg'] / tot['fga'], 3), fg3_pct=round(tot['fg3'] / tot['fg3a'], 3), ft_pct=round(tot['ft'] / tot['fta'], 3),
              fg3a_rate=round(tot['fg3a'] / tot['fga'], 3), fta_rate=round(tot['fta'] / tot['fga'], 3), ast_fg=round(tot['ast'] / tot['fg'], 3),
              tov_pct=round(tot['tov'] / g / poss, 3), ppp=round(tot['pts'] / g / poss, 3))
    # ORB% ~ ORB / (ORB + opp DRB); league-wide opp DRB = DRB
    pg['orb_pct'] = round(tot['orb'] / (tot['orb'] + tot['drb']), 3)
    print(name, json.dumps(pg))
    return pg

h = uncomment(get('https://www.sports-reference.com/cbb/seasons/women/2026-school-stats.html'))
rows = [cells(r) for r in re.findall(r'<tr[^>]*>(.*?)</tr>', h, re.S)]
rows = [c for c in rows if c.get('school_name') and c.get('g')]
print(len(rows), 'schools')
ncaa = summarize(rows, 'NCAA')
h = uncomment(get('https://www.basketball-reference.com/wnba/years/2026.html'))
i = h.find('id="totals-team"'); seg = h[i:h.find('</table>', i)]
rows = [cells(r) for r in re.findall(r'<tr[^>]*>(.*?)</tr>', seg, re.S)]
rows = [c for c in rows if c.get('team') and c.get('g') and 'League' not in c.get('team', '')]
print(len(rows), 'wnba teams')
wnba = summarize(rows, 'WNBA')
json.dump({'ncaa': ncaa, 'wnba': wnba}, open(os.path.join(os.path.dirname(__file__), 'targets.json'), 'w'), indent=1)
