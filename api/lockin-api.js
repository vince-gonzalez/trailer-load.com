// ============================================================
// LOCK IN API v1.0.0
// The LOCK IN backend: one serverless worker and one SQL database behind the site's own /api. It replaced the
// hosted database 4.0 was first built on.
// F-Keys LLC | www.f-keys.com
// ============================================================
//
// WORKFLOW STACK:
//   1. handleApi(request, env) answers every POST under /api/ (the game, the front page and the dashboard).
//   2. /api/rpc/<name> runs one of the functions the 4.0 SQL had, with the same names, inputs and answers, so the game
//      and the dashboard changed only their address. Public calls need nothing; instructor calls need the sign-in cookie.
//   3. /api/auth/<action> is the instructor account: sign up, confirm by email, sign in, sign out, change the
//      password, forgot / reset by email, unlock by email after 5 wrong passwords.
//   4. Email goes out through an outside sender when env.MAIL_API and env.MAIL_KEY are set; with no sender (the sandbox
//      today) it is
//      written to the outbox table so every link can still be tested.
//
// ASSET MANIFEST: env.DB (the database "trailer-load"), env.TABLE_PREFIX ("lab_" sandbox, "li_" production),
//   env.MAIL_API + env.MAIL_KEY + env.MAIL_FROM (the email sender: its send address, its key as a secret, and the From
//   line; all optional), WebCrypto (hashing, random).
//
// BOOT ORDER: nothing at load. Each request: guard (method, size, same origin) -> route -> one handler -> JSON.
//
// THE FREE PLAN, MEASURED 2026-10-21: 10 ms of CPU per request, 100,000 database rows written per day shared by every
// database on the account, 50 queries per request. So: PBKDF2 at 15,000 rounds (about 5 ms), a 12-character
// minimum password and a lock after 5 wrong tries to make up for the rounds, and daily caps on the counters and the
// board so LOCK IN can never spend the write budget the account's other databases need.
// ============================================================

var PW_ITER = 15000;                 // PBKDF2 rounds for instructor passwords: about 5 ms of the free plan's 10 ms CPU
// PBKDF2 rounds for a crew member's 4-digit PIN. A PIN has 10,000 possible values, so no round count stops someone who
// has the table from trying them all; the 5-wrong-PIN lock is what protects a PIN. At 15,000 rounds a join cost about
// 8 ms of CPU (measured on the lab, 2026-10-21), and a class joining at once would run the free plan's 10 ms limit
// request after request. Changing this number makes every saved PIN fail once; the instructor's RESET PIN clears it.
var PIN_ITER = 1000;
var PW_MIN = 12;                     // instructor password minimum
var LOCK_AFTER = 5;                  // wrong passwords or PINs before a 15-minute lock
var LOCK_MIN = 15;
var SESSION_HOURS = 12;               // 3.9.1009 an instructor's sign-in lasts a working day, not two weeks (shared lab computers)
var CAP_VISITS = 5000;               // daily caps that protect the account's shared write budget
var CAP_EVENTS = 5000;
var CAP_BOARD = 2000;
var MAX_BODY = 1200000;              // a crew session with its move log stays under about 1 MB
var SIGNUPS_PER_HOUR = 60;           // new instructor accounts across the whole site
// how many emails of a kind one account can be sent: [count, per minutes]. Held-back emails are never an error.
var MAIL_LIMIT = { verify: [3, 60], reset: [1, 5], unlock: [1, 5] };
var ENC = new TextEncoder();
var BAD_INITIALS = ['ASS', 'FUK', 'FUC', 'FCK', 'FKU', 'SHT', 'CUM', 'FAG', 'FGT', 'NIG', 'NGR', 'NGA', 'KKK', 'SEX',
  'DIK', 'DIC', 'COK', 'CNT', 'TIT', 'JIZ', 'HOE', 'KYS', 'RAP', 'RPE', 'NAZ', 'NZI', 'PUS', 'VAG', 'PNS', 'BCH', 'SLT',
  'WHR', 'ANL', 'FAP', 'WTF'];
var EVENTS = ['game_open', 'visitor_new', 'visitor_returning', 'mode_start', 'wall_done', 'daily_submit',
  'briefing_done', 'arcade_signed', 'training_done', 'crew_joined'];
var SEAT_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no 0/O, 1/I/L

