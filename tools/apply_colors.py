"""Read the dumped DOM of tools/teamcolors.html (path in argv[1]) and write tools/colors.json {team_id: [c1, c2]}."""
import sys, re, json, html, os
s = open(sys.argv[1], encoding='utf-8', errors='replace').read()
m = re.search(r'<pre id="o">(.*?)</pre>', s, re.S)
data = json.loads(html.unescape(m.group(1)))
json.dump(data, open(os.path.join(os.path.dirname(__file__), 'colors.json'), 'w'), indent=0)
print(len(data), 'teams')
