# render.py <prefix> [script] [out] · fill {P} (lockin_ for production, lis_ for the sandbox); writes UTF-8 to out or stdout
import os, sys
P = sys.argv[1] if len(sys.argv) > 1 else ''
if P not in ('lockin_', 'lis_'):
    raise SystemExit('usage: python render.py lockin_|lis_ [script] [out]')
here = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(here, sys.argv[2] if len(sys.argv) > 2 else 'lockin-4.0.sql'), encoding='utf-8').read()
out = src.replace('{P}', P)
if '{' + 'P}' in out:
    raise SystemExit('unfilled prefix')
if len(sys.argv) > 3:
    open(sys.argv[3], 'w', encoding='utf-8', newline='\n').write(out)
else:
    sys.stdout.buffer.write(out.encode('utf-8'))
