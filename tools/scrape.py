"""Fetch every page the real-data build needs into tools/cache (resumable: cached pages are skipped).
NCAA D1 women: 2026-27 team pages (rosters, conference, coach) + 2025-26 team pages (last season's player stats).
WNBA: 2026 season team pages (rosters + stats). Logos: school logo images from the team pages."""
import sys, re, os
sys.path.insert(0, os.path.dirname(__file__))
from fetch import get, uncomment

SR = 'https://www.sports-reference.com'
BR = 'https://www.basketball-reference.com'


def schools(year):
    h = uncomment(get(f'{SR}/cbb/seasons/women/{year}-school-stats.html'))
    return re.findall(r"href='/cbb/schools/([^/]+)/women/%d.html'>([^<]+)</a>" % year, h)


def main():
    cur = schools(2027)
    print('schools 2027:', len(cur), flush=True)
    for i, (slug, name) in enumerate(cur):
        get(f'{SR}/cbb/schools/{slug}/women/2027.html')
        get(f'{SR}/cbb/schools/{slug}/women/2026.html')
        if i % 20 == 0:
            print(i, slug, flush=True)
    h = uncomment(get(f'{BR}/wnba/years/2026.html'))
    teams = sorted(set(re.findall(r'href="/wnba/teams/([A-Z]{3})/2026.html"', h)))
    print('wnba teams:', teams, flush=True)
    for t in teams:
        get(f'{BR}/wnba/teams/{t}/2026.html')
    get(f'{BR}/wnba/years/2025.html')
    print('DONE', flush=True)


if __name__ == '__main__':
    main()
