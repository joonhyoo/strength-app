-- =============================================================================
-- Full schema, squashed from the incremental history below into one migration
-- before this ever reaches hosted Supabase (nothing has been pushed yet, so
-- there's no live data or applied-migration state to preserve). Reflects the
-- final current-state schema only — abandoned approaches (a `coaches`/
-- `athletes` table pair later replaced by `profiles`, an exercise
-- `description` column added then dropped, a join-code mechanism fully
-- replaced by coach-curated email invites) are not represented here, since
-- they never exist in the resulting database either way.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

-- id IS the auth user id.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text default '',
  role text not null check (role in ('coach', 'athlete')),
  coach_id uuid references profiles(id) on delete set null,
  notes text default '',
  created_at timestamptz not null default now(),
  terms_accepted_at timestamptz
);

-- Backs is_my_athlete()'s `coach_id = auth.uid()` lookup below, run on
-- effectively every workout/exercise/set RLS check.
create index profiles_coach_id_idx on profiles (coach_id);

-- Private per-user data with no coach-read clause at all in its RLS (see
-- below) — a username column on `profiles` itself would be coach-readable
-- regardless of what the app chooses to display, since profiles' own SELECT
-- policy already lets a coach read their athletes' full rows.
create table profile_private (
  id uuid primary key references profiles(id) on delete cascade,
  username text not null
);

create unique index profile_private_username_key on profile_private (lower(username));

create table exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null check (category in ('warmup', 'circuit', 'plyo', 'weight')),
  -- Optional demo-video link. Nullable, no default — most exercises won't
  -- have one yet. Frontend (coach library create/edit UI) wired up later.
  video_url text
);

-- `unique (athlete_id, scheduled_date)` below already gives athlete_id a
-- usable leading index for the is_my_athlete() lookups every RLS policy on
-- this table (and, transitively, athlete_exercises/athlete_sets) runs.
create table athlete_workouts (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references profiles(id) on delete cascade,
  scheduled_date date not null,
  unique (athlete_id, scheduled_date)
);

create table athlete_exercises (
  id uuid primary key default gen_random_uuid(),
  athlete_workout_id uuid not null references athlete_workouts(id) on delete cascade,
  exercise_id uuid not null references exercises(id),
  position int not null,
  note text default '',
  complete boolean not null default false
);

-- Postgres doesn't auto-index FK columns (only PKs/uniques) — these back the
-- `exists()` subqueries in athlete_exercises'/athlete_sets' own RLS policies
-- below, which join back up through this column on every request.
create index athlete_exercises_workout_id_idx on athlete_exercises (athlete_workout_id);

create table athlete_sets (
  id uuid primary key default gen_random_uuid(),
  athlete_exercise_id uuid not null references athlete_exercises(id) on delete cascade,
  set_number int not null,
  target_reps int not null,
  weight text,
  reps int
);

create index athlete_sets_exercise_id_idx on athlete_sets (athlete_exercise_id);

-- A "pending invite" is simply a row's existence. No consumed_at/joined_at
-- column — claim_invite() (below) DELETEs the row as part of the same
-- statement that sets coach_id, so "pending" IS "exists". Appropriate for
-- ~10 users; a soft-delete audit trail is not needed.
create table coach_invites (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references profiles(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

-- Globally unique (not per coach_id+email): only one coach per athlete is
-- supported, so two coaches racing to invite the same address must be
-- rejected rather than silently letting the second overwrite/duplicate.
create unique index coach_invites_email_key on coach_invites (lower(email));
create index coach_invites_coach_id_idx on coach_invites (coach_id);

-- -----------------------------------------------------------------------------
-- profiles: auto-create on signup, but only once the athlete has actually
-- confirmed ownership of the email — not at raw signup time, which would
-- link an unconfirmed, unverified auth.users row to a coach. Two triggers
-- share this function: the INSERT-time one fires immediately for rows
-- already confirmed at insert (e.g. seed.sql's test accounts, or an
-- admin-created user) since those never reach the UPDATE path at all; the
-- UPDATE-time one fires exactly once, at the moment email_confirmed_at
-- transitions from null to set — which for a real OTP signup is inside
-- GoTrue's verifyOtp call, i.e. after the athlete has actually proven they
-- own the inbox.
-- -----------------------------------------------------------------------------

create or replace function handle_new_user()
returns trigger as $$
begin
  if new.email_confirmed_at is null then
    return new;
  end if;

  insert into profiles (id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.email, ''),
    'athlete'
  )
  on conflict (id) do nothing;

  return new;
end;
$$ language plpgsql security definer
   set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function handle_new_user();

-- -----------------------------------------------------------------------------
-- RLS helpers (security definer: bypass RLS internally so these can't
-- recurse into the very policies they're used by, regardless of how those
-- policies are shaped).
-- -----------------------------------------------------------------------------

create or replace function is_coach()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'coach'
  );
