# authblock.py · the one-sign-out block (v3.5.205) must be byte-identical in every page that signs people in or out.
# Usage: python .tools/authblock.py
#
# Why this exists: the block lives in four pages (the game, /me/, the instructor dashboard, Smalls Sort). If one copy
# drifts, a sign-out on that page stops signing out the others, or a page starts trusting a session the device signed
# out of. This refuses unless every page carries exactly one copy and all copies match.
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = ['lock-in.html', 'me/index.html', 'dashboard/index.html', 'ss/index.html']
START = '// v3.5.205 ONE SIGN-OUT FOR THE WHOLE SITE ON THIS DEVICE'
END_MARK = "authUrl+'/logout?scope=local'"


def block(text):
    i = text.find(START)
    if i < 0 or text.find(START, i + 1) >= 0:
        return None
    j = text.find(END_MARK, i)
    if j < 0:
        return None
    j = text.find('\n}', j)
    return None if j < 0 else text[i:j + 2]


def main():
    seen = {}
    bad = 0
    for p in PAGES:
        with open(os.path.join(ROOT, p), 'r', encoding='utf-8', newline='') as f:
            t = f.read().replace('\r\n', '\n')
        b = block(t)
        if b is None:
            print('AUTH BLOCK: missing or duplicated in ' + p)
            bad += 1
            continue
        seen[p] = b
    if len(set(seen.values())) > 1:
        print('AUTH BLOCK: copies differ between ' + ', '.join(sorted(seen)))
        bad += 1
    if bad:
        print('AUTH BLOCK: FAIL')
        return 1
    print('AUTH BLOCK: IDENTICAL in ' + str(len(seen)) + ' pages')
    return 0


if __name__ == '__main__':
    sys.exit(main())
