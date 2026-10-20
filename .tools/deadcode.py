# deadcode.py · every JavaScript function the site defines must be called from somewhere, or it is dead code.
# Usage: python .tools/deadcode.py [page ...]        (default: every served .html page)
#
# Why this exists: triggerBagDwell could end a run on a smalls-bag timer, nothing had called it for a month, and three
# review passes still described it as live behavior. A defined-but-never-called function is a claim about the game that
# the game no longer makes. This fails on any of them, so the next one is caught the day it goes dead.
#
# A function counts as used when its name appears, as a whole word, anywhere outside its own definition line in any
# served page: a call, an onclick attribute, a callback reference, a string handed to setTimeout. Comments are ignored,
# so a comment that mentions a function does not keep it alive.
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


def main(argv):
    targets = [os.path.abspath(a) for a in argv] or pages()
    texts = {p: strip_comments(open(p, encoding='utf-8').read()) for p in pages()}
    corpus = '\n'.join(texts.values())
    dead = []
    for p in targets:
        src = texts.get(p) or strip_comments(open(p, encoding='utf-8').read())
        for m in re.finditer(r'(?m)^[ \t]*function[ \t]+([A-Za-z_$][\w$]*)[ \t]*\(', src):
            name = m.group(1)
            uses = len(re.findall(r'(?<![\w$.])' + re.escape(name) + r'(?![\w$])', corpus))
            if uses <= 1:  # the definition itself is the one match
                line = src.count('\n', 0, m.start()) + 1
                dead.append('%s:%d %s' % (os.path.relpath(p, ROOT).replace(os.sep, '/'), line, name))
    if dead:
        print('DEAD CODE: %d function(s) defined and never called' % len(dead))
        for x in dead:
            print('  ' + x)
        return 1
    print('DEAD CODE: CLEAN -- every function is called from somewhere (%d pages)' % len(targets))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
