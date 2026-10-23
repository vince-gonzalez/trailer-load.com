# lostsurface.py · nothing a player or an instructor can SEE leaves the site unless I approved it by name.
# Usage: python .tools/lostsurface.py [BASE]      (BASE defaults to origin/main, the commit that is live)
#
# Why this exists: 4.0 went live on 2026-10-23 with the crew dashboard cut from 30 grouped, sortable metrics to 9 columns.
# Every test passed, because the tests checked that the new page worked, never that the old page's surface was still there.
# This compares every public page in the working tree against BASE and lists what is gone: element ids, button, heading,
# column and label text (case-blind, from markup or a script column list), and the all-caps UI strings. A removal fails the gate unless
# .tools/approved-removals.json names it with my words and the date I said them. A deleted page fails the same way.
import io
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = sys.argv[1] if len(sys.argv) > 1 else 'origin/main'
APPROVED = os.path.join(ROOT, '.tools', 'approved-removals.json')


def git(*args):
    r = subprocess.run(['git'] + list(args), cwd=ROOT, capture_output=True)
    if r.returncode != 0:
        raise SystemExit('lostsurface: git %s failed: %s' % (' '.join(args), r.stderr.decode('utf-8', 'replace').strip()))
    return r.stdout.decode('utf-8', 'replace')


def surface(t):
    out = set()
    for m in re.finditer(r'''\bid=["']([A-Za-z0-9_-]+)["']''', t):
        out.add('id: ' + m.group(1))
    for m in re.finditer(r'<(button|h1|h2|h3|h4|th|label|summary|legend|option)\b[^>]*>(.*?)</\1>', t, re.S | re.I):
        s = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', m.group(2))).strip()
        if 2 <= len(s) <= 80:
            out.add('text: ' + s.lower())   # case-blind: a header built in script counts the same as one in markup
    for m in re.finditer(r'''['">]([A-Z][A-Z0-9 &·/'+%-]{3,40})['"<]''', t):
        s = m.group(1).strip()
        if re.search('[A-Z]{3}', s):
            out.add('caps: ' + s)
    for m in re.finditer(r'''\bl:\s*'([^']{2,40})',\s*g:''', t):   # a dashboard column: {k:..., l:'Label', g:'group'}
        out.add('text: ' + m.group(1).lower())
    return out


def main():
    base_pages = [p for p in git('ls-tree', '-r', '--name-only', BASE).splitlines() if p.endswith('.html') and not p.startswith('.tools/')]
    try:
        ok = json.load(io.open(APPROVED, encoding='utf-8'))
    except FileNotFoundError:
        ok = {'items': []}
    for it in ok['items']:
        if not str(it.get('why', '')).strip():
            raise SystemExit('lostsurface: approved-removals.json has an item with no "why": ' + json.dumps(it))
    allowed = set((it['page'], it['item']) for it in ok['items'])
    lost = []
    for p in base_pages:
        old = git('show', BASE + ':' + p)
        path = os.path.join(ROOT, p)
        if not os.path.exists(path):
            if (p, 'PAGE') not in allowed:
                lost.append((p, 'PAGE'))
            continue
        new = io.open(path, encoding='utf-8', errors='replace').read()
        for item in sorted(surface(old) - surface(new)):
            if (p, item) not in allowed:
                lost.append((p, item))
    for p, item in lost:
        print('LOST  %-34s %s' % (p, item))
    print('lostsurface: %d page(s) against %s, %d removal(s) nobody approved' % (len(base_pages), BASE, len(lost)))
    if lost:
        print('Each one goes back, or goes in .tools/approved-removals.json with my words and the date I said them.')
    return 1 if lost else 0


if __name__ == '__main__':
    sys.exit(main())