// ── small helpers ──────────────────────────────────────────────────────────────────────────────────────────────────
function nowIso() { return new Date().toISOString(); }
function dayUtc() { return new Date().toISOString().slice(0, 10); }
function minutesFrom(min) { return new Date(Date.now() + min * 60000).toISOString(); }
function json(obj, status, headers) {
  var h = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
  var k;
  for (k in (headers || {})) h[k] = headers[k];
  return new Response(JSON.stringify(obj), { status: status || 200, headers: h });
}
function hex(buf) {
  var a = new Uint8Array(buf), s = '', i;
  for (i = 0; i < a.length; i++) s += (a[i] < 16 ? '0' : '') + a[i].toString(16);
  return s;
}
function randHex(bytes) { var a = new Uint8Array(bytes); crypto.getRandomValues(a); return hex(a); }
async function sha256(s) { return hex(await crypto.subtle.digest('SHA-256', ENC.encode(s || ''))); }
async function pbkdf2(secret, saltHex, iter) {
  var key = await crypto.subtle.importKey('raw', ENC.encode(secret), 'PBKDF2', false, ['deriveBits']);
  var salt = new Uint8Array(saltHex.match(/../g).map(function (h) { return parseInt(h, 16); }));
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: iter }, key, 256));
}
function sameHex(a, b) {           // constant-time compare of two hex strings
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  var d = 0, i;
  for (i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function clampInt(v, lo, hi) { v = parseInt(v, 10); if (isNaN(v)) v = 0; return Math.max(lo, Math.min(hi, v)); }
// a whole number, or NaN for anything else (a fraction, text, true, null): the database took integers only
function wholeOf(v) {
  if (typeof v === 'string' && /^-?[0-9]+$/.test(v.trim())) v = Number(v);
  return (typeof v === 'number' && Number.isInteger(v)) ? v : NaN;
}
// an ISO timestamp, or null: the database took timestamptz and refused anything else
function isoOrNull(v) {
  if (typeof v !== 'string' || v.length > 40) return null;
  var t = Date.parse(v);
  return isNaN(t) ? null : new Date(t).toISOString();
}
function str(v) { return (v == null) ? '' : String(v); }
function okEmail(e) { return typeof e === 'string' && e.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); }
function seatCode() {
  var a = new Uint8Array(8), s = '', i;
  crypto.getRandomValues(a);
  for (i = 0; i < 8; i++) s += SEAT_ALPHABET.charAt(a[i] % SEAT_ALPHABET.length);
  return s.slice(0, 4) + '-' + s.slice(4);
}
function cookieOf(request, name) {
  var c = request.headers.get('cookie') || '', m = c.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}

// ── the request ────────────────────────────────────────────────────────────────────────────────────────────────────
// ectx is the Worker's execution context (optional): an email is handed to ectx.waitUntil, so the answer never waits on
// the email sender and takes about the same time whether or not an email went out
export async function handleApi(request, env, ectx) {
  var P = env.TABLE_PREFIX;
  if (P !== 'lab_' && P !== 'li_') return json({ ok: false, err: 'The API is not configured.' }, 500);
  if (!env.DB) return json({ ok: false, err: 'The database is not connected.' }, 500);
  var url = new URL(request.url);
  if (request.method !== 'POST') return json({ ok: false, err: 'POST only.' }, 405);
  var len = parseInt(request.headers.get('content-length') || '0', 10);
  if (len > MAX_BODY) return json({ ok: false, err: 'Too large.' }, 413);
  var text = await request.text();
  if (text.length > MAX_BODY) return json({ ok: false, err: 'Too large.' }, 413);
  var body = {};
  if (text) { try { body = JSON.parse(text); } catch (e) { return json({ ok: false, err: 'Bad request.' }, 400); } }
  if (!body || typeof body !== 'object' || Array.isArray(body)) body = {};
  var ctx = { env: env, P: P, db: env.DB, url: url, request: request, body: body, ectx: ectx || null };
  try {
    var path = url.pathname;
    if (path.indexOf('/api/rpc/') === 0) {
      var fn = path.slice(9);
      if (Object.prototype.hasOwnProperty.call(PUBLIC, fn)) return json(await PUBLIC[fn](ctx));
      if (Object.prototype.hasOwnProperty.call(INSTRUCTOR, fn)) {
        if (!sameOrigin(request, url)) return json({ ok: false, err: 'Wrong origin.' }, 403);
        var who = await sessionOf(ctx);
        if (!who) return json({ ok: false, err: 'Sign in first.' }, 401);
        ctx.who = who;
        return json(await INSTRUCTOR[fn](ctx));
      }
      return json({ ok: false, err: 'No such call.' }, 404);
    }
    if (path.indexOf('/api/auth/') === 0) {
      if (!sameOrigin(request, url)) return json({ ok: false, err: 'Wrong origin.' }, 403);
      var act = path.slice(10);
      if (Object.prototype.hasOwnProperty.call(AUTH, act)) return await AUTH[act](ctx);
      return json({ ok: false, err: 'No such call.' }, 404);
    }
    return json({ ok: false, err: 'Not found.' }, 404);
  } catch (e) {
    console.error('handleApi:', e && e.stack || e);
    return json({ ok: false, err: 'Something went wrong. Try again.' }, 500);
  }
}

// a browser always sends Origin on a POST; the cookie-bearing calls must come from this site
function sameOrigin(request, url) {
  var o = request.headers.get('origin');
  return !!o && o === url.origin;
}

// ── PUBLIC: the arcade, the daily totals, and crew members (no account) ───────────────────────────────────────────
var PUBLIC = {
  arcade_sign: async function (c) {
    var b = c.body, P = c.P;
    var v = str(b.p_initials).replace(/[^A-Za-z]/g, '').toUpperCase();
    if (v.length !== 3) return { ok: false, err: 'Three letters, A to Z.' };
    if (BAD_INITIALS.indexOf(v) >= 0) return { ok: false, err: 'Pick different initials.' };
    var mode = str(b.p_mode);
    if (mode !== 'daily' && mode !== 'shift') return { ok: false, err: 'Unknown mode.' };
    var score = wholeOf(b.p_score), integ = wholeOf(b.p_integrity), pieces = wholeOf(b.p_pieces), pack = wholeOf(b.p_pack);
    if (isNaN(score) || score < 0 || score > 400000 || isNaN(integ) || integ < 0 || integ > 100 ||
        isNaN(pieces) || pieces < 1 || pieces > 340 || isNaN(pack) || pack < 0 || pack > 100) {
      return { ok: false, err: 'That wall does not check out.' };
    }
    var minuteAgo = new Date(Date.now() - 60000).toISOString(), day = dayUtc();
    var busy = await c.db.prepare('SELECT (SELECT count(*) FROM ' + P + 'arcade WHERE created_at > ?) AS recent, (SELECT count(*) FROM ' + P + 'arcade WHERE day = ?) AS today')
      .bind(minuteAgo, day).first();
    if (busy.recent >= 30) return { ok: false, err: 'The board is busy. Try again in a minute.' };
    if (busy.today >= CAP_BOARD) return { ok: false, err: 'The board is full for today. Try again tomorrow.' };
    try {
      await c.db.prepare('INSERT INTO ' + P + 'arcade (day, initials, mode, score, integrity, pieces, pack, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(day, v, mode, score, integ, pieces, pack, nowIso()).run();
    } catch (e) {
      console.error('arcade_sign:', e);
      return { ok: false, err: 'Could not sign the board.' };
    }
    var r = await c.db.prepare('SELECT count(*) + 1 AS rank FROM ' + P + 'arcade WHERE day = ? AND mode = ? AND score > ?').bind(day, mode, score).first();
    return { ok: true, initials: v, rank_today: r.rank };
  },

  arcade_board: async function (c) {
    var b = c.body, P = c.P;
    var mode = str(b.p_mode || 'daily'), scope = str(b.p_scope || 'today'), lim = clampInt(b.p_limit || 20, 1, 100);
    var q = 'SELECT initials, score, integrity, day FROM ' + P + 'arcade WHERE mode = ?' +
      (scope === 'all' ? '' : ' AND day = ?') + ' ORDER BY score DESC, created_at ASC LIMIT ?';
    var st = scope === 'all' ? c.db.prepare(q).bind(mode, lim) : c.db.prepare(q).bind(mode, dayUtc(), lim);
    var rows = (await st.all()).results || [];
    return rows.map(function (r, i) { return { rank: i + 1, initials: r.initials, score: r.score, integrity: r.integrity, day: r.day }; });
  },

  count: async function (c) {
    var b = c.body, P = c.P, ev = str(b.p_event), mode = str(b.p_mode);
    if (EVENTS.indexOf(ev) < 0) return null;
    if (['', 'daily', 'shift', 'training', 'practice'].indexOf(mode) < 0) mode = 'other'; // 3.9.1009 PRACTICE counts as itself
    var day = dayUtc();
    var t = await c.db.prepare('SELECT coalesce(sum(n), 0) AS n FROM ' + P + 'event_counts WHERE day = ?').bind(day).first();
    if (t.n >= CAP_EVENTS) return null;
    await c.db.prepare('INSERT INTO ' + P + 'event_counts (day, event, mode, n) VALUES (?, ?, ?, 1) ON CONFLICT (day, event, mode) DO UPDATE SET n = n + 1')
      .bind(day, ev, mode).run();
    return null;
  },

  visit: async function (c) {
    var P = c.P, day = dayUtc();
    // one row, one write: the running total and today's count move together, and stop at the daily cap
    var r = await c.db.prepare('UPDATE ' + P + "counters SET n = n + 1, day_n = CASE WHEN day = ?1 THEN day_n + 1 ELSE 1 END, day = ?1 WHERE key = 'site_visits' AND (day <> ?1 OR day_n < ?2) RETURNING n")
      .bind(day, CAP_VISITS).first();
    if (r) return r.n;
    var s = await c.db.prepare('SELECT n FROM ' + P + "counters WHERE key = 'site_visits'").first();
    return s ? s.n : 0;
  },

  crew_peek: async function (c) {
    var code = str(c.body.p_code).trim().toLowerCase();
    var cr = await c.db.prepare('SELECT code, name, join_mode FROM ' + c.P + 'crews WHERE code = ?').bind(code).first();
    if (!cr) return { ok: false, err: 'No crew with that code. Check it with your instructor.' };
    return { ok: true, code: cr.code, name: cr.name, mode: cr.join_mode };
  },

  member_join_pin: async function (c) {
    var b = c.body, P = c.P, code = str(b.p_code).trim().toLowerCase(), name = str(b.p_name).trim(), pin = str(b.p_pin);
    var cr = await c.db.prepare('SELECT * FROM ' + P + 'crews WHERE code = ?').bind(code).first();
    if (!cr) return { ok: false, err: 'No crew with that code. Check it with your instructor.' };
    if (cr.join_mode !== 'pin') return { ok: false, err: 'This crew uses personal codes. Enter the code your instructor gave you.' };
    if (name.length < 2 || name.length > 40) return { ok: false, err: 'Enter your name as your instructor knows it (2 to 40 characters).' };
    if (!/^[0-9]{4}$/.test(pin)) return { ok: false, err: 'The PIN is 4 digits.' };
    var m = await c.db.prepare('SELECT * FROM ' + P + 'crew_members WHERE crew_code = ? AND lower(name) = lower(?)').bind(code, name).first();
    var salt;
    if (!m) {
      if (await crewFull(c, code)) return { ok: false, err: 'This crew is full (9 members). Ask your instructor.' };
      salt = randHex(16);
      var id = crypto.randomUUID();
      try {
        await c.db.prepare('INSERT INTO ' + P + 'crew_members (id, crew_code, name, pin_hash, pin_salt, created_at) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(id, code, name, await pbkdf2(pin, salt, PIN_ITER), salt, nowIso()).run();
      } catch (e) { return { ok: false, err: 'That name was just taken. Try again.' }; }
      m = { id: id, name: name };
    } else if (!m.pin_hash) {
      salt = randHex(16);
      await c.db.prepare('UPDATE ' + P + 'crew_members SET pin_hash = ?, pin_salt = ? WHERE id = ?').bind(await pbkdf2(pin, salt, PIN_ITER), salt, m.id).run();
    } else {
      if (m.locked_until && m.locked_until > nowIso()) return { ok: false, err: 'Too many wrong PINs. Try again in 15 minutes, or ask your instructor to reset it.' };
      if (!sameHex(await pbkdf2(pin, m.pin_salt, PIN_ITER), m.pin_hash)) {
        var f = (m.failed || 0) + 1;
        await c.db.prepare('UPDATE ' + P + 'crew_members SET failed = ?, locked_until = ? WHERE id = ?')
          .bind(f, f >= LOCK_AFTER ? minutesFrom(LOCK_MIN) : null, m.id).run();
        return { ok: false, err: 'That name is already in this crew with a different PIN.' };
      }
    }
    return { ok: true, token: await newMemberToken(c, m.id), crew: cr.name, code: cr.code, name: m.name };
  },

  member_join_seat: async function (c) {
    var b = c.body, P = c.P, code = str(b.p_code).trim().toLowerCase(), seat = str(b.p_seat).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    var cr = await c.db.prepare('SELECT * FROM ' + P + 'crews WHERE code = ?').bind(code).first();
    if (!cr) return { ok: false, err: 'No crew with that code. Check it with your instructor.' };
    if (cr.join_mode !== 'manual') return { ok: false, err: 'This crew uses a name and PIN.' };
    if (seat.length !== 8) return { ok: false, err: 'Your personal code has 8 letters and numbers, like ABCD-2345.' };
    var m = await c.db.prepare('SELECT * FROM ' + P + "crew_members WHERE crew_code = ? AND replace(seat_code, '-', '') = ?").bind(code, seat).first();
    if (!m) return { ok: false, err: 'That personal code is not on this crew. Check it with your instructor.' };
    return { ok: true, token: await newMemberToken(c, m.id), crew: cr.name, code: cr.code, name: m.name };
  },

  member_whoami: async function (c) {
    var id = await memberOf(c, c.body.p_token);
    if (!id) return { ok: false };
    var r = await c.db.prepare('SELECT m.name AS name, k.name AS crew, k.code AS code FROM ' + c.P + 'crew_members m JOIN ' + c.P + 'crews k ON k.code = m.crew_code WHERE m.id = ?').bind(id).first();
    return r ? { ok: true, name: r.name, crew: r.crew, code: r.code } : { ok: false };
  },

  member_log_wall: async function (c) {
    var b = c.body, P = c.P, id = await memberOf(c, b.p_token);
    if (!id) return { ok: false, err: 'not in a crew' };
    var recent = await c.db.prepare('SELECT count(*) AS n FROM ' + P + 'crew_walls WHERE member_id = ? AND created_at > ?')
      .bind(id, new Date(Date.now() - 60000).toISOString()).first();
    if (recent.n >= 20) return { ok: false, err: 'too fast' };
    await c.db.prepare('INSERT INTO ' + P + 'crew_walls (member_id, mode, wall_score, pieces, dur_s, integrity, density, incidents, collapses, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, str(b.p_mode).slice(0, 16), clampInt(b.p_score, 0, 400000), clampInt(b.p_pieces, 0, 340), clampInt(b.p_dur, 0, 86400),
        clampInt(b.p_integrity, 0, 100), clampInt(b.p_density, 0, 100), clampInt(b.p_incidents, 0, 1000), clampInt(b.p_collapses, 0, 1000), nowIso()).run();
    return { ok: true };
  },

  member_session: async function (c) {
    var b = c.body, P = c.P, id = await memberOf(c, b.p_token);
    if (!id) return { ok: false, err: 'not in a crew' };
    var summary = JSON.stringify(b.p_summary || {}), incidents = JSON.stringify(b.p_incidents || []), events = JSON.stringify(b.p_events || []);
    if (summary.length + incidents.length + events.length > 1048576) return { ok: false, err: 'session too large' };
    var recent = await c.db.prepare('SELECT count(*) AS n FROM ' + P + 'crew_sessions WHERE member_id = ? AND created_at > ?')
      .bind(id, new Date(Date.now() - 60000).toISOString()).first();
    if (recent.n >= 6) return { ok: false, err: 'too fast' };
    await c.db.prepare('INSERT INTO ' + P + 'crew_sessions (member_id, mode, app_ver, started_at, ended_at, duration_s, summary, incidents, events, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, str(b.p_mode).slice(0, 16), b.p_app_ver == null ? null : str(b.p_app_ver).slice(0, 16), isoOrNull(b.p_started), isoOrNull(b.p_ended),
        clampInt(b.p_duration, 0, 86400), summary, incidents, events, nowIso()).run();
    return { ok: true };
  },

  member_leave: async function (c) {
    var t = str(c.body.p_token);
    if (t) await c.db.prepare('DELETE FROM ' + c.P + 'crew_tokens WHERE token_hash = ?').bind(await sha256(t)).run();
    return { ok: true };
  }
};

async function crewFull(c, code) {
  var r = await c.db.prepare('SELECT (SELECT licensed FROM ' + c.P + 'crews WHERE code = ?1) AS licensed, (SELECT count(*) FROM ' + c.P + 'crew_members WHERE crew_code = ?1) AS n').bind(code).first();
  return !r.licensed && r.n >= 9;
}
async function newMemberToken(c, memberId) {
  var t = randHex(24), now = nowIso();
  await c.db.batch([
    c.db.prepare('INSERT INTO ' + c.P + 'crew_tokens (token_hash, member_id, created_at) VALUES (?, ?, ?)').bind(await sha256(t), memberId, now),
    c.db.prepare('UPDATE ' + c.P + 'crew_members SET last_seen = ?, failed = 0, locked_until = NULL WHERE id = ?').bind(now, memberId)
  ]);
  return t;
}
// the member a device token belongs to, or null; last_seen moves at most once an hour, so a boot costs no write
async function memberOf(c, token) {
  token = str(token);
  if (token.length < 32) return null;
  var r = await c.db.prepare('SELECT member_id FROM ' + c.P + 'crew_tokens WHERE token_hash = ?').bind(await sha256(token)).first();
  if (!r) return null;
  var hourAgo = new Date(Date.now() - 3600000).toISOString();
  await c.db.prepare('UPDATE ' + c.P + 'crew_members SET last_seen = ? WHERE id = ? AND (last_seen IS NULL OR last_seen < ?)').bind(nowIso(), r.member_id, hourAgo).run();
  return r.member_id;
}

// ── INSTRUCTOR (the signed-in instructor must own the crew) ─────────────────────────────────────────────────────────
var INSTRUCTOR = {
  crew_create: async function (c) {
    var b = c.body, P = c.P, code = str(b.p_code).replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase(), name = str(b.p_name).trim(), mode = str(b.p_mode || 'pin');
    if (name.length < 2 || name.length > 48) return { ok: false, err: 'Crew name: 2 to 48 characters.' };
    if (code.length < 4 || code.length > 24) return { ok: false, err: 'Join code: 4 to 24 letters or numbers.' };
    if (mode !== 'pin' && mode !== 'manual') return { ok: false, err: 'Pick PIN or manual.' };
    var n = await c.db.prepare('SELECT count(*) AS n FROM ' + P + 'crews WHERE owner_id = ?').bind(c.who.id).first();
    if (n.n >= 20) return { ok: false, err: 'An instructor can run 20 crews.' };
    try {
      await c.db.prepare('INSERT INTO ' + P + 'crews (code, name, join_mode, owner_id, created_at) VALUES (?, ?, ?, ?, ?)').bind(code, name, mode, c.who.id, nowIso()).run();
    } catch (e) { return { ok: false, err: 'That join code is taken. Pick another.' }; }
    return { ok: true, code: code, name: name, mode: mode };
  },

  crew_mine: async function (c) {
    var rows = (await c.db.prepare('SELECT k.code, k.name, k.join_mode, k.licensed, k.created_at, (SELECT count(*) FROM ' + c.P + 'crew_members m WHERE m.crew_code = k.code) AS members FROM ' + c.P + 'crews k WHERE k.owner_id = ? ORDER BY k.created_at')
      .bind(c.who.id).all()).results || [];
    return rows.map(function (r) { return { code: r.code, name: r.name, mode: r.join_mode, licensed: !!r.licensed, members: r.members, created_at: r.created_at }; });
  },

  crew_delete: async function (c) {
    var r = await c.db.prepare('DELETE FROM ' + c.P + 'crews WHERE code = ? AND owner_id = ?').bind(str(c.body.p_code).trim().toLowerCase(), c.who.id).run();
    return (r.meta && r.meta.changes) ? { ok: true } : { ok: false, err: 'Not your crew.' };
  },

  crew_seat_add: async function (c) {
    var b = c.body, P = c.P, code = str(b.p_code).trim().toLowerCase(), name = str(b.p_name).trim();
    var cr = await c.db.prepare('SELECT * FROM ' + P + 'crews WHERE code = ? AND owner_id = ?').bind(code, c.who.id).first();
    if (!cr) return { ok: false, err: 'Not your crew.' };
    if (cr.join_mode !== 'manual') return { ok: false, err: 'This is a PIN crew: people add themselves.' };
    if (name.length < 2 || name.length > 40) return { ok: false, err: 'Name: 2 to 40 characters.' };
    if (await crewFull(c, code)) return { ok: false, err: 'A free crew holds 9 people. A license removes the limit.' };
    var dup = await c.db.prepare('SELECT 1 AS x FROM ' + P + 'crew_members WHERE crew_code = ? AND lower(name) = lower(?)').bind(code, name).first();
    if (dup) return { ok: false, err: 'That name is already on this crew.' };
    var id = crypto.randomUUID(), seat, i;
    for (i = 0; i < 10; i++) {
      seat = seatCode();
      try {
        await c.db.prepare('INSERT INTO ' + P + 'crew_members (id, crew_code, name, seat_code, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, code, name, seat, nowIso()).run();
        return { ok: true, id: id, name: name, seat: seat };
      } catch (e) { /* a seat code collision: draw again */ }
    }
    return { ok: false, err: 'Could not make a personal code. Try again.' };
  },

  crew_member_reset: async function (c) {
    var P = c.P, mid = str(c.body.p_member);
    var r = await c.db.prepare('SELECT m.id, k.join_mode FROM ' + P + 'crew_members m JOIN ' + P + 'crews k ON k.code = m.crew_code WHERE m.id = ? AND k.owner_id = ?').bind(mid, c.who.id).first();
    if (!r) return { ok: false, err: 'Not on your crew.' };
    var drop = c.db.prepare('DELETE FROM ' + P + 'crew_tokens WHERE member_id = ?').bind(mid);
    if (r.join_mode === 'manual') {
      var seat = seatCode();
      await c.db.batch([drop, c.db.prepare('UPDATE ' + P + 'crew_members SET seat_code = ?, failed = 0, locked_until = NULL WHERE id = ?').bind(seat, mid)]);
      return { ok: true, seat: seat };
    }
    await c.db.batch([drop, c.db.prepare('UPDATE ' + P + 'crew_members SET pin_hash = NULL, pin_salt = NULL, failed = 0, locked_until = NULL WHERE id = ?').bind(mid)]);
    return { ok: true };
  },

  crew_member_remove: async function (c) {
    var P = c.P, mid = str(c.body.p_member);
    var r = await c.db.prepare('DELETE FROM ' + P + 'crew_members WHERE id = ? AND crew_code IN (SELECT code FROM ' + P + 'crews WHERE owner_id = ?)').bind(mid, c.who.id).run();
    return (r.meta && r.meta.changes) ? { ok: true } : { ok: false, err: 'Not on your crew.' };
  },

  crew_roster: async function (c) {
    var P = c.P, code = str(c.body.p_code).trim().toLowerCase(), now = nowIso();
    var q = 'SELECT m.id, m.name, CASE WHEN k.join_mode = \'manual\' THEN m.seat_code END AS seat, m.pin_hash IS NOT NULL AS pin_set, ' +
      '(m.locked_until IS NOT NULL AND m.locked_until > ?) AS locked, m.created_at AS joined, m.last_seen, ' +
      '(SELECT count(*) FROM ' + P + 'crew_sessions s WHERE s.member_id = m.id) AS sessions, ' +
      '(SELECT count(*) FROM ' + P + 'crew_walls w WHERE w.member_id = m.id) AS walls, ' +
      '(SELECT max(w.wall_score) FROM ' + P + 'crew_walls w WHERE w.member_id = m.id) AS best_score, ' +
      '(SELECT round(avg(w.integrity), 1) FROM ' + P + 'crew_walls w WHERE w.member_id = m.id) AS avg_integrity, ' +
      '(SELECT round(max(CASE WHEN w.dur_s > 0 THEN w.pieces * 3600.0 / w.dur_s END), 0) FROM ' + P + 'crew_walls w WHERE w.member_id = m.id) AS best_pph, ' +
      '(SELECT coalesce(sum(w.incidents), 0) FROM ' + P + 'crew_walls w WHERE w.member_id = m.id) AS incidents, ' +
      '(SELECT coalesce(sum(w.collapses), 0) FROM ' + P + 'crew_walls w WHERE w.member_id = m.id) AS collapses, ' +
      // 3.9.1009 WHAT TO COACH: the incident this person had most often across their sessions, and how many times
      '(SELECT json_extract(j.value, \'$.type\') FROM ' + P + 'crew_sessions s, json_each(s.incidents) j WHERE s.member_id = m.id AND json_extract(j.value, \'$.type\') IS NOT NULL ' +
      'GROUP BY json_extract(j.value, \'$.type\') ORDER BY count(*) DESC, json_extract(j.value, \'$.type\') LIMIT 1) AS top_incident, ' +
      '(SELECT count(*) FROM ' + P + 'crew_sessions s, json_each(s.incidents) j WHERE s.member_id = m.id AND json_extract(j.value, \'$.type\') IS NOT NULL ' +
      'GROUP BY json_extract(j.value, \'$.type\') ORDER BY count(*) DESC, json_extract(j.value, \'$.type\') LIMIT 1) AS top_incident_n ' +
      'FROM ' + P + 'crew_members m JOIN ' + P + 'crews k ON k.code = m.crew_code WHERE k.code = ? AND k.owner_id = ? ORDER BY lower(m.name)';
    var rows = (await c.db.prepare(q).bind(now, code, c.who.id).all()).results || [];
    return rows.map(function (r) { r.pin_set = !!r.pin_set; r.locked = !!r.locked; return r; });
  },

  crew_export_walls: async function (c) {
    var P = c.P, q = 'SELECT m.name, w.mode, w.wall_score AS score, w.pieces, w.dur_s, CASE WHEN w.dur_s > 0 THEN round(w.pieces * 3600.0 / w.dur_s, 0) END AS pph, ' +
      'w.integrity, w.density, w.incidents, w.collapses, w.created_at AS loaded_at FROM ' + P + 'crew_walls w JOIN ' + P + 'crew_members m ON m.id = w.member_id ' +
      'JOIN ' + P + 'crews k ON k.code = m.crew_code WHERE k.code = ? AND k.owner_id = ? AND k.licensed = 1 ORDER BY w.created_at';
    return (await c.db.prepare(q).bind(str(c.body.p_code).trim().toLowerCase(), c.who.id).all()).results || [];
  },

  crew_export_sessions: async function (c) {
    var P = c.P, q = 'SELECT m.name, s.mode, s.app_ver, s.started_at, s.ended_at, s.duration_s, s.summary, s.incidents FROM ' + P + 'crew_sessions s ' +
      'JOIN ' + P + 'crew_members m ON m.id = s.member_id JOIN ' + P + 'crews k ON k.code = m.crew_code WHERE k.code = ? AND k.owner_id = ? AND k.licensed = 1 ORDER BY s.created_at';
    var rows = (await c.db.prepare(q).bind(str(c.body.p_code).trim().toLowerCase(), c.who.id).all()).results || [];
    return rows.map(function (r) {
      try { r.summary = JSON.parse(r.summary); } catch (e) { /* keep the text */ }
      try { r.incidents = JSON.parse(r.incidents); } catch (e) { /* keep the text */ }
      return r;
    });
  }
};

// ── INSTRUCTOR ACCOUNTS ────────────────────────────────────────────────────────────────────────────────────────────
var COOKIE = 'lockin_session';
function sessionCookie(token, url) {
  return COOKIE + '=' + token + '; Path=/api; HttpOnly; SameSite=Strict; Max-Age=' + (SESSION_HOURS * 3600) + (url.protocol === 'https:' ? '; Secure' : '');
}
function clearCookie(url) { return COOKIE + '=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0' + (url.protocol === 'https:' ? '; Secure' : ''); }

// the signed-in instructor ({id, email}) from the session cookie, or null
async function sessionOf(c) {
  var t = cookieOf(c.request, COOKIE);
  if (!t || t.length < 32) return null;
  var r = await c.db.prepare('SELECT i.id, i.email FROM ' + c.P + 'auth_sessions s JOIN ' + c.P + 'instructors i ON i.id = s.instructor_id WHERE s.token_hash = ? AND s.expires_at > ?')
    .bind(await sha256(t), nowIso()).first();
  return r || null;
}
// a new session cookie; this instructor's expired sessions are cleared on the way
async function startSession(c, who) {
  var t = randHex(32), now = nowIso();
  await c.db.batch([
    c.db.prepare('DELETE FROM ' + c.P + 'auth_sessions WHERE instructor_id = ? AND expires_at <= ?').bind(who.id, now),
    c.db.prepare('INSERT INTO ' + c.P + 'auth_sessions (token_hash, instructor_id, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(await sha256(t), who.id, now, minutesFrom(SESSION_HOURS * 60)),
    c.db.prepare('UPDATE ' + c.P + 'instructors SET failed = 0, locked_until = NULL, last_login = ? WHERE id = ?').bind(now, who.id)
  ]);
  return json({ ok: true, email: who.email }, 200, { 'set-cookie': sessionCookie(t, c.url) });
}
// A one-time link for an email. Only the newest link of a kind works, so making one voids the older ones. Returns
// the token, or null when the account has had its share of that kind (MAIL_LIMIT); the caller then sends nothing and
// answers the same as if it had. A confirmation link carries the password it was made with (pw: {hash, salt, iter}).
async function oneTimeLink(c, id, kind, minutes, pw) {
  var lim = MAIL_LIMIT[kind], now = nowIso(), since = new Date(Date.now() - lim[1] * 60000).toISOString();
  var r = await c.db.prepare('SELECT count(*) AS n FROM ' + c.P + 'auth_tokens WHERE instructor_id = ? AND kind = ? AND created_at > ?').bind(id, kind, since).first();
  if (r.n >= lim[0]) return null;
  var t = randHex(32);
  await c.db.batch([
    c.db.prepare('DELETE FROM ' + c.P + 'auth_tokens WHERE instructor_id = ? AND expires_at <= ? AND created_at <= ?').bind(id, now, since),
    c.db.prepare('UPDATE ' + c.P + 'auth_tokens SET used = 1 WHERE instructor_id = ? AND kind = ? AND used = 0').bind(id, kind),
    c.db.prepare('INSERT INTO ' + c.P + 'auth_tokens (token_hash, instructor_id, kind, pw_hash, pw_salt, pw_iter, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(await sha256(t), id, kind, pw ? pw.hash : null, pw ? pw.salt : null, pw ? pw.iter : null, now, minutesFrom(minutes))
  ]);
  return t;
}
// the instructor a one-time link belongs to, or null when the link is wrong, used or expired. The UPDATE is the claim:
// of two clicks on one link, only the one that turns used from 0 to 1 goes through.
async function useLink(c, kind, token) {
  token = str(token);
  if (token.length < 32) return null;
  var h = await sha256(token);
  var r = await c.db.prepare('SELECT t.instructor_id AS id, t.pw_hash, t.pw_salt, t.pw_iter, i.email FROM ' + c.P + 'auth_tokens t JOIN ' + c.P + 'instructors i ON i.id = t.instructor_id WHERE t.token_hash = ? AND t.kind = ? AND t.used = 0 AND t.expires_at > ?')
    .bind(h, kind, nowIso()).first();
  if (!r) return null;
  var u = await c.db.prepare('UPDATE ' + c.P + 'auth_tokens SET used = 1 WHERE token_hash = ? AND used = 0').bind(h).run();
  return (u.meta && u.meta.changes) ? r : null;
}
async function hashPassword(pw) { var salt = randHex(16); return { hash: await pbkdf2(pw, salt, PW_ITER), salt: salt, iter: PW_ITER }; }
function setPassword(c, id, h) {
  return c.db.prepare('UPDATE ' + c.P + 'instructors SET pw_hash = ?, pw_salt = ?, pw_iter = ?, failed = 0, locked_until = NULL WHERE id = ?')
    .bind(h.hash, h.salt, h.iter, id);
}
function pwProblem(pw) {
  if (typeof pw !== 'string' || pw.length < PW_MIN) return 'The password needs ' + PW_MIN + ' or more characters.';
  if (pw.length > 200) return 'The password can be up to 200 characters.';
  return null;
}
function dash(c, frag) { return c.url.origin + '/dashboard/' + (frag ? '#' + frag : ''); }

var AUTH = {
  // A new account, confirmed by email before it can sign in. The answer is the same whether or not the email already
  // has an account, so the form cannot be used to find out who does.
  signup: async function (c) {
    var email = str(c.body.email).trim(), pw = c.body.password, P = c.P;
    if (!okEmail(email)) return json({ ok: false, err: 'Enter an email address.' });
    var bad = pwProblem(pw);
    if (bad) return json({ ok: false, err: bad });
    var done = { ok: true, msg: 'Check ' + email + ' for a confirmation link, then sign in here.' };
    var who = await c.db.prepare('SELECT id, email, verified FROM ' + P + 'instructors WHERE email = ?').bind(email).first();
    if (who && who.verified) {
      var rt = await oneTimeLink(c, who.id, 'reset', 60);
      if (rt) {
        await sendMail(c, who.email, 'Someone tried to make a LOCK IN account with this email',
          'This email already has a LOCK IN instructor account, so no new one was made. If you have lost the password, this link sets a new one:\n\n' +
          dash(c, 'reset=' + rt) + '\n\nIt works for one hour and only once. If this was not you, ignore this email; nothing has changed.');
      }
      return json(done);
    }
    var h = await hashPassword(pw), id;
    if (who) {
      // not confirmed yet: the newest sign-up's password is the one a sign-in checks, and its link is the only one that works
      id = who.id;
      await setPassword(c, id, h).run();
    } else {
      var hour = await c.db.prepare('SELECT count(*) AS n FROM ' + P + 'instructors WHERE created_at > ?').bind(new Date(Date.now() - 3600000).toISOString()).first();
      if (hour.n >= SIGNUPS_PER_HOUR) return json({ ok: false, err: 'Too many new accounts this hour. Try again in an hour.' });
      id = crypto.randomUUID();
      try {
        await c.db.prepare('INSERT INTO ' + P + 'instructors (id, email, pw_hash, pw_salt, pw_iter, created_at) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(id, email, h.hash, h.salt, h.iter, nowIso()).run();
      } catch (e) { return json(done); }   // made a moment ago from another tab
    }
    var t = await oneTimeLink(c, id, 'verify', 1440, h);
    if (t) await mailVerify(c, email, t);
    return json(done);
  },

  // the link in the confirmation email: confirms the address and sets the password that link was made with
  verify: async function (c) {
    var r = await useLink(c, 'verify', c.body.token);
    if (!r) return json({ ok: false, err: 'This confirmation link has expired, was already used, or a newer one was sent. Sign in to get a new one.' });
    var stmts = [c.db.prepare('UPDATE ' + c.P + 'instructors SET verified = 1 WHERE id = ?').bind(r.id)];
    if (r.pw_hash) stmts.push(setPassword(c, r.id, { hash: r.pw_hash, salt: r.pw_salt, iter: r.pw_iter }));
    await c.db.batch(stmts);
    return json({ ok: true, msg: 'Email confirmed. Sign in.' });
  },

  // 5 wrong passwords lock the account for 15 minutes and email an unlock link; a lock that has run out starts over
  login: async function (c) {
    var email = str(c.body.email).trim(), pw = str(c.body.password), P = c.P;
    var wrong = { ok: false, err: 'Email or password is wrong.' };
    if (!okEmail(email) || !pw || pw.length > 200) return json(wrong);
    var who = await c.db.prepare('SELECT * FROM ' + P + 'instructors WHERE email = ?').bind(email).first();
    if (!who) { await pbkdf2(pw, '00000000000000000000000000000000', PW_ITER); return json(wrong); }   // the same time either way
    var now = nowIso();
    if (who.locked_until && who.locked_until > now) {
      return json({ ok: false, locked: true, err: 'This account is locked for 15 minutes after 5 wrong passwords. The unlock link is in the inbox for this account.' });
    }
    if (!sameHex(await pbkdf2(pw, who.pw_salt, who.pw_iter), who.pw_hash)) {
      var f = ((who.locked_until && who.locked_until <= now) ? 0 : (who.failed || 0)) + 1;
      if (f >= LOCK_AFTER) {
        await c.db.prepare('UPDATE ' + P + 'instructors SET failed = ?, locked_until = ? WHERE id = ?').bind(f, minutesFrom(LOCK_MIN), who.id).run();
        var ut = await oneTimeLink(c, who.id, 'unlock', 60);
        if (ut) {
          await sendMail(c, who.email, 'Your LOCK IN account was locked',
            'Five wrong passwords locked the account for 15 minutes. Open this link to unlock it now:\n\n' + dash(c, 'unlock=' + ut) +
            '\n\nThe link works for one hour. If this was not you, choose Forgot the password on the sign-in page and set a new one.');
        }
        return json({ ok: false, locked: true, err: 'That was the fifth wrong password, so the account is locked for 15 minutes. An unlock link was sent to its email.' });
      }
      await c.db.prepare('UPDATE ' + P + 'instructors SET failed = ?, locked_until = NULL WHERE id = ?').bind(f, who.id).run();
      return json(wrong);
    }
    if (!who.verified) {
      var vt = await oneTimeLink(c, who.id, 'verify', 1440, { hash: who.pw_hash, salt: who.pw_salt, iter: who.pw_iter });
      if (vt) await mailVerify(c, who.email, vt);
      return json({ ok: false, err: 'Confirm the email first. The confirmation link is in the inbox for ' + who.email + '.' });
    }
    return startSession(c, who);
  },

  logout: async function (c) {
    var t = cookieOf(c.request, COOKIE);
    if (t) await c.db.prepare('DELETE FROM ' + c.P + 'auth_sessions WHERE token_hash = ?').bind(await sha256(t)).run();
    return json({ ok: true }, 200, { 'set-cookie': clearCookie(c.url) });
  },

  me: async function (c) {
    var who = await sessionOf(c);
    return json(who ? { ok: true, email: who.email } : { ok: false });
  },

  // change the password while signed in: the current one first; every other device signs out; the account is told
  password: async function (c) {
    var who = await sessionOf(c);
    if (!who) return json({ ok: false, err: 'Sign in first.' }, 401);
    var cur = str(c.body.current), pw = c.body.password, bad = pwProblem(pw);
    if (bad) return json({ ok: false, err: bad });
    var row = await c.db.prepare('SELECT pw_hash, pw_salt, pw_iter FROM ' + c.P + 'instructors WHERE id = ?').bind(who.id).first();
    if (!row || !sameHex(await pbkdf2(cur, row.pw_salt, row.pw_iter), row.pw_hash)) return json({ ok: false, err: 'The current password is wrong.' });
    if (cur === pw) return json({ ok: false, err: 'The new password is the same as the current one.' });
    var keep = await sha256(cookieOf(c.request, COOKIE));
    await c.db.batch([
      setPassword(c, who.id, await hashPassword(pw)),
      c.db.prepare('DELETE FROM ' + c.P + 'auth_sessions WHERE instructor_id = ? AND token_hash <> ?').bind(who.id, keep)
    ]);
    await sendMail(c, who.email, 'Your LOCK IN password was changed',
      'The password for this LOCK IN instructor account was just changed, and every other device signed in to it was signed out.\n\n' +
      'If this was not you, open the sign-in page, choose Forgot the password, and set a new one:\n\n' + dash(c));
    return json({ ok: true, msg: 'Password changed. Any other device signed in to this account was signed out.' });
  },

  forgot: async function (c) {
    var email = str(c.body.email).trim();
    if (!okEmail(email)) return json({ ok: false, err: 'Type the account email above, then choose Forgot the password.' });
    var who = await c.db.prepare('SELECT id, email FROM ' + c.P + 'instructors WHERE email = ?').bind(email).first();
    if (who) {
      var t = await oneTimeLink(c, who.id, 'reset', 60);
      if (t) {
        await sendMail(c, who.email, 'Reset your LOCK IN password',
          'Open this link to choose a new password:\n\n' + dash(c, 'reset=' + t) +
          '\n\nIt works for one hour and only once. If you did not ask for this, ignore this email; your password stays as it is.');
      }
    }
    return json({ ok: true, msg: 'If ' + email + ' has an instructor account, a reset link is on its way. It opens this page.' });
  },

  // the link in the reset email: a new password, the address counts as confirmed, every link and session ends
  reset: async function (c) {
    var pw = c.body.password, bad = pwProblem(pw);
    if (bad) return json({ ok: false, err: bad });
    var r = await useLink(c, 'reset', c.body.token);
    if (!r) return json({ ok: false, err: 'This reset link has expired, was already used, or a newer one was sent. Ask for a new one.' });
    await c.db.batch([
      setPassword(c, r.id, await hashPassword(pw)),
      c.db.prepare('UPDATE ' + c.P + 'instructors SET verified = 1 WHERE id = ?').bind(r.id),
      c.db.prepare('UPDATE ' + c.P + 'auth_tokens SET used = 1 WHERE instructor_id = ? AND used = 0').bind(r.id),
      c.db.prepare('DELETE FROM ' + c.P + 'auth_sessions WHERE instructor_id = ?').bind(r.id)
    ]);
    return json({ ok: true, msg: 'Password saved. Sign in with it.' });
  },

  // the link in the lock email
  unlock: async function (c) {
    var r = await useLink(c, 'unlock', c.body.token);
    if (!r) return json({ ok: false, err: 'This unlock link has expired or was already used. Wait 15 minutes, or reset the password.' });
    await c.db.prepare('UPDATE ' + c.P + 'instructors SET failed = 0, locked_until = NULL WHERE id = ?').bind(r.id).run();
    return json({ ok: true, msg: 'Account unlocked. Sign in.' });
  }
};

async function mailVerify(c, to, token) {
  return sendMail(c, to, 'Confirm your LOCK IN instructor account',
    'Open this link to confirm the account:\n\n' + dash(c, 'verify=' + token) +
    '\n\nThe link works for 24 hours. If you did not make a LOCK IN account, ignore this email.');
}

// One way out for every email. With a sender configured (env.MAIL_API + env.MAIL_KEY + env.MAIL_FROM) it goes to the
// sender's send address as JSON {from, to, subject, text} with the key as a Bearer token,
// to waitUntil when there is one so the answer does not wait on it. Without a sender (the sandbox) it is written to the
// outbox table, so every link can be tested. A failed send is logged and never shown to the person.
async function sendMail(c, to, subject, text) {
  var body = text + '\n\nLOCK IN · trailer-load.com · F-Keys Creative LLC';
  var env = c.env;
  if (env.MAIL_API && env.MAIL_KEY && env.MAIL_FROM) {
    var send = fetch(env.MAIL_API, {
      method: 'POST',
      headers: { 'authorization': 'Bearer ' + env.MAIL_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject: subject, text: body })
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { console.error('sendMail:', r.status, t); });
    }).catch(function (e) { console.error('sendMail:', e); });
    if (c.ectx && c.ectx.waitUntil) c.ectx.waitUntil(send); else await send;
    return;
  }
  await c.db.prepare('INSERT INTO ' + c.P + 'outbox (to_addr, subject, body, created_at) VALUES (?, ?, ?, ?)').bind(to, subject, body, nowIso()).run();
}

// The production Worker: www.trailer-load.com/api/* only. The sandbox calls handleApi from its own worker.js instead.
export default {
  async fetch(request, env, ectx) { return handleApi(request, env, ectx); }
};
