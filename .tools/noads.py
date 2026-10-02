# -*- coding: utf-8 -*-
"""
SHIP GATE: no ad tech, and no off-domain promotion, on trailer-load.com. Ever.

This is a standing order, not a preference:
  "STRIP THE ADSENSE. ALL THE WAY. NO ADSENSE ON TRAILER-LOAD.COM. EVER AGAIN."

It is also a published promise, in two places a district reviewer reads:
  for-districts/index.html  "No advertising and no ad technology of any kind,
                             anywhere on the domain. Advertising was removed
                             permanently and is barred."
  privacy.html              "There is no advertising and no ad technology of any
                             kind on this site."

WHY THIS GATE EXISTS: ad content has now reached this domain TWICE. AdSense in
July 2026 (stripped in v3.5.155), and on 2026-08-10 a promotional banner for
5best2buy.com — a monetised affiliate property — landed in the homepage footer,
directly under the section promising there is no advertising anywhere on the
domain. Neither tagcheck, parsecheck nor typefloor could see it: the markup was
balanced, there was no script, and every font-size was above the floor. A defect
no gate can see will come back.

TWO CHECKS
  1. Ad-tech signatures anywhere in the public pages, plus an ads.txt in the root.
  2. EVERY external host must be on the allowlist below. This is the check that
     catches promotion, embeds, trackers and CDNs in one rule, including ones
     nobody has thought of yet.

Exit 0 = clean. Exit 1 = something got in.
"""
import io, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PAGES = ['index.html', 'lock-in.html', 'privacy.html', 'terms.html',
         'ss/index.html', 'me/index.html', 'dashboard/index.html',
         'for-districts/index.html', 'for-districts/program-overview.html',
         'llms.txt', 'llms-full.txt', 'robots.txt', 'sitemap.xml']

# Every host the product legitimately reaches. Adding one is a deliberate act:
# it means a district reviewer will see that domain in devtools.
ALLOWED = {
    'trailer-load.com', 'www.trailer-load.com',   # self
    'www.f-keys.com',                             # the company that makes it
    'igqpgsqogfrpujdgvefs.supabase.co',           # the backend, disclosed in the privacy policy
    'schema.org',                                 # JSON-LD vocabulary
    'www.w3.org',                                 # SVG/XML namespace
    'www.sitemaps.org',                           # sitemap schema
    # Stripe card checkout for the published pricing tiers. A payment processor,
    # not ad tech: no script is loaded from it, these are plain <a href> links the
    # buyer clicks on purpose, and no card detail ever touches this domain. Added
    # 2026-10-01 because the gate had flagged it on every run since the buy buttons
    # shipped, and a gate with a standing false positive is a gate nobody reads.
    'buy.stripe.com',
}

AD_SIGNATURES = [
    'adsbygoogle', 'googlesyndication', 'pagead', 'adsense', 'doubleclick',
    'amazon-adsystem', 'carbonads', 'media.net', 'taboola', 'outbrain',
    'ezoic', 'mediavine', 'adthrive', 'googletagmanager', 'google-analytics',
    'gtag(', 'fbq(', 'facebook.net', 'hotjar', 'clarity.ms', 'segment.com',
    'mixpanel', 'amplitude.com', 'data-ad-client', 'data-ad-slot',
]

HOST_RX = re.compile(r'https?://([a-zA-Z0-9\.\-]+)')

# lock-in.html carries ~600 lines of CHANGE LOG describing, among other things, the
# removal of AdSense and GA4. Those lines name the tech on purpose and are history,
# not live code. Commented-out text cannot execute or render, so blank it before
# scanning -- but blank it IN PLACE, so reported line numbers stay true.
COMMENTS = [re.compile(r'<!--.*?-->', re.S),      # HTML
            re.compile(r'/\*.*?\*/', re.S)]       # CSS and JS block


def strip_comments(src):
    def blank(m):
        return re.sub(r'[^\n]', ' ', m.group(0))
    for rx in COMMENTS:
        src = rx.sub(blank, src)
    return src


def main():
    fails = []

    # an ads.txt in the root is an advertising declaration by itself
    if os.path.exists(os.path.join(ROOT, 'ads.txt')):
        fails.append(('ads.txt', 0, 'ads.txt exists in the repo root — that file IS an ad declaration'))

    for rel in PAGES:
        path = os.path.join(ROOT, rel)
        if not os.path.exists(path):
            continue
        src = strip_comments(io.open(path, encoding='utf-8').read())
        for n, line in enumerate(src.split('\n'), 1):
            low = line.lower()
            for sig in AD_SIGNATURES:
                if sig in low:
                    fails.append((rel, n, 'AD TECH SIGNATURE "%s"' % sig))
            for host in HOST_RX.findall(line):
                if host not in ALLOWED:
                    fails.append((rel, n, 'OFF-DOMAIN HOST "%s" is not on the allowlist' % host))

    if fails:
        print('')
        seen = set()
        for rel, n, msg in fails:
            key = (rel, msg)
            if key in seen:
                continue
            seen.add(key)
            print('  %-34s :%-5s %s' % (rel, n or '-', msg))
        print('')
        print('NO-ADS GATE: %d VIOLATION(S).' % len(seen))
        print('trailer-load.com publishes "no advertising and no ad technology of any')
        print('kind, anywhere on the domain" on the page district IT reviewers read.')
        print('If a host genuinely belongs, add it to ALLOWED in this file deliberately.')
        return 1

    print('NO-ADS GATE: CLEAN — no ad tech, no off-domain hosts.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
