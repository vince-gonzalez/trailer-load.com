# nonames.py · no company, carrier or product name in anything this repository serves or publishes: pages, code,
# comments, docs. LOCK IN is built near my employer, and a carrier's service name on a box or a company name in a
# comment reads as copying or affiliation. Exit 1 on any hit. (2026-10-21, my rule: "MAKE SURE YOUR CODE COMMENTARY
# STAYS ABOVE BOARD BUT DOES NOT MENTION FEDEX AT ALL WHATSOEVER ... NOR EXPRESS OR ANY MAJOR BUSINESS.")
#
# The box words that stay were checked at the trademark office on 2026-10-21: the carriers' own registrations had to
# disclaim SAME DAY, OVERNIGHT, NEXT DAY AIR, 2DAY and GROUND, so those words belong to nobody. What a carrier owns is
# the word joined to its name or styling, so these stay banned: SAMEDAY, PRIORITY OVERNIGHT, NEXT DAY AIR, MEDIA MAIL,
# and EXPRESS and PRIORITY on their own.
#
# Usage: python .tools/nonames.py
import io
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {'.git', '.claude', 'node_modules', 'fonts', '.wrangler',
             '.tools',        # the gates name what they look for
             '.changelog',    # history, kept as it was written
             '.db'}           # the retired backend's SQL, deleted when 4.0 ships
TEXT = ('.html', '.htm', '.js', '.css', '.txt', '.xml', '.json', '.jsonc', '.md', '.py', '.sql', '.webmanifest')

NAMES = re.compile(
    r'fedex|federal express|(?<![\w-])ups(?![\w-])|\busps\b|\bdhl\b|amazon|walmart|post office|'
    r'google|gemini|dall-e|openai|anthropic|claude|supabase|cloudflare|github|'
    r'\bexpress\b|\bpriority\b|sameday|next day air|media mail', re.I)

# Where a name has to stay, and why. (file, the line must also match this, reason)
ALLOW = [
    ('robots.txt', r'^\s*User-agent:\s*\S+\s*$', 'a crawler is blocked by its name'),
    ('sitemap.xml', r'priority', 'the sitemap format has a <priority> field'),
    ('terms.html', r'EXPRESS OR IMPLIED', 'warranty language'),
    ('privacy.html', r'cloudflare|github|google analytics', 'a privacy policy names who processes the data'),
    ('for-districts/index.html', r'cloudflare|github|google analytics', 'the subprocessor list names them; a reviewer is told what is not used'),
]


def tracked():
    out = subprocess.run(['git', 'ls-files', '-co', '--exclude-standard'], cwd=ROOT, capture_output=True, text=True, check=True)
    untracked = subprocess.run(['git', 'ls-files', '-o', '--exclude-standard'], cwd=ROOT, capture_output=True, text=True, check=True)
    return set(out.stdout.split('\n')) - {''}, set(untracked.stdout.split('\n')) - {''}


# Everything the repository holds or would hold with its next commit. An untracked note at the top level (another
# session's working file) is not scanned; it is named in the result so it is never committed by accident.
def files():
    every, untracked = tracked()
    notes = sorted(f for f in untracked if '/' not in f and f.lower().endswith('.md'))
    for rel in sorted(every):
        if rel in notes or rel.split('/')[0] in SKIP_DIRS or not rel.lower().endswith(TEXT):
            continue
        if os.path.exists(os.path.join(ROOT, rel)):
            yield rel
    files.notes = notes


def allowed(rel, line):
    for f, rx, _ in ALLOW:
        if rel == f and re.search(rx, line, re.I):
            # the allowance covers only the names its reason is about
            rest = re.sub(rx, '', line, flags=re.I)
            return not NAMES.search(rest)
    return False


def main():
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')   # a hit line can carry any character
    except (AttributeError, ValueError):
        pass
    hits, n = [], 0
    for rel in sorted(files()):
        n += 1
        try:
            text = io.open(os.path.join(ROOT, rel), encoding='utf-8').read()
        except UnicodeDecodeError:
            continue
        for i, ln in enumerate(text.splitlines(), 1):
            m = NAMES.search(ln)
            if m and not allowed(rel, ln):
                hits.append('%s:%d  "%s"  %s' % (rel, i, m.group(0), ln.strip()[:110]))
    for h in hits:
        print('  ' + h)
    if hits:
        print('NO NAMES: %d HIT(S) in %d files' % (len(hits), n))
        return 1
    print('NO NAMES: CLEAN -- no company, carrier or product name in %d files (%d allowed by reason)%s' % (
        n, len(ALLOW), ('; not scanned, never commit: ' + ', '.join(files.notes)) if getattr(files, 'notes', None) else ''))
    return 0


if __name__ == '__main__':
    sys.exit(main())
