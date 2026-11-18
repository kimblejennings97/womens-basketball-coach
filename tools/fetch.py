"""Cached, rate-limited page fetcher (Sports-Reference allows ~20 requests/minute; we use one per 3.5 s).
Never bypass blocking: if a site answers 429/403, stop and ask the user to save the pages by hand."""
import os, re, sys, time, hashlib, urllib.request

CACHE = os.path.join(os.path.dirname(__file__), 'cache')
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
_last = [0.0]


def path_for(url):
    name = re.sub(r'[^A-Za-z0-9]+', '_', url.split('://', 1)[-1])[:150]
    return os.path.join(CACHE, name + '_' + hashlib.md5(url.encode()).hexdigest()[:6] + '.html')


def get(url, delay=3.5):
    p = path_for(url)
    if os.path.exists(p):
        with open(p, encoding='utf-8') as f:
            return f.read()
    if os.environ.get('OFFLINE'):
        return None
    wait = delay - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            html = r.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        _last[0] = time.time()
        if e.code in (403, 429):
            print('BLOCKED', e.code, url, file=sys.stderr)
            sys.exit(2)
        if e.code == 404:
            return None
        raise
    _last[0] = time.time()
    with open(p, 'w', encoding='utf-8') as f:
        f.write(html)
    return html


def uncomment(html):
    """Sports-Reference hides most tables inside HTML comments."""
    return html.replace('<!--', '').replace('-->', '')
