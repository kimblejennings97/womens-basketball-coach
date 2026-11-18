"""Real game margins (calibration target for the engine's spread of results).
WNBA: the 2026 season schedule page (one request). NCAA: 2025-26 schedule pages of 48 schools spread over the strength range.
Uses the cached, rate-limited fetcher (stops on 403/429). Output: tools/margins.json + a printed summary."""
import json, os, re, statistics, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fetch import get, uncomment

SR, BR = 'https://www.sports-reference.com', 'https://www.basketball-reference.com'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def summary(m):
    m = [abs(x) for x in m]
    m.sort()
    q = lambda p: m[int(p * (len(m) - 1))]
    return {'n': len(m), 'mean': round(statistics.mean(m), 2), 'median': q(.5), 'p90': q(.9),
            'le5': round(sum(x <= 5 for x in m) / len(m), 3), 'ge20': round(sum(x >= 20 for x in m) / len(m), 3),
            'ge30': round(sum(x >= 30 for x in m) / len(m), 3)}


def wnba():
    h = uncomment(get(f'{BR}/wnba/years/2026_games.html') or '')
    out = []
    for row in re.findall(r'<tr[^>]*>(.*?)</tr>', h, re.S):
        pts = re.findall(r'data-stat="(?:visitor|home)_pts"[^>]*>(\d+)<', row)
        if len(pts) == 2:
            out.append(int(pts[1]) - int(pts[0]))
    return out


def ncaa():
    real = open(os.path.join(ROOT, 'js', 'data', 'real.js'), encoding='utf-8').read()
    teams = re.findall(r'"id":"([^"]+)","league":"ncaa"[^}]*?"srs":(-?[\d.]+)', real)
    teams.sort(key=lambda t: float(t[1]))
    pick = teams[::max(1, len(teams) // 48)][:48]
    out, seen = [], set()
    for slug, _ in pick:
        h = uncomment(get(f'{SR}/cbb/schools/{slug}/women/2026-schedule.html') or '')
        for row in re.findall(r'<tr[^>]*>(.*?)</tr>', h, re.S):
            a = re.search(r'data-stat="pts"[^>]*>(\d+)<', row)
            b = re.search(r'data-stat="opp_pts"[^>]*>(\d+)<', row)
            d = re.search(r'data-stat="date_game"[^>]*csk="([^"]+)"', row) or re.search(r'data-stat="date_game"[^>]*>(.*?)</', row)
            o = re.search(r'data-stat="opp_name"[^>]*>(.*?)</td>', row)
            if a and b:
                key = (d.group(1) if d else '', frozenset([slug, re.sub('<[^>]+>', '', o.group(1)) if o else '']), int(a.group(1)) + int(b.group(1)))
                if key in seen:
                    continue
                seen.add(key)
                out.append(int(a.group(1)) - int(b.group(1)))
    return out


if __name__ == '__main__':
    res = {'wnba': summary(wnba()), 'ncaa': summary(ncaa())}
    json.dump(res, open(os.path.join(ROOT, 'tools', 'margins.json'), 'w'), indent=1)
    print(json.dumps(res, indent=1))
