# dashsweep.py · remove every em dash and en dash from the files given, per the LOCK IN rule
# "No em dashes. Anywhere. Not in copy, not in commit messages, not in code comments."
# Usage: python .tools/dashsweep.py lock-in.html ss/index.html ...
#
# Rules, in order:
#   digit–digit (a range)            -> digit-digit           e.g. 425–530 -> 425-530
#   text — text / text – text        -> text · text           (interpunct, the house separator)
#   any dash left (line start, etc.) -> ·
# Also rewrites — / – escape sequences inside JS strings the same way.
# Writes through a temp file and os.replace, never a truncating open. Preserves CRLF.
import os
import re
import sys

EM, EN = '—', '–'


def sweep(text):
    text = re.sub(r'(?<=\d)[' + EN + EM + r'](?=\d)', '-', text)
    text = re.sub(r'(?<=\S)[ \t]*[' + EM + EN + r'][ \t]*(?=\S)', ' · ', text)
    text = text.replace(EM, '·').replace(EN, '·')
    text = text.replace('\\u2014', '\\u00b7').replace('\\u2013', '\\u00b7')
    return text


def main(paths):
    for p in paths:
        raw = open(p, 'rb').read()
        before = raw.decode('utf-8')
        n = before.count(EM) + before.count(EN) + before.count('\\u2014') + before.count('\\u2013')
        if not n:
            print('clean  %s' % p)
            continue
        after = sweep(before)
        left = after.count(EM) + after.count(EN)
        assert left == 0, (p, left)
        tmp = p + '.dashtmp'
        with open(tmp, 'wb') as f:
            f.write(after.encode('utf-8'))
        os.replace(tmp, p)
        print('swept  %-28s %d dashes' % (p, n))


if __name__ == '__main__':
    main(sys.argv[1:])