$$;

create or replace function is_my_athlete(p_athlete_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_athlete_id = auth.uid()
    or exists (
      select 1 from profiles where id = p_athlete_id and coach_id = auth.uid()
    );
$$;

revoke all on function is_coach() from public;
revoke all on function is_my_athlete(uuid) from public;
grant execute on function is_coach() to authenticated;
grant execute on function is_my_athlete(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- RPCs
-- -----------------------------------------------------------------------------

-- Lets an authenticated user stamp acceptance on their own row without
-- needing a general UPDATE policy/grant on profiles (there isn't one).
create or replace function accept_terms()
returns void
language sql
security definer
set search_path = public
as $$
  update profiles set terms_accepted_at = now() where id = auth.uid();
$$;

revoke all on function accept_terms() from public;
grant execute on function accept_terms() to authenticated;

create or replace function complete_profile(p_username text, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  norm_username text := lower(trim(p_username));
  trimmed_name text := trim(p_name);
begin
  if not exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'not_found';
  end if;

  if norm_username !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'invalid_username';
  end if;

  if trimmed_name = '' or length(trimmed_name) > 60 then
    raise exception 'invalid_name';
  end if;

  if exists (
    select 1 from profile_private
    where lower(username) = norm_username and id <> auth.uid()
  ) then
    raise exception 'username_taken';
  end if;

  update profiles set name = trimmed_name where id = auth.uid();

  insert into profile_private (id, username)
  values (auth.uid(), norm_username)
  on conflict (id) do update set username = excluded.username;
end;
$$;

revoke all on function complete_profile(text, text) from public;
grant execute on function complete_profile(text, text) to authenticated;

-- Coach-only: invite (or re-invite) an athlete by email.
create or replace function invite_athlete(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  norm_email text := lower(trim(p_email));
  existing_coach uuid;
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'coach') then
    raise exception 'only a coach can invite athletes';
  end if;

  if norm_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email';
  end if;

  -- A profile existing isn't itself disqualifying — an athlete who verified
  -- their OTP but never got linked (e.g. the coach revoked the invite in
  -- the window between send_code and verify_code) still has a profile row
  -- with coach_id null. That athlete needs to be re-invitable. Only a
  -- *linked* athlete, or any coach, is genuinely already spoken for.
  if exists (
    select 1 from profiles
    where lower(email) = norm_email
      and (role <> 'athlete' or coach_id is not null)
  ) then
    raise exception 'already_registered';
  end if;

  select coach_id into existing_coach from coach_invites where lower(email) = norm_email;

  if existing_coach is not null and existing_coach <> auth.uid() then
    raise exception 'already_invited_by_another_coach';
  end if;

  insert into coach_invites (coach_id, email)
  values (auth.uid(), norm_email)
  on conflict (lower(email)) do update set created_at = now();
end;
$$;

-- Coach-only: revoke a pending invite they own.
create or replace function revoke_invite(p_email text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from coach_invites
  where coach_id = auth.uid() and lower(email) = lower(trim(p_email));
$$;

revoke all on function invite_athlete(text) from public;
revoke all on function revoke_invite(text) from public;
grant execute on function invite_athlete(text) to authenticated;
grant execute on function revoke_invite(text) to authenticated;

-- Athlete-only: claims a pending invite matching the caller's own
-- (now-confirmed) email, called from verify_code right after a successful
-- OTP verification — this is the actual "email ownership proven" moment,
-- not account-creation time. No-ops (does not raise) if the caller isn't an
-- unlinked athlete, or no matching invite exists (e.g. the coach revoked it
-- between signup and verify) — either case is a normal, expected outcome,
-- not an error.
create or replace function claim_invite()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_invite coach_invites%rowtype;
  caller profiles%rowtype;
begin
  select * into caller from profiles where id = auth.uid();

  if caller.id is null or caller.role <> 'athlete' or caller.coach_id is not null then
    return;
  end if;

  select * into matched_invite
    from coach_invites
    where lower(email) = lower(caller.email)
    limit 1;

  if matched_invite.id is null then
    return;
  end if;

  update profiles set coach_id = matched_invite.coach_id where id = caller.id;
  delete from coach_invites where id = matched_invite.id;
end;
$$;

revoke all on function claim_invite() from public;
grant execute on function claim_invite() to authenticated;

-- Coach-only: unlink an athlete from the caller's own roster. Does not touch
-- their account or workout history.
create or replace function remove_athlete(p_athlete_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'coach') then
    raise exception 'only a coach can remove an athlete';
  end if;

  update profiles
  set coach_id = null
  where id = p_athlete_id and coach_id = auth.uid();

  if not found then
    raise exception 'not_found';
  end if;
end;
$$;

revoke all on function remove_athlete(uuid) from public;
grant execute on function remove_athlete(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table profiles enable row level security;
alter table profile_private enable row level security;
alter table exercises enable row level security;
alter table athlete_workouts enable row level security;
alter table athlete_exercises enable row level security;
alter table athlete_sets enable row level security;
alter table coach_invites enable row level security;

-- profiles: see your own row, or (as a coach) your athletes' rows. Direct
-- column comparison, no subquery into profiles itself, so this can't
-- recurse. No insert/update/delete policy — mutations only via the
-- security-definer RPCs above.
create policy "Read own or coached profiles"
  on profiles for select
  to authenticated
  using (id = auth.uid() or coach_id = auth.uid());

grant select on profiles to authenticated;

-- profile_private: no coach-read clause at all — this is what actually keeps
-- it private, not just omitted from the UI.
create policy "Read own username only"
  on profile_private for select
  to authenticated
  using (id = auth.uid());

grant select on profile_private to authenticated;

-- exercises: shared catalog, readable by anyone authenticated (not
-- per-athlete data), but only coaches can create/edit/delete definitions.
create policy "Authenticated read exercises"
  on exercises for select
  to authenticated
  using (true);

create policy "Coach insert exercises"
  on exercises for insert
  to authenticated
  with check (is_coach());

create policy "Coach update exercises"
  on exercises for update
  to authenticated
  using (is_coach())
  with check (is_coach());

create policy "Coach delete exercises"
  on exercises for delete
  to authenticated
  using (is_coach());

grant select, insert, update, delete on exercises to authenticated;

-- athlete_workouts / athlete_exercises / athlete_sets: own data, or your
-- coach's/your athlete's data, scoped via is_my_athlete() through the parent
-- (and grandparent) workout's athlete.
create policy "Own or coached workouts"
  on athlete_workouts for all
  to authenticated
  using (is_my_athlete(athlete_id))
  with check (is_my_athlete(athlete_id));

grant select, insert, update, delete on athlete_workouts to authenticated;

create policy "Own or coached exercises"
  on athlete_exercises for all
  to authenticated
  using (
    exists (
      select 1 from athlete_workouts w
      where w.id = athlete_workout_id and is_my_athlete(w.athlete_id)
    )
  )
  with check (
    exists (
      select 1 from athlete_workouts w
      where w.id = athlete_workout_id and is_my_athlete(w.athlete_id)
    )
  );

grant select, insert, update, delete on athlete_exercises to authenticated;

create policy "Own or coached sets"
  on athlete_sets for all
  to authenticated
  using (
    exists (
      select 1 from athlete_exercises ae
      join athlete_workouts w on w.id = ae.athlete_workout_id
      where ae.id = athlete_exercise_id and is_my_athlete(w.athlete_id)
    )
  )
  with check (
    exists (
      select 1 from athlete_exercises ae
      join athlete_workouts w on w.id = ae.athlete_workout_id
      where ae.id = athlete_exercise_id and is_my_athlete(w.athlete_id)
    )
  );

grant select, insert, update, delete on athlete_sets to authenticated;

-- coach_invites: a coach reads only their own pending invites.
create policy "Coach reads own invites"
  on coach_invites for select
  to authenticated
  using (coach_id = auth.uid());

grant select on coach_invites to authenticated;
-- send_code (login/+page.server.ts) queries this table directly via the
-- service-role client to decide shouldCreateUser before a session exists, so
-- PostgREST needs the table-level grant same as any other role —
-- service_role's RLS bypass alone doesn't imply it.
grant select on coach_invites to service_role;
-- No insert/update/delete grants — mutations only via the security-definer
-- RPCs above, same pattern as profiles (grant select only).
