# THE LAB — private test suite for trailer-load.com

**Nothing in this folder can reach the live site.** Read that first, then the
rest.

## The two environments

| | PRODUCTION | THE LAB |
|---|---|---|
| URL | https://www.trailer-load.com | https://trailer-load-lab.vince-848.workers.dev |
| Host | **GitHub Pages** | **Cloudflare Workers** |
| Branch | `main` | whatever is checked out when you deploy |
| Deploys when | you push to `main` | you run the deploy command, never automatically |
| Indexed by search | yes | **no.** Full `Disallow: /` plus `X-Robots-Tag: noindex` on every response |

They share a git repository and **nothing else.** No shared host, no shared
pipeline, no shared DNS record. A lab deploy cannot touch production even if it
is completely broken.

## The loop

```bash
git checkout staging          # break things here, never on main
# ...edit...
npx wrangler deploy -c .staging/wrangler.jsonc
# ...test at the workers.dev URL...
```

When a change is actually good:

```bash
git checkout main
git merge staging
git push                      # GitHub Pages picks it up, and only now
```

The deploy command is run **from the repository root**, not from inside
`.staging`.

## Why the routing config looks fussy

GitHub Pages serves `/lock-in.html` literally and resolves `/dashboard/` to its
`index.html`. The Workers asset server has no single mode that does both:

- `html_handling: "auto-trailing-slash"` resolves directories but
  **307-redirects every `.html` link**, which breaks every link in the product.
- `html_handling: "none"` serves `.html` literally but **404s every directory**.

Both failures were measured on a real deploy, not guessed. So `html_handling` is
`"none"` and the directory case is resolved inside `worker.js`. The result is
byte-for-byte route parity with production.

`run_worker_first: true` matters too. Without it, a matching asset is returned
*before* `worker.js` runs, so the robots override and the noindex header silently
never fire. The first deploy shipped the live permissive `robots.txt` because of
exactly this.

## How to verify the lab is honest

Line endings differ between a Windows working copy (CRLF) and what GitHub checks
out (LF), so a raw byte count will always disagree. Compare content, not size:

```bash
curl -s https://trailer-load-lab.vince-848.workers.dev/lock-in.html | tr -d '\r' | sha256sum
curl -sL https://www.trailer-load.com/lock-in.html              | tr -d '\r' | sha256sum
```

Verified 2026-10-01: identical, `445750a968007db9...`

`index.html` will NOT match, and that is expected. Cloudflare's Email Address
Obfuscation rewrites the `mailto:` links on production at the edge and injects a
decoder script. The lab sees the real source; production serves the rewritten
version.

## Standing rules, unchanged in the lab

- No AdSense. Ever.
- No third-party analytics. No tracking pixels.
- The lab is never linked to publicly and never given to a prospect.
