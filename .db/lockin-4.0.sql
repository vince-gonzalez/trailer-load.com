-- lockin-4.0.sql · the LOCK IN 4.0 database: an arcade with no player accounts, and crews for instructors.
--
-- ONE SCRIPT, TWO PLACES. Every name carries a prefix placeholder; .db/render.py fills it with lockin_ for production
-- and lis_ for the sandbox.
-- Everything is "if not exists" or "create or replace", so it runs on an empty sandbox and on production alike, and a
-- second run changes nothing. The one thing it drops is the 3.x arcade_board function, whose columns changed. Retiring
-- the 3.x account tables is its own script (lockin-4.0-retire.sql), run once, on purpose, after 4.0 ships.
--
-- WHO CAN DO WHAT
--   Anyone (no account):  sign the arcade board with three initials, read the boards, add to the anonymous daily totals.
--   A crew member:        no account either. Joins with the crew's code, then a name + 4-digit PIN (a PIN crew) or the
--                         personal code the instructor handed out (a manual crew). The device keeps a random token;
--                         only its SHA-256 is stored. Walls and sessions are saved to the crew under that name.
--   An instructor:        the only account in 4.0 (Supabase Auth, email + password, made on the dashboard). Owns
--                         crews, sees their roster, adds and removes names, resets PINs, reissues codes. A licensed
--                         crew has no 9-member cap and can export every wall and session.
--
-- SECURITY. Row-level security is ON for every table and there are NO policies, so neither the anon key nor a signed-in
-- instructor can read or write a table directly. Every read and write goes through a SECURITY DEFINER function below
-- that checks who is asking: auth.uid() for an instructor, the token hash for a crew member. search_path is pinned on
-- every function. PINs are bcrypt; tokens are SHA-256; a member is locked for 15 minutes after 5 wrong PINs.

create extension if not exists pgcrypto with schema extensions;

-- ── THE ARCADE (public, initials only) ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.{P}arcade (
  id bigint generated always as identity primary key,
  day date not null default ((now() at time zone 'utc')::date),
  initials text not null,
  mode text not null,
  score integer not null,
  integrity integer not null,
  pieces integer not null,
  pack integer not null,
  created_at timestamptz not null default now(),
  user_id uuid                                    -- 3.x linked a signature to an account; 4.0 never sets it
);
create index if not exists {P}arcade_board_idx on public.{P}arcade (mode, day, score desc);
-- the same checks on both databases: production's 3.x table had them and the sandbox's fresh table had none, so a
-- sandbox could accept a row production refuses. Two boards exist in 4.0: daily and shift (TRAILER-LOAD).
alter table public.{P}arcade drop constraint if exists {P}arcade_mode_check;
alter table public.{P}arcade add constraint {P}arcade_mode_check check (mode in ('daily', 'shift'));
alter table public.{P}arcade drop constraint if exists {P}arcade_pieces_check;
alter table public.{P}arcade add constraint {P}arcade_pieces_check check (pieces >= 0 and pieces <= 340);
alter table public.{P}arcade drop constraint if exists {P}arcade_initials_check;
alter table public.{P}arcade add constraint {P}arcade_initials_check check (initials ~ '^[A-Z]{3}$');
alter table public.{P}arcade drop constraint if exists {P}arcade_integrity_check;
alter table public.{P}arcade add constraint {P}arcade_integrity_check check (integrity >= 0 and integrity <= 100);
alter table public.{P}arcade drop constraint if exists {P}arcade_pack_check;
alter table public.{P}arcade add constraint {P}arcade_pack_check check (pack >= 0 and pack <= 100);
alter table public.{P}arcade drop constraint if exists {P}arcade_score_check;
alter table public.{P}arcade add constraint {P}arcade_score_check check (score >= 0 and score <= 400000);
alter table public.{P}arcade enable row level security;

