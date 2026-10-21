# deadcode.py · every JavaScript function the site defines must be called from somewhere, and every top-level variable
# must be read and able to change, or it is dead code.
# Usage: python .tools/deadcode.py [page ...]        (default: every served .html page)
#
# Why this exists: triggerBagDwell could end a run on a smalls-bag timer, nothing had called it for a month, and three
# review passes still described it as live behavior. A defined-but-never-called function is a claim about the game that
# the game no longer makes. This fails on any of them, so the next one is caught the day it goes dead.
#
# A function counts as used when its name appears, as a whole word, anywhere outside its own definition line in any
# served page: a call, an onclick attribute, a callback reference, a string handed to setTimeout. Comments are ignored,
# so a comment that mentions a function does not keep it alive.
#
# DEAD STATE (4.0): removing triggerBagDwell left its flag behind. bagDwellFired was declared false, reset to false in
# two places and read by the staging light, and nothing could ever set it true, so the light's dwell state was a claim
# the game no longer made either. Two checks cover that class, for every `var` declared at the top level of a script:
#   UNUSED  the name appears nowhere but its own declaration.
#   LOCKED  it starts as false, true, null or 0, nothing increments it, and every assignment hands it that same value.
#           A switch locked in one position means the branch for the other position can never run (BAND_MODE was false
#           from v3.4.6 to 4.0 and kept 40 lines of geometry nobody could reach). Fold the switch to the branch that runs.
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {'.git', '.tools', '.changelog', '.db', '.claude', '.staging', 'node_modules'}


def pages():
    out = []
    for d, dirs, files in os.walk(ROOT):
        dirs[:] = [x for x in dirs if x not in SKIP_DIRS and not x.startswith('.')]
        for f in files:
            if f.endswith('.html'):
                out.append(os.path.join(d, f))
    return sorted(out)


def strip_comments(src):
    # drop // line comments and /* */ blocks outside strings, and <!-- --> blocks, keeping line numbers
    src = re.sub(r'<!--.*?-->', lambda m: '\n' * m.group(0).count('\n'), src, flags=re.S)
    out, i, n, q = [], 0, len(src), None
    while i < n:
        c = src[i]
        if q:
            out.append(c)
            if c == '\\' and i + 1 < n:
                out.append(src[i + 1]); i += 2; continue
            if c == q or (q != '`' and c == '\n'):
                q = None
            i += 1; continue
        if c in '\'"`':
            q = c; out.append(c); i += 1; continue
        if src.startswith('//', i) and (i == 0 or src[i - 1] != ':'):
            j = src.find('\n', i); j = n if j < 0 else j
            i = j; continue
        if src.startswith('/*', i):
            j = src.find('*/', i + 2); j = n if j < 0 else j + 2
            out.append('\n' * src.count('\n', i, j)); i = j; continue
        out.append(c); i += 1
    return ''.join(out)


def word(name):
    return r'(?<![\w$.])' + re.escape(name) + r'(?![\w$])'


def top_vars(src):
    # (name, initial value text, line) for every name in a `var` statement that starts at column 0
    for m in re.finditer(r'(?m)^var[ \t]+([^\n]+)', src):
        decl, depth, cur, items = m.group(1).split(';')[0], 0, '', []
        for ch in decl:
            if ch in '([{': depth += 1
            elif ch in ')]}': depth -= 1
            if ch == ',' and depth == 0:
                items.append(cur); cur = ''
            else:
                cur += ch
        items.append(cur)
        for it in items:
            im = re.match(r'\s*([A-Za-z_$][\w$]*)\s*(?:=\s*(.*))?$', it)
            if im:
                yield im.group(1), (im.group(2) or '').strip(), src.count('\n', 0, m.start()) + 1


def main(argv):
    targets = [os.path.abspath(a) for a in argv] or pages()
    texts = {p: strip_comments(open(p, encoding='utf-8').read()) for p in pages()}
    for p in targets:
        if p not in texts:
            texts[p] = strip_comments(open(p, encoding='utf-8').read())
    corpus = '\n'.join(texts.values())
    dead, state = [], []
    for p in targets:
        src = texts[p]
        rel = os.path.relpath(p, ROOT).replace(os.sep, '/')
        for m in re.finditer(r'(?m)^[ \t]*function[ \t]+([A-Za-z_$][\w$]*)[ \t]*\(', src):
            name = m.group(1)
            uses = len(re.findall(word(name), corpus))
            if uses <= 1:  # the definition itself is the one match
                line = src.count('\n', 0, m.start()) + 1
                dead.append('%s:%d %s' % (rel, line, name))
        for name, init, line in top_vars(src):
            w = word(name)
            if len(re.findall(w, corpus)) <= 1:
                state.append('%s:%d %s  UNUSED: nothing reads it' % (rel, line, name))
                continue
            if init not in ('false', 'true', 'null', '0'):
                continue
            if re.search(w + r'[ \t]*(\+\+|--|[-+*/|&%]=)', corpus) or re.search(r'(\+\+|--)[ \t]*' + w, corpus):
                continue
            vals = [v.strip() for v in re.findall(w + r'[ \t]*=(?!=)[ \t]*([^;,)}\n]+)', corpus)]
            if all(v == init for v in vals):
                state.append('%s:%d %s  LOCKED at %s: nothing can change it' % (rel, line, name, init))
    if dead:
        print('DEAD CODE: %d function(s) defined and never called' % len(dead))
        for x in dead:
            print('  ' + x)
    if state:
        print('DEAD STATE: %d variable(s) nothing reads or nothing can change' % len(state))
        for x in state:
            print('  ' + x)
    if dead or state:
        return 1
    print('DEAD CODE: CLEAN -- every function is called and every top-level variable is read and can change (%d pages)' % len(targets))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
