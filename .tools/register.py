# register.py · every line a LOCK IN player reads is in the cold mechanical register: the fact, then the action.
# Usage: python .tools/register.py [page ...]          (default: lock-in.html and ss/index.html)
#
# Why this exists: Vince, 2026-10-20: "the commentary --- it HAS to be professional only. no negativity, etc. cold
# mechanical register only." The game had grown jokes ("WHOOPSIE", "Nice roof, by the way"), scolding ("Come back and
# load it clean"), praise ("Well done.", "Good instinct.") and a hype mark on every bonus. This fails on any of them in
# the text a player sees: JavaScript string literals and the page's own text, comments excluded.
#   1. an exclamation mark ending a word
#   2. an expressive emoji (category glyphs a label or a rule needs, such as ☢ 💧 ⚡ ⛔ ⚠ 🔒 🛞 🔥, are allowed)
#   3. a word from the hype, joke or scold list
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = ['lock-in.html', 'ss/index.html']
EXPRESSIVE = re.compile('[\U0001F600-\U0001F64F\U0001F4AA\U0001F381\U0001F440\U0001F4A2\U0001F4A5\U0001F389\U0001F38A'
                        '\U0001F64C\U0001F918\U0001F44D\U0001F44F\U0001F60E\U0001F92F\U0001F480\U0001F648\U0001F3D7\U0001F3AF⚓]')
ESCAPED = re.compile(r'\\ud83d\\ude[0-4][0-9a-fA-F]')
WORDS = re.compile(r"(?i)\b(nice|awesome|great job|well done|good instinct|good start|right call|whoops|whoopsie|oops|yikes|"
                   r"lol|untouchable|be the first|on earth|crushed it|nailed it|beautiful|boom|smooth|almost there|"
                   r"come back|load it clean|reset your habits|thank you|you got this|the pile gets mean|layup)\b")
BANG = re.compile(r"[A-Za-z0-9)\]][^'\"<>!]*!(?![=])")
ALLOW = ('YARD LEGEND',)  # a rank-tier name on the ladder, not a remark


def strip_comments(src):
    src = re.sub(r'<!--.*?-->', '', src, flags=re.S)
    src = re.sub(r'/\*.*?\*/', '', src, flags=re.S)
    return re.sub(r'(?m)^\s*//.*$', '', src)


def texts(path):
    raw = io.open(path, encoding='utf-8').read()
    src = strip_comments(raw)
    out = []
    for m in re.finditer(r"'((?:[^'\\\n]|\\.)*)'", src):  # JavaScript strings
        out.append(m.group(1))
    body = re.sub(r'<script.*?</script>|<style.*?</style>', '', src, flags=re.S | re.I)
    for t in re.sub(r'<[^>]+>', '\n', body).split('\n'):  # the page's own text
        if t.strip():
            out.append(t.strip())
    return out


def main(argv):
    targets = argv or PAGES
    bad = []
    for rel in targets:
        p = os.path.join(ROOT, rel)
        for t in texts(p):
            if len(t) < 3 or t in ALLOW:
                continue
            if 'important' in t or '!=' in t:
                continue
            why = None
            if re.search(r'[A-Za-z]{3,}', t) and BANG.search(t):
                why = 'exclamation'
            elif EXPRESSIVE.search(t) or ESCAPED.search(t):
                why = 'expressive emoji'
            elif WORDS.search(t):
                why = 'hype/joke/scold: ' + WORDS.search(t).group(0)
            if why:
                bad.append('%s: %s  [%s]' % (rel, t[:120], why))
    if bad:
        print('REGISTER: %d line(s) outside the cold mechanical register' % len(bad))
        for b in bad[:60]:
            print('  ' + b)
        return 1
    print('REGISTER: CLEAN -- every player-facing line states the fact (%d pages)' % len(targets))
    return 0


if __name__ == '__main__':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.exit(main(sys.argv[1:]))
