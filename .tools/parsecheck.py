# -*- coding: utf-8 -*-
"""
SHIP GATE: every inline <script> on every public page must PARSE.

Why this exists: on 2026-08-01 a slice-based edit to dashboard/index.html emitted
"Unexpected token ')'". Nothing else in the pipeline would have caught it before
Cloudflare served it. Run this before every commit, alongside tagcheck.py.

Skips <script src=...> (external, nothing inline to parse) and
type="application/ld+json" (data, not JavaScript).

Exit 0 = all clean. Exit 1 = at least one block failed to parse.
"""
import io, os, re, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = [
    'index.html', 'lock-in.html', 'privacy.html', 'terms.html',
    'ss/index.html', 'me/index.html', 'dashboard/index.html',
    'for-districts/index.html', 'for-districts/program-overview.html',
    # 2026-10-03: the 10-02 rebuild added these and the list was never updated, so the gate
    # silently skipped /programs/ (pricing + FAQ structured data) and /day1/, both with scripts.
    'programs/index.html', 'daily/index.html', 'day1/index.html',
]
OPEN_TAG = re.compile(r'<script\b([^>]*)>', re.I)

def blocks(src):
    """Yield (line_number, attrs, body) for each inline script."""
    out = []
    for m in OPEN_TAG.finditer(src):
        attrs = m.group(1)
        end = src.find('</script>', m.end())
        if end < 0:
            continue
        out.append((src.count('\n', 0, m.start()) + 1, attrs, src[m.end():end]))
    return out

def main():
    failures = 0
    checked = 0
    for rel in PAGES:
        path = os.path.join(ROOT, rel)
        if not os.path.exists(path):
            print('MISSING  %s' % rel)
            failures += 1
            continue
        src = io.open(path, encoding='utf-8').read()
        for line, attrs, body in blocks(src):
            low = attrs.lower()
            if 'src=' in low or 'ld+json' in low:
                continue
            if not body.strip():
                continue
            checked += 1
            fd, tmp = tempfile.mkstemp(suffix='.js')
            os.close(fd)
            io.open(tmp, 'w', encoding='utf-8').write(body)
            proc = subprocess.Popen(['node', '--check', tmp],
                                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
            out = proc.communicate()[0].decode('utf-8', 'replace')
            os.unlink(tmp)
            if proc.returncode != 0:
                failures += 1
                print('PARSE FAIL  %s  (inline script opening at line %d)' % (rel, line))
                # node reports a line number relative to the block; translate it back
                for ln in out.splitlines():
                    hit = re.search(r'\.js:(\d+)', ln)
                    if hit:
                        print('   -> page line ~%d' % (line + int(hit.group(1))))
                    print('   ' + ln.rstrip())

    if failures:
        print('\nSCRIPT PARSE: %d FAILURE(S) across %d blocks' % (failures, checked))
        return 1
    print('SCRIPT PARSE: ALL %d INLINE BLOCKS CLEAN' % checked)
    return 0

if __name__ == '__main__':
    sys.exit(main())
