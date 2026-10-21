# deadcss.py · every CSS rule must style something that exists. Usage: python .tools/deadcss.py [--fix] [page ...]
# (default: every served .html page). Exit 1 when a dead selector is found; --fix removes them and writes the page.
#
# Why this exists: 4.0 cut Tour, the Mini-Games menu and Smalls Sort, and left ~200 lines of styles for screens that no
# longer exist. A selector is DEAD when it requires an id or a class (outside :not(...)) whose name appears nowhere in
# the page except inside its <style> blocks: not in the markup, not in a script string, not in a comment. A name a
# script finishes at run time counts as written: any string ending in a class prefix that is then concatenated
# ('msg-'+type) keeps every name with that prefix alive. The first --fix lacked that rule and removed the live
# .msg-ok / .msg-warn / .msg-danger / .msg-award colors of the dispatch line; built names are kept now.
# A rule loses its dead selectors; a rule left with none is removed; an @media block left empty is removed. A
# @keyframes that no animation and no script names is dead too (five were left behind when their rules went).
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP = {'.git', '.tools', '.changelog', '.db', '.claude', '.staging', 'node_modules'}


def pages():
    out = []
    for d, dirs, files in os.walk(ROOT):
        dirs[:] = [x for x in dirs if x not in SKIP and not x.startswith('.')]
        out += [os.path.join(d, f) for f in files if f.endswith('.html')]
    return sorted(out)


def tokens(selector):
    s = re.sub(r':not\((?:[^()]|\([^()]*\))*\)', '', selector)      # a :not(.x) never requires .x
    s = re.sub(r'\[[^\]]*\]', '', s)                                   # attribute selectors name no class or id
    s = re.sub(r'::?[a-zA-Z-]+(\([^)]*\))?', '', s)                    # pseudo-classes and pseudo-elements
    return re.findall(r'[.#](-?[_a-zA-Z][\w-]*)', s)


def is_alive(name, alive):
    # written somewhere outside the styles, or finished at run time from a string a script writes ('msg-'+type)
    return name in alive or any(rx.fullmatch(name) for rx in alive.built)


class Alive(set):
    built = ()


def alive_names(outside):
    alive = Alive(re.findall(r'[\w-]+', outside))
    # a string ending in a class-name prefix that is then concatenated: 'msg-'+type keeps msg-anything alive, and
    # 'lb-'+which+'-today' keeps only lb-anything-today (the literal after the variable part is required too)
    built = set()
    for m in re.finditer(r"""['"`]([^'"`\n]{0,60})['"`]\s*\+\s*[\w$.\[\]()]+(\s*\+\s*['"`]([\w-]*))?""", outside):
        t = re.findall(r'([A-Za-z][\w-]*[-_])$', m.group(1))
        if t:
            built.add(re.escape(t[0]) + r'[\w-]+' + re.escape(m.group(3) or ''))
    alive.built = tuple(re.compile(b) for b in sorted(built))
    return alive


def walk(css, alive, dead, out):
    # rewrite one block of CSS, dropping dead selectors and empty rules; returns the new text
    i, n, res = 0, len(css), []
    while i < n:
        j = css.find('{', i)
        if j < 0:
            res.append(css[i:]); break
        head = css[i:j]
        # the body runs to the matching brace
        depth, k = 0, j
        while k < n:
            if css[k] == '{': depth += 1
            elif css[k] == '}':
                depth -= 1
                if depth == 0: break
            k += 1
        body = css[j + 1:k]
        # keep comments and whitespace that sit before the selector
        m = re.match(r'(\s*(?:/\*.*?\*/\s*)*)(.*)$', head, re.S)
        lead, sel = m.group(1), m.group(2)
        if sel.strip().startswith('@'):
            if re.match(r'\s*@(media|supports)', sel):
                inner = walk(body, alive, dead, out)
                if inner.strip() and re.search(r'\{', inner):
                    res.append(lead + sel + '{' + inner + '}')
                else:
                    res.append(lead)
            else:
                kf = re.match(r'\s*@(?:-webkit-)?keyframes\s+([\w-]+)', sel)
                if kf and kf.group(1) not in alive.keyframes:
                    dead.append(('@keyframes ' + kf.group(1), [kf.group(1)]))
                    res.append(lead)
                else:
                    res.append(head + '{' + body + '}')
        else:
            parts = [p for p in re.split(r',(?![^(]*\))', sel)]
            keep = []
            for p in parts:
                missing = [t for t in tokens(p) if not is_alive(t, alive)]
                if missing:
                    dead.append((p.strip(), missing))
                else:
                    keep.append(p)
            if keep:
                if len(keep) == len(parts):
                    res.append(head + '{' + body + '}')
                else:
                    res.append(lead + ','.join(keep).strip('\n') + '{' + body + '}')
            else:
                res.append(lead)
        i = k + 1
    return ''.join(res)


def scan(path, fix):
    raw = io.open(path, 'rb').read().decode('utf-8')
    crlf = '\r\n' in raw
    src = raw.replace('\r\n', '\n')
    styles = list(re.finditer(r'(<style[^>]*>)(.*?)(</style>)', src, re.S))
    outside = re.sub(r'<style[^>]*>.*?</style>', ' ', src, flags=re.S)
    alive = alive_names(outside)
    # a @keyframes is alive when its name is used anywhere besides its own declaration (an animation rule, a script)
    alive.keyframes = set()
    for name in set(re.findall(r'@(?:-webkit-)?keyframes\s+([\w-]+)', src)):
        word = r'(?<![\w-])' + re.escape(name) + r'(?![\w-])'
        if len(re.findall(word, src)) > len(re.findall(r'@(?:-webkit-)?keyframes\s+' + word, src)):
            alive.keyframes.add(name)
    dead = []
    new = src
    for m in reversed(styles):
        body = m.group(2)
        nb = walk(body, alive, dead, None)
        if fix:
            nb = re.sub(r'\n(?:[ \t]*\n){2,}', '\n\n', nb)                 # a removed rule leaves no run of blank lines
        new = new[:m.start(2)] + nb + new[m.end(2):]
    if fix and new != src:
        out = new.replace('\n', '\r\n') if crlf else new
        tmp = path + '.deadcss'
        open(tmp, 'wb').write(out.encode('utf-8'))
        os.replace(tmp, path)
    return dead, src.count('\n') - new.count('\n')


def main(argv):
    fix = '--fix' in argv
    targets = [os.path.abspath(a) for a in argv if a != '--fix'] or pages()
    total = 0
    for p in targets:
        dead, removed = scan(p, fix)
        if dead:
            total += len(dead)
            rel = os.path.relpath(p, ROOT).replace(os.sep, '/')
            print('%s: %d dead selector(s)%s' % (rel, len(dead), (' removed, %d lines' % removed) if fix else ''))
            for s, miss in dead[:400 if fix else 25]:
                print('   %s   [nothing named %s]' % (s[:90], ', '.join(miss)))
    if total and not fix:
        print('DEAD CSS: %d selector(s) style nothing that exists' % total)
        return 1
    print('DEAD CSS: %s' % ('CLEAN -- every selector can match something' if not total else 'removed %d selector(s)' % total))
    return 0


if __name__ == '__main__':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.exit(main(sys.argv[1:]))