-- ── ANONYMOUS DAILY TOTALS (one number per event per day, nothing about anyone) ─────────────────────────────────────
create table if not exists public.{P}counters (
  key text primary key,
  n bigint not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.{P}counters (key, n) values ('site_visits', 0) on conflict do nothing;
alter table public.{P}counters enable row level security;

create table if not exists public.{P}event_counts (
  day date not null default ((now() at time zone 'utc')::date),
  event text not null,
  mode text not null default '',
  n bigint not null default 0,
  primary key (day, event, mode)
);
alter table public.{P}event_counts enable row level security;

-- ── CREWS ───────────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.{P}crews (
  code text primary key,                          -- the join code, lower case
  name text not null,
  join_mode text not null default 'pin' check (join_mode in ('pin', 'manual')),
  owner_uid uuid not null references auth.users (id) on delete cascade,
  licensed boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists {P}crews_owner_idx on public.{P}crews (owner_uid);
alter table public.{P}crews enable row level security;

create table if not exists public.{P}crew_members (
  id uuid primary key default gen_random_uuid(),
  crew_code text not null references public.{P}crews (code) on delete cascade,
  name text not null,                             -- the name the instructor knows the person by
  pin_hash text,                                  -- PIN crews: bcrypt of the 4-digit PIN; null until first join
  seat_code text,                                 -- manual crews: the personal code the instructor hands out
  failed integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  last_seen timestamptz
);
create unique index if not exists {P}crew_members_name_idx on public.{P}crew_members (crew_code, lower(name));
create unique index if not exists {P}crew_members_seat_idx on public.{P}crew_members (crew_code, seat_code);
alter table public.{P}crew_members enable row level security;

create table if not exists public.{P}crew_tokens (
  token_hash text primary key,                    -- SHA-256 hex of the token the device holds
  member_id uuid not null references public.{P}crew_members (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists {P}crew_tokens_member_idx on public.{P}crew_tokens (member_id);
alter table public.{P}crew_tokens enable row level security;

create table if not exists public.{P}crew_walls (
  id bigint generated always as identity primary key,
  member_id uuid not null references public.{P}crew_members (id) on delete cascade,
  mode text not null default '',
  wall_score integer not null default 0,
  pieces integer not null default 0,
  dur_s integer not null default 0,
  integrity integer not null default 0,
  density integer not null default 0,
  incidents integer not null default 0,
  collapses integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists {P}crew_walls_member_idx on public.{P}crew_walls (member_id, created_at);
alter table public.{P}crew_walls enable row level security;

create table if not exists public.{P}crew_sessions (
  id bigint generated always as identity primary key,
  member_id uuid not null references public.{P}crew_members (id) on delete cascade,
  mode text not null default '',
  app_ver text,
  started_at timestamptz,
  ended_at timestamptz,
  duration_s integer,
  summary jsonb not null default '{}'::jsonb,
  incidents jsonb not null default '[]'::jsonb,
  events jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists {P}crew_sessions_member_idx on public.{P}crew_sessions (member_id, created_at);
alter table public.{P}crew_sessions enable row level security;

-- nobody touches a table directly; the functions below are the only door
revoke all on public.{P}arcade, public.{P}counters, public.{P}event_counts, public.{P}crews, public.{P}crew_members,
  public.{P}crew_tokens, public.{P}crew_walls, public.{P}crew_sessions from anon, authenticated;

-- ── HELPERS (private: never granted to anon or authenticated) ───────────────────────────────────────────────────────
create or replace function public.{P}x_hash(p text) returns text
language sql immutable set search_path = public, extensions as $$
  select encode(extensions.digest(coalesce(p, ''), 'sha256'), 'hex');
$$;

-- the member a device token belongs to, or null; touching last_seen on the way
create or replace function public.{P}x_member(p_token text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v uuid;
begin
  if p_token is null or length(p_token) < 32 then return null; end if;
  select t.member_id into v from public.{P}crew_tokens t where t.token_hash = public.{P}x_hash(p_token);
  if v is not null then update public.{P}crew_members set last_seen = now() where id = v; end if;
  return v;
end $$;

create or replace function public.{P}x_new_token(p_member uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  insert into public.{P}crew_tokens (token_hash, member_id) values (public.{P}x_hash(v), p_member);
  update public.{P}crew_members set last_seen = now(), failed = 0, locked_until = null where id = p_member;
  return v;
end $$;

-- 8 characters from an alphabet with no 0/O, 1/I/L, written as XXXX-XXXX
create or replace function public.{P}x_seat_code() returns text
language plpgsql volatile set search_path = public, extensions as $$
declare a text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; b bytea := extensions.gen_random_bytes(8); s text := ''; i int;
begin
  for i in 0..7 loop s := s || substr(a, (get_byte(b, i) % length(a)) + 1, 1); end loop;
  return substr(s, 1, 4) || '-' || substr(s, 5, 4);
end $$;

-- the crew's member cap: 9 unless licensed
create or replace function public.{P}x_crew_full(p_code text) returns boolean
language sql stable security definer set search_path = public as $$
  select not coalesce((select licensed from public.{P}crews where code = p_code), false)
     and (select count(*) from public.{P}crew_members where crew_code = p_code) >= 9;
$$;

revoke all on function public.{P}x_hash(text), public.{P}x_member(text), public.{P}x_new_token(uuid),
  public.{P}x_seat_code(), public.{P}x_crew_full(text) from public, anon, authenticated;

-- ── PUBLIC: the arcade and the daily totals ─────────────────────────────────────────────────────────────────────────
create or replace function public.{P}arcade_sign(p_initials text, p_mode text, p_score integer, p_integrity integer,
  p_pieces integer, p_pack integer) returns json
language plpgsql security definer set search_path = public as $$
declare v text; v_rank bigint; v_day date := (now() at time zone 'utc')::date;
begin
  v := upper(regexp_replace(coalesce(p_initials, ''), '[^A-Za-z]', '', 'g'));
  if length(v) <> 3 then return json_build_object('ok', false, 'err', 'Three letters, A to Z.'); end if;
  if v = any (array['ASS','FUK','FUC','FCK','FKU','SHT','CUM','FAG','FGT','NIG','NGR','NGA','KKK','SEX','DIK','DIC',
                    'COK','CNT','TIT','JIZ','HOE','KYS','RAP','RPE','NAZ','NZI','PUS','VAG','PNS','BCH','SLT','WHR',
                    'ANL','FAP','WTF']) then
    return json_build_object('ok', false, 'err', 'Pick different initials.');
  end if;
  if coalesce(p_mode, '') not in ('daily', 'shift') then
    return json_build_object('ok', false, 'err', 'Unknown mode.');
  end if;
  if p_score is null or p_score < 0 or p_score > 400000 or p_integrity is null or p_integrity < 0 or p_integrity > 100
     or p_pieces is null or p_pieces < 1 or p_pieces > 340
     or p_pack is null or p_pack < 0 or p_pack > 100 then
    return json_build_object('ok', false, 'err', 'That wall does not check out.');
  end if;
  if (select count(*) from public.{P}arcade where created_at > now() - interval '1 minute') >= 30 then
    return json_build_object('ok', false, 'err', 'The board is busy. Try again in a minute.');
  end if;
  insert into public.{P}arcade (day, initials, mode, score, integrity, pieces, pack)
       values (v_day, v, p_mode, p_score, p_integrity, p_pieces, p_pack);
  select count(*) + 1 into v_rank from public.{P}arcade where day = v_day and mode = p_mode and score > p_score;
  return json_build_object('ok', true, 'initials', v, 'rank_today', v_rank);
exception when others then
  return json_build_object('ok', false, 'err', 'Could not sign the board.');
end $$;

-- 3.x returned (rank, username, score, integrity, day, mine); a return type cannot be replaced in place
drop function if exists public.{P}arcade_board(text, text, integer);
create or replace function public.{P}arcade_board(p_mode text default 'daily', p_scope text default 'today',
  p_limit integer default 20)
returns table (rank bigint, initials text, score integer, integrity integer, day date)
language sql stable security definer set search_path = public as $$
  select row_number() over (order by a.score desc, a.created_at asc), a.initials, a.score, a.integrity, a.day
    from public.{P}arcade a
   where a.mode = coalesce(p_mode, 'daily')
     and (coalesce(p_scope, 'today') = 'all' or a.day = (now() at time zone 'utc')::date)
   order by a.score desc, a.created_at asc
   limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

create or replace function public.{P}count(p_event text, p_mode text default '') returns void
language plpgsql security definer set search_path = public as $$
declare v_mode text := coalesce(p_mode, '');
begin
  if coalesce(p_event, '') not in ('game_open', 'visitor_new', 'visitor_returning', 'mode_start', 'wall_done',
                                   'daily_submit', 'briefing_done', 'arcade_signed', 'training_done', 'crew_joined')
    then return; end if;
  if v_mode not in ('', 'daily', 'shift', 'training') then v_mode := 'other'; end if;
  insert into public.{P}event_counts (day, event, mode, n) values ((now() at time zone 'utc')::date, p_event, v_mode, 1)
  on conflict (day, event, mode) do update set n = public.{P}event_counts.n + 1;
exception when others then return;
end $$;

create or replace function public.{P}visit() returns bigint
language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  update public.{P}counters set n = n + 1, updated_at = now() where key = 'site_visits' returning n into v;
  return coalesce(v, 0);
end $$;

-- ── CREW MEMBERS (no account: a crew code, then a PIN or a personal code; then a device token) ──────────────────────
create or replace function public.{P}crew_peek(p_code text) returns json
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select json_build_object('ok', true, 'code', c.code, 'name', c.name, 'mode', c.join_mode)
       from public.{P}crews c where c.code = lower(btrim(coalesce(p_code, '')))),
    json_build_object('ok', false, 'err', 'No crew with that code. Check it with your instructor.'));
$$;

create or replace function public.{P}member_join_pin(p_code text, p_name text, p_pin text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v_code text := lower(btrim(coalesce(p_code, ''))); v_name text := btrim(coalesce(p_name, ''));
        c public.{P}crews; m public.{P}crew_members;
begin
  select * into c from public.{P}crews where code = v_code;
  if c.code is null then return json_build_object('ok', false, 'err', 'No crew with that code. Check it with your instructor.'); end if;
  if c.join_mode <> 'pin' then return json_build_object('ok', false, 'err', 'This crew uses personal codes. Enter the code your instructor gave you.'); end if;
  if length(v_name) < 2 or length(v_name) > 40 then return json_build_object('ok', false, 'err', 'Enter your name as your instructor knows it (2 to 40 characters).'); end if;
  if coalesce(p_pin, '') !~ '^[0-9]{4}$' then return json_build_object('ok', false, 'err', 'The PIN is 4 digits.'); end if;
  select * into m from public.{P}crew_members where crew_code = v_code and lower(name) = lower(v_name);
  if m.id is null then
    if public.{P}x_crew_full(v_code) then return json_build_object('ok', false, 'err', 'This crew is full (9 members). Ask your instructor.'); end if;
    insert into public.{P}crew_members (crew_code, name, pin_hash) values (v_code, v_name, extensions.crypt(p_pin, extensions.gen_salt('bf')))
      returning * into m;
  elsif m.pin_hash is null then
    update public.{P}crew_members set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')) where id = m.id;
  else
    if m.locked_until is not null and m.locked_until > now() then
      return json_build_object('ok', false, 'err', 'Too many wrong PINs. Try again in 15 minutes, or ask your instructor to reset it.');
    end if;
    if extensions.crypt(p_pin, m.pin_hash) <> m.pin_hash then
      update public.{P}crew_members set failed = failed + 1,
             locked_until = case when failed + 1 >= 5 then now() + interval '15 minutes' else null end where id = m.id;
      return json_build_object('ok', false, 'err', 'That name is already in this crew with a different PIN.');
    end if;
  end if;
  return json_build_object('ok', true, 'token', public.{P}x_new_token(m.id), 'crew', c.name, 'code', c.code, 'name', m.name);
exception when unique_violation then
  return json_build_object('ok', false, 'err', 'That name was just taken. Try again.');
end $$;

create or replace function public.{P}member_join_seat(p_code text, p_seat text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v_code text := lower(btrim(coalesce(p_code, ''))); v_seat text := upper(regexp_replace(coalesce(p_seat, ''), '[^A-Za-z0-9]', '', 'g'));
        c public.{P}crews; m public.{P}crew_members;
begin
  select * into c from public.{P}crews where code = v_code;
  if c.code is null then return json_build_object('ok', false, 'err', 'No crew with that code. Check it with your instructor.'); end if;
  if c.join_mode <> 'manual' then return json_build_object('ok', false, 'err', 'This crew uses a name and PIN.'); end if;
  if length(v_seat) <> 8 then return json_build_object('ok', false, 'err', 'Your personal code has 8 letters and numbers, like ABCD-2345.'); end if;
  select * into m from public.{P}crew_members where crew_code = v_code and replace(seat_code, '-', '') = v_seat;
  if m.id is null then return json_build_object('ok', false, 'err', 'That personal code is not on this crew. Check it with your instructor.'); end if;
  return json_build_object('ok', true, 'token', public.{P}x_new_token(m.id), 'crew', c.name, 'code', c.code, 'name', m.name);
end $$;

create or replace function public.{P}member_whoami(p_token text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v uuid := public.{P}x_member(p_token); r record;
begin
  if v is null then return json_build_object('ok', false); end if;
  select m.name, c.name as crew, c.code into r from public.{P}crew_members m join public.{P}crews c on c.code = m.crew_code where m.id = v;
  return json_build_object('ok', true, 'name', r.name, 'crew', r.crew, 'code', r.code);
end $$;

create or replace function public.{P}member_log_wall(p_token text, p_mode text, p_score integer, p_pieces integer, p_dur integer,
  p_integrity integer, p_density integer, p_incidents integer, p_collapses integer) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v uuid := public.{P}x_member(p_token);
begin
  if v is null then return json_build_object('ok', false, 'err', 'not in a crew'); end if;
  if (select count(*) from public.{P}crew_walls where member_id = v and created_at > now() - interval '1 minute') >= 20 then
    return json_build_object('ok', false, 'err', 'too fast');
  end if;
  insert into public.{P}crew_walls (member_id, mode, wall_score, pieces, dur_s, integrity, density, incidents, collapses)
  values (v, left(coalesce(p_mode, ''), 16), greatest(0, least(coalesce(p_score, 0), 400000)), greatest(0, least(coalesce(p_pieces, 0), 340)),
          greatest(0, least(coalesce(p_dur, 0), 86400)), greatest(0, least(coalesce(p_integrity, 0), 100)), greatest(0, least(coalesce(p_density, 0), 100)),
          greatest(0, least(coalesce(p_incidents, 0), 1000)), greatest(0, least(coalesce(p_collapses, 0), 1000)));
  return json_build_object('ok', true);
end $$;

create or replace function public.{P}member_session(p_token text, p_mode text, p_app_ver text, p_started timestamptz,
  p_ended timestamptz, p_duration integer, p_summary jsonb, p_incidents jsonb, p_events jsonb) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v uuid := public.{P}x_member(p_token);
begin
  if v is null then return json_build_object('ok', false, 'err', 'not in a crew'); end if;
  if pg_column_size(coalesce(p_summary, '{}'::jsonb)) + pg_column_size(coalesce(p_incidents, '[]'::jsonb))
     + pg_column_size(coalesce(p_events, '[]'::jsonb)) > 1048576 then
    return json_build_object('ok', false, 'err', 'session too large');
  end if;
  if (select count(*) from public.{P}crew_sessions where member_id = v and created_at > now() - interval '1 minute') >= 6 then
    return json_build_object('ok', false, 'err', 'too fast');
  end if;
  insert into public.{P}crew_sessions (member_id, mode, app_ver, started_at, ended_at, duration_s, summary, incidents, events)
  values (v, left(coalesce(p_mode, ''), 16), left(p_app_ver, 16), p_started, p_ended, greatest(0, least(coalesce(p_duration, 0), 86400)),
          coalesce(p_summary, '{}'::jsonb), coalesce(p_incidents, '[]'::jsonb), coalesce(p_events, '[]'::jsonb));
  return json_build_object('ok', true);
end $$;

-- this device stops posting to the crew; the crew keeps what was already saved
create or replace function public.{P}member_leave(p_token text) returns json
language plpgsql security definer set search_path = public, extensions as $$
begin
  delete from public.{P}crew_tokens where token_hash = public.{P}x_hash(p_token);
  return json_build_object('ok', true);
end $$;

-- ── INSTRUCTORS (the only accounts: auth.uid() must own the crew) ───────────────────────────────────────────────────
create or replace function public.{P}crew_create(p_name text, p_code text, p_mode text) returns json
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_code text := lower(regexp_replace(coalesce(p_code, ''), '[^a-zA-Z0-9_-]', '', 'g'));
        v_name text := btrim(coalesce(p_name, '')); v_mode text := coalesce(p_mode, 'pin');
begin
  if v_uid is null then return json_build_object('ok', false, 'err', 'Sign in first.'); end if;
  if length(v_name) < 2 or length(v_name) > 48 then return json_build_object('ok', false, 'err', 'Crew name: 2 to 48 characters.'); end if;
  if length(v_code) < 4 or length(v_code) > 24 then return json_build_object('ok', false, 'err', 'Join code: 4 to 24 letters or numbers.'); end if;
  if v_mode not in ('pin', 'manual') then return json_build_object('ok', false, 'err', 'Pick PIN or manual.'); end if;
  if (select count(*) from public.{P}crews where owner_uid = v_uid) >= 20 then return json_build_object('ok', false, 'err', 'An instructor can run 20 crews.'); end if;
  if exists (select 1 from public.{P}crews where code = v_code) then return json_build_object('ok', false, 'err', 'That join code is taken. Pick another.'); end if;
  insert into public.{P}crews (code, name, join_mode, owner_uid) values (v_code, v_name, v_mode, v_uid);
  return json_build_object('ok', true, 'code', v_code, 'name', v_name, 'mode', v_mode);
exception when unique_violation then
  return json_build_object('ok', false, 'err', 'That join code is taken. Pick another.');
end $$;

create or replace function public.{P}crew_mine() returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('code', c.code, 'name', c.name, 'mode', c.join_mode, 'licensed', c.licensed,
           'members', (select count(*) from public.{P}crew_members m where m.crew_code = c.code), 'created_at', c.created_at)
           order by c.created_at), '[]'::json)
    from public.{P}crews c where c.owner_uid = auth.uid();
$$;

create or replace function public.{P}crew_delete(p_code text) returns json
language plpgsql security definer set search_path = public as $$
begin
  delete from public.{P}crews where code = lower(btrim(coalesce(p_code, ''))) and owner_uid = auth.uid();
  if not found then return json_build_object('ok', false, 'err', 'Not your crew.'); end if;
  return json_build_object('ok', true);
end $$;

-- manual crews: the instructor adds a name and gets the personal code to hand to that person
create or replace function public.{P}crew_seat_add(p_code text, p_name text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v_code text := lower(btrim(coalesce(p_code, ''))); v_name text := btrim(coalesce(p_name, '')); c public.{P}crews; v_seat text; v_id uuid; i int := 0;
begin
  select * into c from public.{P}crews where code = v_code and owner_uid = auth.uid();
  if c.code is null then return json_build_object('ok', false, 'err', 'Not your crew.'); end if;
  if c.join_mode <> 'manual' then return json_build_object('ok', false, 'err', 'This is a PIN crew: people add themselves.'); end if;
  if length(v_name) < 2 or length(v_name) > 40 then return json_build_object('ok', false, 'err', 'Name: 2 to 40 characters.'); end if;
  if public.{P}x_crew_full(v_code) then return json_build_object('ok', false, 'err', 'A free crew holds 9 people. A license removes the limit.'); end if;
  if exists (select 1 from public.{P}crew_members where crew_code = v_code and lower(name) = lower(v_name)) then
    return json_build_object('ok', false, 'err', 'That name is already on this crew.');
  end if;
  loop
    v_seat := public.{P}x_seat_code(); i := i + 1;
    exit when not exists (select 1 from public.{P}crew_members where crew_code = v_code and seat_code = v_seat) or i > 10;
  end loop;
  insert into public.{P}crew_members (crew_code, name, seat_code) values (v_code, v_name, v_seat) returning id into v_id;
  return json_build_object('ok', true, 'id', v_id, 'name', v_name, 'seat', v_seat);
end $$;

-- a new personal code (manual) or a cleared PIN (pin); either way every device that member used is signed out
create or replace function public.{P}crew_member_reset(p_member uuid) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare m public.{P}crew_members; c public.{P}crews; v_seat text;
begin
  select * into m from public.{P}crew_members where id = p_member;
  select * into c from public.{P}crews where code = m.crew_code and owner_uid = auth.uid();
  if m.id is null or c.code is null then return json_build_object('ok', false, 'err', 'Not on your crew.'); end if;
  delete from public.{P}crew_tokens where member_id = m.id;
  if c.join_mode = 'manual' then
    v_seat := public.{P}x_seat_code();
    update public.{P}crew_members set seat_code = v_seat, failed = 0, locked_until = null where id = m.id;
    return json_build_object('ok', true, 'seat', v_seat);
  end if;
  update public.{P}crew_members set pin_hash = null, failed = 0, locked_until = null where id = m.id;
  return json_build_object('ok', true);
end $$;

create or replace function public.{P}crew_member_remove(p_member uuid) returns json
language plpgsql security definer set search_path = public as $$
begin
  delete from public.{P}crew_members m using public.{P}crews c
   where m.id = p_member and c.code = m.crew_code and c.owner_uid = auth.uid();
  if not found then return json_build_object('ok', false, 'err', 'Not on your crew.'); end if;
  return json_build_object('ok', true);
end $$;

create or replace function public.{P}crew_roster(p_code text)
returns table (id uuid, name text, seat text, pin_set boolean, locked boolean, joined timestamptz, last_seen timestamptz,
               sessions bigint, walls bigint, best_score integer, avg_integrity numeric, best_pph numeric,
               incidents bigint, collapses bigint)
language sql stable security definer set search_path = public as $$
  select m.id, m.name,
         case when c.join_mode = 'manual' then m.seat_code end,
         m.pin_hash is not null,
         coalesce(m.locked_until > now(), false),
         m.created_at, m.last_seen,
         (select count(*) from public.{P}crew_sessions s where s.member_id = m.id),
         (select count(*) from public.{P}crew_walls w where w.member_id = m.id),
         (select max(w.wall_score) from public.{P}crew_walls w where w.member_id = m.id),
         (select round(avg(w.integrity), 1) from public.{P}crew_walls w where w.member_id = m.id),
         (select round(max(case when w.dur_s > 0 then w.pieces * 3600.0 / w.dur_s end), 0) from public.{P}crew_walls w where w.member_id = m.id),
         (select coalesce(sum(w.incidents), 0) from public.{P}crew_walls w where w.member_id = m.id),
         (select coalesce(sum(w.collapses), 0) from public.{P}crew_walls w where w.member_id = m.id)
    from public.{P}crew_members m join public.{P}crews c on c.code = m.crew_code
   where c.code = lower(btrim(coalesce(p_code, ''))) and c.owner_uid = auth.uid()
   order by lower(m.name);
$$;

-- every wall on a crew, for the CSV export: licensed crews only
create or replace function public.{P}crew_export_walls(p_code text)
returns table (name text, mode text, score integer, pieces integer, dur_s integer, pph numeric, integrity integer,
               density integer, incidents integer, collapses integer, loaded_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.name, w.mode, w.wall_score, w.pieces, w.dur_s,
         case when w.dur_s > 0 then round(w.pieces * 3600.0 / w.dur_s, 0) end,
         w.integrity, w.density, w.incidents, w.collapses, w.created_at
    from public.{P}crew_walls w
    join public.{P}crew_members m on m.id = w.member_id
    join public.{P}crews c on c.code = m.crew_code
   where c.code = lower(btrim(coalesce(p_code, ''))) and c.owner_uid = auth.uid() and c.licensed
   order by w.created_at;
$$;

create or replace function public.{P}crew_export_sessions(p_code text)
returns table (name text, mode text, app_ver text, started_at timestamptz, ended_at timestamptz, duration_s integer,
               summary jsonb, incidents jsonb)
language sql stable security definer set search_path = public as $$
  select m.name, s.mode, s.app_ver, s.started_at, s.ended_at, s.duration_s, s.summary, s.incidents
    from public.{P}crew_sessions s
    join public.{P}crew_members m on m.id = s.member_id
    join public.{P}crews c on c.code = m.crew_code
   where c.code = lower(btrim(coalesce(p_code, ''))) and c.owner_uid = auth.uid() and c.licensed
   order by s.created_at;
$$;

-- ── WHO MAY CALL WHAT ───────────────────────────────────────────────────────────────────────────────────────────────
revoke all on function
  public.{P}arcade_sign(text, text, integer, integer, integer, integer), public.{P}arcade_board(text, text, integer),
  public.{P}count(text, text), public.{P}visit(), public.{P}crew_peek(text),
  public.{P}member_join_pin(text, text, text), public.{P}member_join_seat(text, text), public.{P}member_whoami(text),
  public.{P}member_log_wall(text, text, integer, integer, integer, integer, integer, integer, integer),
  public.{P}member_session(text, text, text, timestamptz, timestamptz, integer, jsonb, jsonb, jsonb),
  public.{P}member_leave(text),
  public.{P}crew_create(text, text, text), public.{P}crew_mine(), public.{P}crew_delete(text),
  public.{P}crew_seat_add(text, text), public.{P}crew_member_reset(uuid), public.{P}crew_member_remove(uuid),
  public.{P}crew_roster(text), public.{P}crew_export_walls(text), public.{P}crew_export_sessions(text)
  from public, anon, authenticated;
grant execute on function
  public.{P}arcade_sign(text, text, integer, integer, integer, integer), public.{P}arcade_board(text, text, integer),
  public.{P}count(text, text), public.{P}visit(), public.{P}crew_peek(text),
  public.{P}member_join_pin(text, text, text), public.{P}member_join_seat(text, text), public.{P}member_whoami(text),
  public.{P}member_log_wall(text, text, integer, integer, integer, integer, integer, integer, integer),
  public.{P}member_session(text, text, text, timestamptz, timestamptz, integer, jsonb, jsonb, jsonb),
  public.{P}member_leave(text)
  to anon, authenticated;
grant execute on function
  public.{P}crew_create(text, text, text), public.{P}crew_mine(), public.{P}crew_delete(text),
  public.{P}crew_seat_add(text, text), public.{P}crew_member_reset(uuid), public.{P}crew_member_remove(uuid),
  public.{P}crew_roster(text), public.{P}crew_export_walls(text), public.{P}crew_export_sessions(text)
  to authenticated;
