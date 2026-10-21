# rulecount.py · the rule count LOCK IN states can never go stale. Usage: python .tools/rulecount.py
#
# Why this exists: the district overview said "38 named load-theory rules" for months. The number came from a codex
# written against v3.5.156; by 4.0 one of its rules (FLAG A HAND) had left the game and three enforced rules were never
# in it, and nothing could notice. .tools/load-rules.json is now the list. This gate fails when:
#   1. a rule names code (a function, variable or constant) that is no longer in lock-in.html,
#   2. a rule states a constant whose value in the code is different,
#   3. any served page or llms file states a count of named rules that is not the length of the list,
#   4. the list is numbered out of order or repeats a name.
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, '.tools'))
import deadcode  # noqa: E402  (its comment stripper, so a comment cannot keep a rule's code alive)

SKIP = {'.git', '.tools', '.changelog', '.db', '.claude', '.staging', 'node_modules'}
COUNT_RX = re.compile(r'(\d+)\s+named\s+(?:load(?:-theory)?\s+)?rules', re.I)


def public_files():
    out = []
    for d, dirs, files in os.walk(ROOT):
        dirs[:] = [x for x in dirs if x not in SKIP and not x.startswith('.')]
        out += [os.path.join(d, f) for f in files if f.endswith('.html') or f.startswith('llms')]
    return sorted(out)


def main():
    reg = json.load(io.open(os.path.join(ROOT, '.tools', 'load-rules.json'), encoding='utf-8'))['rules']
    code = deadcode.strip_comments(io.open(os.path.join(ROOT, 'lock-in.html'), encoding='utf-8').read())
    bad = []
    names = set()
    for i, r in enumerate(reg, 1):
        if r.get('n') != i:
            bad.append('rule %s: numbered out of order (expected %d)' % (r.get('n'), i))
        if r['name'] in names:
            bad.append('rule %d: the name %s is used twice' % (i, r['name']))
        names.add(r['name'])
        for sym in r.get('code', []):
            if not re.search(r'(?<![\w$])' + re.escape(sym) + r'(?![\w$])', code):
                bad.append('rule %d %s: its code %s is not in lock-in.html' % (i, r['name'], sym))
        for k, v in (r.get('const') or {}).items():
            m = re.search(r'(?<![\w$.])' + re.escape(k) + r'\s*=\s*(-?[\d.]+)', code)
            if not m:
                bad.append('rule %d %s: the constant %s is not in lock-in.html' % (i, r['name'], k))
            elif float(m.group(1)) != float(v):
                bad.append('rule %d %s: %s is %s in the code, %s in the list' % (i, r['name'], k, m.group(1), v))
    n = len(reg)
    for f in public_files():
        text = io.open(f, encoding='utf-8').read()
        for m in COUNT_RX.finditer(text):
            if int(m.group(1)) != n:
                rel = os.path.relpath(f, ROOT).replace(os.sep, '/')
                bad.append('%s:%d says "%s"; the list has %d' % (rel, text.count('\n', 0, m.start()) + 1, m.group(0), n))
    if bad:
        print('RULE COUNT: %d problem(s)' % len(bad))
        for b in bad:
            print('  ' + b)
        return 1
    print('RULE COUNT: CLEAN -- %d named rules, every one tied to code that exists, every stated count agrees' % n)
    return 0


if __name__ == '__main__':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.exit(main())
