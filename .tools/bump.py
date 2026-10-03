# bump.py · move every LOCK IN version stamp in lock-in.html from one version to the next.
# Usage: python .tools/bump.py 3.5.197 3.5.198
#
# Why this exists: the stamps live in seven unrelated places and a naive find-and-replace
# missed the CSS-comment header for three versions running. This refuses to write anything
# unless EVERY stamp below is found EXACTLY once, so drift is caught instead of shipped.
# It writes through a temp file and os.replace, never a truncating open, because a
# truncating write has already emptied lock-in.html once.
import os
import sys

PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'lock-in.html')

# Each stamp is a template; {v} is the version. Order matches the file top to bottom.
STAMPS = [
    '   LOCK IN v{v}',                                    # 1 CSS-comment header in <style>
    '<div class="pause-sub">LOCK IN v{v} · ADMIN</div>',  # 2 pause footer
    '<div id="sm-footer">LOCK IN v{v} · © 2026</div>',    # 3 start-menu footer
    '<div class="set-foot">LOCK IN v{v} · SETTINGS</div>',# 4 settings footer
    '// LOCK IN v{v}\n',                                  # 5 JS comment at the top of the game script
    "var LI_APP_VER='{v}';",                              # 6 telemetry version
    '<span class="k">BUILD</span><span class="v">v{v}</span>',  # 7 build badge
]


def main():
    if len(sys.argv) != 3:
        print('usage: python .tools/bump.py <from> <to>')
        return 2
    old, new = sys.argv[1], sys.argv[2]
    raw = open(PATH, 'rb').read()
    crlf = b'\r\n' in raw
    text = raw.decode('utf-8').replace('\r\n', '\n')
    problems = []
    for tpl in STAMPS:
        n = text.count(tpl.format(v=old))
        if n != 1:
            problems.append('found %d (need 1): %r' % (n, tpl.format(v=old)))
    if problems:
        print('REFUSED, nothing written:')
        for p in problems:
            print('  ' + p)
        return 1
    for tpl in STAMPS:
        text = text.replace(tpl.format(v=old), tpl.format(v=new))
    out = text.replace('\n', '\r\n') if crlf else text
    tmp = PATH + '.bumptmp'
    with open(tmp, 'wb') as f:
        f.write(out.encode('utf-8'))
    os.replace(tmp, PATH)
    print('bumped %d stamps %s -> %s' % (len(STAMPS), old, new))
    return 0


if __name__ == '__main__':
    sys.exit(main())
