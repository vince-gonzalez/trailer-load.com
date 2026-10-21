# render.py <lab_|li_> <out.sql> · write api/schema.sql with its table prefix filled in.
#
# The sandbox and production share the database "trailer-load" (the free plan's 10-database limit), so every table
# name in schema.sql carries {P}. lab_ is the sandbox, li_ is production. Any other prefix is refused, and so is a
# rendered file with a {P} left in it or a table name that lacks the prefix.
#
# Apply it with the host's database command, run from the repository root against .staging/wrangler.jsonc (the
# exact command is in the private test kit, next to sandbox_build.py):
#   python api/render.py lab_ <out.sql>
import io
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def render(prefix):
    if prefix not in ('lab_', 'li_'):
        raise SystemExit('REFUSED: the prefix is lab_ (the sandbox) or li_ (production), not %r' % prefix)
    s = io.open(os.path.join(HERE, 'schema.sql'), encoding='utf-8').read().replace('{P}', prefix)
    if '{P}' in s:
        raise SystemExit('REFUSED: a {P} is left in the rendered schema')
    names = re.findall(r'(?:TABLE|INDEX)\s+IF\s+NOT\s+EXISTS\s+(\w+)|INSERT\s+OR\s+IGNORE\s+INTO\s+(\w+)|REFERENCES\s+(\w+)|\bON\s+(\w+)\s*\(', s, re.I)
    bad = sorted({n for g in names for n in g if n and not n.startswith(prefix)})
    if bad:
        raise SystemExit('REFUSED: names without the %s prefix: %s' % (prefix, ', '.join(bad)))
    return s


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('usage: python api/render.py <lab_|li_> <out.sql>')
    out = render(sys.argv[1])
    io.open(sys.argv[2], 'w', encoding='utf-8', newline='\n').write(out)
    print('rendered %s schema: %d tables, %d indexes -> %s' % (
        sys.argv[1], len(re.findall(r'CREATE TABLE', out)), len(re.findall(r'CREATE (?:UNIQUE )?INDEX', out)), sys.argv[2]))
