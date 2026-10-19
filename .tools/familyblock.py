# familyblock.py · every LOCK IN companion wears the same family: header, stat bar, clipboard menus, buttons, footer.
# Usage: python .tools/familyblock.py
#
# Why this exists: Smalls Sort and VAN STACK grew up apart (two header styles, two fonts, dark menus and paper ones,
# a footer without the house line). Vince, 2026-10-17: "make smalls sort and van stack in the same menu/header/etc.
# family". The family lives in ONE file, .tools/companion-family.html. This refuses unless every companion carries
# its CSS and JS blocks byte-identical to that file, and the markup contract it documents.
import io
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CANON = os.path.join(ROOT, '.tools', 'companion-family.html')
COMPANIONS = ['ss/index.html']  # v3.5.208 VAN STACK left trailer-load.com (Vince 2026-10-19); it keeps its own copy of the blocks

BLOCKS = [
    ('CSS', '/* ═══ LOCK IN COMPANION FAMILY v1 · CSS ═══', '/* ═══ END COMPANION FAMILY CSS ═══ */'),
    ('JS', '// ═══ LOCK IN COMPANION FAMILY v1 · JS ═══', '// ═══ END COMPANION FAMILY JS ═══'),
]

# The markup contract: each string must appear in the page.
CONTRACT = [
    ('the LOCK IN fonts', '<link rel="stylesheet" href="/fonts/fonts.css">'),
    ('the family header', '<header class="co-hdr">'),
    ('the logo lockup', 'class="co-logo"'),
    ('the companion kicker', '<span class="co-kicker">LOCK IN COMPANION</span>'),
    ('the account chip', 'id="co-acct"'),
    ('the way back to the Mini-Games menu', 'class="co-btn co-back" href="/lock-in.html#minigames"'),
    ('a stat bar', 'class="co-stats"'),
    ('a clipboard menu', 'class="co-clip"'),
    ('the family footer', '<footer class="co-ftr">'),
    ('the house footer line', 'www.f-keys.com | © 2026 F-Keys LLC'),
    ('its own accent', '--co-accent:'),
    ('its own deep accent', '--co-accent-deep:'),
    ('the account chip booted', 'coFamilyBoot('),
    ('the one-sign-out block', '// v3.5.205 ONE SIGN-OUT FOR THE WHOLE SITE ON THIS DEVICE'),
]


def read(path):
    with io.open(path, 'r', encoding='utf-8', newline='') as f:
        return f.read().replace('\r\n', '\n')


def block(text, start, end):
    i = text.find(start)
    if i < 0 or text.find(start, i + 1) >= 0:
        return None
    j = text.find(end, i)
    return None if j < 0 else text[i:j + len(end)]


def main():
    canon = read(CANON)
    want = {}
    for name, start, end in BLOCKS:
        b = block(canon, start, end)
        if b is None:
            print('FAMILY BLOCK: the %s block is missing or duplicated in .tools/companion-family.html' % name)
            return 1
        want[name] = b
    bad = 0
    for rel in COMPANIONS:
        path = os.path.join(ROOT, rel)
        if not os.path.exists(path):
            print('FAMILY BLOCK: %s does not exist' % rel)
            bad += 1
            continue
        text = read(path)
        for name, start, end in BLOCKS:
            b = block(text, start, end)
            if b is None:
                print('FAMILY BLOCK: %s has no %s block (or more than one)' % (rel, name))
                bad += 1
            elif b != want[name]:
                print('FAMILY BLOCK: %s has a %s block that differs from .tools/companion-family.html' % (rel, name))
                bad += 1
        for what, needle in CONTRACT:
            if needle not in text:
                print('FAMILY BLOCK: %s is missing %s  [%s]' % (rel, what, needle))
                bad += 1
    if bad:
        print('FAMILY BLOCK: %d problem(s) across %d companions.' % (bad, len(COMPANIONS)))
        return 1
    print('FAMILY BLOCK: IDENTICAL in %d companion%s, contract met.' % (len(COMPANIONS), '' if len(COMPANIONS) == 1 else 's'))
    return 0


if __name__ == '__main__':
    sys.exit(main())
