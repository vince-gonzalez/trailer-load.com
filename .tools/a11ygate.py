# a11ygate.py · run my a11yhat crew (WCAG 2.2, DHS Trusted Tester method, 0 model calls) on every public page.
# Exit 1 on any automated FAIL, so a page never ships with a failure a machine can find.
# REVIEW items are not failures; they are the checks a person runs by hand.
# Usage: python .tools/a11ygate.py
import json
import os
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A11YHAT = os.environ.get('A11YHAT_HOME', r'C:\Users\Admin\Desktop\a11yhat')


def public_pages():
    out = subprocess.run(['git', 'ls-files', '*.html'], cwd=REPO, capture_output=True, text=True, check=True)
    return [p for p in out.stdout.split() if not p.startswith('.')]


def main():
    pages = public_pages()
    if not pages:
        print('a11ygate: no public pages found, refusing to pass')
        return 1
    fails = 0
    for p in pages:
        r = subprocess.run([sys.executable, '-m', 'a11yhat', os.path.join(REPO, p), '--json'], cwd=A11YHAT,
                           capture_output=True, text=True, encoding='utf-8')
        try:
            recs = json.loads(r.stdout)
        except ValueError:
            print('a11ygate: %s: a11yhat gave no JSON: %s' % (p, (r.stderr or r.stdout)[:200]))
            return 1
        bad = [x for x in recs if x['status'] == 'FAIL']
        fails += len(bad)
        for x in bad:
            print('FAIL %s %s %s: %s' % (p, x['sc'], x['name'], '; '.join(str(d) for d in (x.get('detail') or []))[:300]))
    print('a11ygate: %d pages, %d automated FAIL' % (len(pages), fails))
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(main())
