"""Build the folder that gets published (GitHub Pages or Cloudflare): `py tools/build_deploy.py` -> dist/
Only what the game needs: index.html, css/, js/, assets/ (logos). tools/ (and its cache of scraped pages), test pages and
docs stay out."""
import os, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'dist')
os.makedirs(DIST, exist_ok=True)
for name in os.listdir(DIST):
    path = os.path.join(DIST, name)
    try:
        shutil.rmtree(path) if os.path.isdir(path) else os.remove(path)
    except OSError as e:
        print('could not remove', path, '-', e)
shutil.copy2(os.path.join(ROOT, 'index.html'), os.path.join(DIST, 'index.html'))
for d in ['css', 'js', 'assets']:
    shutil.copytree(os.path.join(ROOT, d), os.path.join(DIST, d), dirs_exist_ok=True)
# GitHub Pages: serve files as-is (no Jekyll). Cloudflare: re-check HTML/JS/CSS on every load, cache logos for a day.
open(os.path.join(DIST, '.nojekyll'), 'w').close()
with open(os.path.join(DIST, '_headers'), 'w', newline='\n') as h:
    h.write('/*\n  Cache-Control: no-cache\n\n/assets/*\n  Cache-Control: public, max-age=86400\n')
n = sum(len(fs) for _, _, fs in os.walk(DIST))
size = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(DIST) for f in fs)
print(f'dist/ ready: {n} files, {size / 1e6:.2f} MB')
