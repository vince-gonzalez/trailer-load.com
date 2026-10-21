-- lockin-4.0-retire.sql · retire the LOCK IN 3 player accounts on PRODUCTION (the Lock-In project). Never the sandbox.
--
-- RUN ONCE, ON VINCE'S CLICK, AFTER: (1) .db/lockin-4.0.sql has run on production with the lockin_ prefix, and
-- (2) the 4.0 site is live. IRREVERSIBLE. There is no undo; nothing here keeps a copy.
-- His decision, 2026-10-20: the 21 existing accounts are deleted when 4.0 ships.
--
-- In one transaction:
--   1. the 3.x monthly purge stops and the 4.0 one starts: an instructor account with no sign-in for 24 months is
--      deleted with its crews, except the instructor of a licensed crew (the same exemption 3.x had)
--   2. every arcade signature stays; its link to an account is removed
--   3. every 3.x player record goes: sessions, walls, daily scores, follows, recovery codes, handles, 3.x crews, seasons
--   4. the 3.x functions, views, triggers and private helpers go, so a browser still running a cached 3.x page can
--      write nothing (no sign-up, no session, no follow)
--   5. every account from before 4.0 is deleted, with its sign-ins: the 20 player accounts (username@players.lockin.app)
--      and the one email login (last signed in 2026-06-08; his call 2026-10-20: "Delete it with the players"). An account
--      made on or after 2026-10-21, or one that runs a 4.0 crew, is never touched, so a 4.0 instructor account is safe
--      whichever order the ship steps run in.

begin;

-- 1. the purge
select cron.unschedule(jobid) from cron.job where command like '%purge_inactive_accounts%';
create or replace function lockin_private.purge_inactive_instructors() returns integer
language plpgsql security definer set search_path = public, auth as $$
declare n integer;
begin
  delete from auth.users u
   where greatest(coalesce(u.last_sign_in_at, u.created_at), u.created_at) < now() - interval '24 months'
     and not exists (select 1 from public.lockin_crews c where c.owner_uid = u.id and c.licensed);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function lockin_private.purge_inactive_instructors() from public, anon, authenticated;
select cron.schedule('lockin-purge-inactive-instructors', '30 4 1 * *', 'select lockin_private.purge_inactive_instructors()');

-- 2. signatures stay, unlinked
update public.lockin_arcade set user_id = null where user_id is not null;

-- 3 and 4. the 3.x views, functions and tables
drop view if exists lockin_private.showcase_people, public.lockin_showcase_wall, public.lockin_showcase_session,
  public.lockin_showcase_guests, public.lockin_showcase, public.lockin_master_roster, public.lockin_guests,
  public.lockin_cohort_wall, public.lockin_cohort_session, public.lockin_cohort_broken_20261002, public.lockin_cohort,
  public.lockin_lifetime, public.lockin_daily_board, public.lockin_walls_seasoned cascade;
drop function if exists
  public.lockin_alltime_board(integer), public.lockin_crew_create(text, text), public.lockin_crew_join(text),
  public.lockin_crew_leave(), public.lockin_crew_lookup(text), public.lockin_daily_alltime(), public.lockin_follow(text),
  public.lockin_friends_board(), public.lockin_log_wall(text, integer, integer, integer, integer, integer, integer, integer),
  public.lockin_my_signatures(integer), public.lockin_reset_with_hex(text, text, text),
  public.lockin_season_board(smallint, text, integer), public.lockin_season_of(timestamptz), public.lockin_set_recovery(text),
  public.lockin_set_squad(boolean), public.lockin_smalls_board(text, integer), public.lockin_stats(),
  public.lockin_submit_daily(integer, integer, integer, integer), public.lockin_total_board(integer),
  public.lockin_unfollow(text), public.lockin_wall_board(text, integer), public.lockin_worker_signup(text, text) cascade;
drop table if exists public.lockin_sessions, public.lockin_walls, public.lockin_daily, public.lockin_follows,
  public.lockin_recovery, public.lockin_handles, public.lockin_facilities, public.lockin_seasons cascade;
drop function if exists lockin_private.facilities_keep_license(), lockin_private.handles_self_insert_guard(),
  lockin_private.pseudo(uuid), lockin_private.purge_inactive_accounts(), lockin_private.sessions_no_email(),
  lockin_private.share_active(uuid), lockin_private.showcase_guest_rows(), lockin_private.showcase_life(),
  lockin_private.showcase_ok(), lockin_private.showcase_sessions(), lockin_private.showcase_walls() cascade;

-- 5. every account from before 4.0
delete from auth.users u
 where u.email like '%@players.lockin.app'
    or (u.created_at < timestamptz '2026-10-21 00:00:00+00'
        and not exists (select 1 from public.lockin_crews c where c.owner_uid = u.id));

commit;

-- AFTER: confirm with a read
--   select count(*) from auth.users;                         -- only 4.0 instructor accounts
--   select count(*) from public.lockin_arcade where user_id is not null;   -- 0
--   select jobname, schedule from cron.job;                  -- lockin-purge-inactive-instructors, 30 4 1 * *
