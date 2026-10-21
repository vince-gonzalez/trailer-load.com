# The LOCK IN API

The LOCK IN backend: one serverless worker and one SQL database behind the site's own `/api`. It replaced the
hosted database 4.0 was first built on, in 3.9.1007. Every page calls `/api`, and no page carries a key.

| File | What it is |
|---|---|
| `lockin-api.js` | The worker. `/api/rpc/<name>` runs the 20 functions the game and the dashboard use (the same names, inputs and answers as the 4.0 database functions in `.db/lockin-4.0.sql`). `/api/auth/<action>` is the instructor account. |
| `schema.sql` | The tables, with `{P}` where the table prefix goes. |
| `render.py` | Fills in the prefix: `lab_` for the sandbox, `li_` for production. It refuses anything else. |

## The two places, one database

The hosting account's free plan allows 10 databases and the account already had 9, so the sandbox and production
share the database `trailer-load`. The sandbox uses the `lab_` tables and production the `li_` tables. The worker
reads its prefix from `TABLE_PREFIX` and never touches the other set.

- **Sandbox:** the lab worker (`.staging/worker.js`) hands `/api/*` to this code.
- **Production:** not set up yet. Live is still 3.9.999 on the old backend.

## The instructor account

Sign up (confirmed by email), sign in, sign out, change the password (every other device signs out and the
account is emailed), forgot and reset by email, and an unlock link by email after 5 wrong passwords. The sign-in
is an HttpOnly cookie the page cannot read. Passwords are 12 characters or more.

The email sender is three settings: `MAIL_API` (its send address), `MAIL_KEY` (its key, kept as a secret) and
`MAIL_FROM`. With no sender set, every email is written to the `outbox` table instead, so the sandbox can test
every link without sending anything.

## The free plan's limits, measured 2026-10-21

- **CPU:** 10 ms per request, with some built-in flexibility for a worker that runs over now and then. Measured on
  the lab: the public calls take 1 to 3 ms, a PIN join about 5 ms, a sign-in 4 to 13 ms, a password change 7 to 22.
- **Writes:** 100,000 rows a day, shared by every database on the account. Daily caps on visits, event totals and
  board signatures keep LOCK IN from using up that budget.

## Shipping it to production (only on Vince's go, in this order)

1. `python api/render.py li_ <file>`, then apply that file to `trailer-load`.
2. A production worker on the route `www.trailer-load.com/api/*`, with `TABLE_PREFIX` set to `li_`.
3. The email sender's three settings.
4. The privacy policy and the districts page say what is actually true.
5. Merge staging into main, push, and verify the live site.
6. Retire the old backend. That is a permanent deletion and it is Vince's click.

## Tests

They live in a private test kit outside this repository: every call on a local copy of the database, the
dashboard and the game against the API, the deployed sandbox end to end (deleting what it makes), and the CPU each
call uses, read from the worker's own log.
