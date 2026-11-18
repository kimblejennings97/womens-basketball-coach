"""Download team logos (Sports-Reference / Basketball-Reference CDN, via Sports Logos.net) into assets/logos/<league>/<id>.png.
Private testing only: switch to generated badges before any public release (see docs/data.md)."""
import os, re, json, time, urllib.request
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
src = open(os.path.join(ROOT, 'js', 'data', 'real.js'), encoding='utf-8').read()
teams = json.loads(re.search(r'export const TEAMS = (\[.*?\]);\n', src, re.S).group(1))
n = 0
for t in teams:
    url = t.get('logoUrl')
    out = os.path.join(ROOT, 'assets', 'logos', t['league'], t['id'] + '.png')
    if not url or os.path.exists(out):
        continue
    os.makedirs(os.path.dirname(out), exist_ok=True)
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=30) as r:
            data = r.read()
        open(out, 'wb').write(data); n += 1
    except Exception as e:
        print('fail', t['id'], e)
        if '429' in str(e) or '403' in str(e):
            break
    time.sleep(1.5)
print('downloaded', n)
