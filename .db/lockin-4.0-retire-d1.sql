-- lockin-4.0-retire-d1.sql · retire LOCK IN 3 on the old database (the Lock-In project), now that 4.0 runs on its own API
-- and database. This replaces lockin-4.0-retire.sql, which was written when 4.0 was going to live on this database:
-- that script deletes accounts by reading a 4.0 crews table that was never made here, so it would stop with an error
-- and change nothing.
--
-- RUN ONCE, ON MY CLICK, AFTER the 4.0 site is live. IRREVERSIBLE: no undo, no copy.
-- Read from this database 2026-10-23 before it was written: 21 accounts (the 20 player accounts and the one email
-- login), all made before 2026-10-21; one cron job; 27 public functions, 11 private ones, 15 views.
--
-- In one transaction:
--   1. the monthly purge job stops (there is nothing left here for it to purge)
--   2. the four board signatures stay as initials; the one link from a signature to an account is removed
--   3. every 3.x view and function goes, so a browser still showing a cached 3.x page can write nothing
--   4. every 3.x player table goes: sessions, walls, daily scores, follows, recovery codes, handles, facilities, seasons
--   5. every account goes: the 20 player accounts and the one email login (my call 2026-10-20: "Delete it with the
--      players"), with their sign-ins
-- Kept: lockin_counters and lockin_event_counts (daily totals, no person in them) and lockin_arcade (initials only).

begin;

-- 1. the purge job
select cron.unschedule('lockin-purge-inactive-24mo');

-- 2. signatures stay, unlinked
update public.lockin_arcade set user_id = null where user_id is not null;

-- 3. views and functions
drop view if exists lockin_private.showcase_people, public.lockin_showcase_wall, public.lockin_showcase_session,
  public.lockin_showcase_guests, public.lockin_showcase, public.lockin_master_roster, public.lockin_guests,
  public.lockin_cohort_wall, public.lockin_cohort_session, public.lockin_cohort_broken_20261002, public.lockin_cohort,
  public.lockin_lifetime, public.lockin_daily_board, public.lockin_walls_seasoned, public.lockin_funnel cascade;
drop function if exists
  public.lockin_alltime_board(integer), public.lockin_arcade_board(text, text, integer),
  public.lockin_arcade_sign(text, text, integer, integer, integer, integer), public.lockin_count(text, text),
  public.lockin_crew_create(text, text), public.lockin_crew_join(text), public.lockin_crew_leave(),
  public.lockin_crew_lookup(text), public.lockin_crew_mine(), public.lockin_daily_alltime(), public.lockin_follow(text),
  public.lockin_friends_board(), public.lockin_log_wall(text, integer, integer, integer, integer, integer, integer, integer),
  public.lockin_my_signatures(integer), public.lockin_reset_with_hex(text, text, text),
  public.lockin_season_board(smallint, text, integer), public.lockin_season_of(timestamptz), public.lockin_set_recovery(text),
  public.lockin_set_squad(boolean), public.lockin_smalls_board(text, integer), public.lockin_stats(),
  public.lockin_submit_daily(integer, integer, integer, integer), public.lockin_total_board(integer),
  public.lockin_unfollow(text), public.lockin_visit(), public.lockin_wall_board(text, integer),
  public.lockin_worker_signup(text, text) cascade;
drop function if exists lockin_private.facilities_keep_license(), lockin_private.handles_self_insert_guard(),
  lockin_private.pseudo(uuid), lockin_private.purge_inactive_accounts(), lockin_private.sessions_no_email(),
  lockin_private.share_active(uuid), lockin_private.showcase_guest_rows(), lockin_private.showcase_life(),
  lockin_private.showcase_ok(), lockin_private.showcase_sessions(), lockin_private.showcase_walls() cascade;

-- 4. the player tables
drop table if exists public.lockin_sessions, public.lockin_walls, public.lockin_daily, public.lockin_follows,
  public.lockin_recovery, public.lockin_handles, public.lockin_facilities, public.lockin_seasons cascade;

-- 5. every account from before 4.0
delete from auth.users where email like '%@players.lockin.app' or created_at < timestamptz '2026-10-21 00:00:00+00';

commit;

-- AFTER, a read to confirm (each should say 0, and the last should list no lockin_ function):
--   select count(*) from auth.users;
--   select count(*) from cron.job;
--   select count(*) from public.lockin_arcade where user_id is not null;
--   select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and proname like 'lockin%';
