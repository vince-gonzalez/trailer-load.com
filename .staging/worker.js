/* ═══════════════════════════════════════════════════════════════════════
   TRAILER-LOAD LAB — static asset server for the private test suite
   F-Keys Creative LLC

   Does three things and nothing else:
     1. serves the repo as static files
     2. stamps X-Robots-Tag: noindex, nofollow on EVERY response
     3. overrides /robots.txt with a full Disallow, so the live robots.txt
        in the repo root is never the one a crawler reads here

   No analytics. No tracking. No ads. Same standing rules as production.
   ═══════════════════════════════════════════════════════════════════════ */

var ROBOTS = 'User-agent: *\nDisallow: /\n';

export default {
  async fetch(request, env) {
    var url = new URL(request.url);

    // /robots.txt NEVER comes from the asset bundle on the lab build.
    if (url.pathname === '/robots.txt') {
      return new Response(ROBOTS, {
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'x-robots-tag': 'noindex, nofollow',
          'cache-control': 'no-store'
        }
      });
    }

    // ── GITHUB PAGES ROUTING PARITY ──────────────────────────────────────
    // Production is GitHub Pages. It serves "/lock-in.html" LITERALLY (no
    // redirect) and resolves a directory to its index.html. No single
    // html_handling mode does both: "auto-trailing-slash" 307s every .html
    // link, and "none" 404s every directory. So html_handling is "none" and
    // the directory case is resolved here. Measured both failures on deploy.
    var p = url.pathname;
    if (p.charAt(p.length - 1) === '/') p = p + 'index.html';
    else if (!/\.[a-z0-9]+$/i.test(p)) p = p + '/index.html';

    var res;
    if (p !== url.pathname) {
      var u2 = new URL(request.url);
      u2.pathname = p;
      res = await env.ASSETS.fetch(new Request(u2.toString(), request));
    } else {
      res = await env.ASSETS.fetch(request);
    }

    // Clone so the headers are mutable, then stamp every single response.
    var out = new Response(res.body, res);
    out.headers.set('x-robots-tag', 'noindex, nofollow, noarchive, nosnippet');
    out.headers.set('x-lab-build', env.LAB_LABEL || 'TEST SUITE');
    // A lab build must never be cached by an intermediary as if it were live.
    out.headers.set('cache-control', 'no-store, max-age=0');
    return out;
  }
};
