# noaccounts.py · LOCK IN 4.0 has no player accounts, and no page reads or writes a database table directly.
# Usage: python .tools/noaccounts.py
#
# Why this exists: in 4.0 the instructor is the only account (Vince, 2026-10-20: "the accounts are out, it's arcade
# only"). A player page that grows a sign-in call, a stored access token or a direct table read has brought the account
# layer back. This fails on:
#   1. a call to the sign-in service (/auth/v1) or an access token, on any served page but the instructor dashboard
#   2. a direct table call (/rest/v1/<table>) on any served page: every read and write goes through a database function
#      (/rest/v1/rpc/...), which checks who is asking
# It replaces authblock.py, which kept the 3.x one-sign-out block identical across four pages.
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP = {'.git', '.tools', '.changelog', '.db', '.claude', '.staging', 'node_modules'}
INSTRUCTOR = 'dashboard/index.html'


def pages():
    for d, dirs, files in os.walk(ROOT):
        dirs[:] = [x for x in dirs if x not in SKIP and not x.startswith('.')]
        for f in files:
            if f.endswith(('.html', '.js')):
                p = os.path.join(d, f)
                yield os.path.relpath(p, ROOT).replace(os.sep, '/'), p


def main():
    bad = []
    n = 0
    for rel, p in pages():
        n += 1
        src = io.open(p, encoding='utf-8').read()
        code = re.sub(r'<!--.*?-->|/\*.*?\*/', '', src, flags=re.S)
        code = re.sub(r'(?m)^\s*//.*$', '', code)
        if rel != INSTRUCTOR:
            for pat, what in ((r'/auth/v1', 'a call to the sign-in service'), (r'access_token', 'an access token')):
                for m in re.finditer(pat, code):
                    line = code.count('\n', 0, m.start()) + 1
                    bad.append('%s:%d %s' % (rel, line, what))
        for m in re.finditer(r"/rest/v1/(?!rpc/)[a-z_]+|endpoint\+'/(?!rpc/)[a-z_]+", code):
            line = code.count('\n', 0, m.start()) + 1
            bad.append('%s:%d a direct table call (%s)' % (rel, line, m.group(0)))
    if bad:
        print('NO ACCOUNTS: %d violation(s)' % len(bad))
        for b in bad:
            print('  ' + b)
        return 1
    print('NO ACCOUNTS: CLEAN -- no player sign-in, no direct table call (%d pages; the instructor dashboard signs in)' % n)
    return 0


if __name__ == '__main__':
    sys.exit(main())
