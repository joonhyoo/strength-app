-- =============================================================================
-- Program → Cycle → Week → Session → Exercise template hierarchy, plus
-- assigning a template onto a real athlete calendar and shifting an
-- already-assigned schedule forward/backward. Additive only: every existing
-- athlete_workouts row and every existing query keeps working unchanged —
-- the two new columns on that table are nullable, and nothing here is
-- required in order for the current day-by-day flow to keep functioning.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tables: template layer (coach-owned, athlete/date-agnostic)
-- -----------------------------------------------------------------------------

create table programs (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now()
);

create index programs_coach_id_idx on programs (coach_id);

create table cycles (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id) on delete cascade,
  name text not null,
  goal text not null default '',
  -- Keyed to the app's own CSS tokens (--color-sky/--color-cream/--color-primary
  -- in src/routes/layout.css) rather than a raw hex, so a cycle band always
  -- renders in an on-theme color and the palette can't drift from the rest
  -- of the app.
  color_key text not null default 'sky' check (color_key in ('sky', 'cream', 'primary')),
  -- Rank-only, like athlete_exercises.position: date generation (see
  -- assign_program below) uses each cycle's sorted position among its
  -- siblings, never this raw value, so a deleted cycle never leaves an
  -- accidental blank calendar week for the ones after it.
  position int not null
);

create index cycles_program_id_idx on cycles (program_id);

create table weeks (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references cycles(id) on delete cascade,
  -- Rank-only, same reasoning as cycles.position.
  week_number int not null
);

create index weeks_cycle_id_idx on weeks (cycle_id);
create unique index weeks_cycle_week_number_key on weeks (cycle_id, week_number);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references weeks(id) on delete cascade,
  -- NOT rank-only, unlike the two columns above: this is a real 1=Mon..7=Sun
  -- weekday offset consumed directly in date math. A missing day_number is an
  -- ordinary rest day, not a gap to compact — renumbering these on a session
  -- delete would silently move a real remaining session onto a different
  -- weekday than the one it was actually built for.
  day_number int not null check (day_number between 1 and 7),
  name text not null default ''
);

create index sessions_week_id_idx on sessions (week_id);
create unique index sessions_week_day_number_key on sessions (week_id, day_number);

create table program_exercises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  exercise_id uuid not null references exercises(id),
  position int not null,
  note text not null default ''
);

create index program_exercises_session_id_idx on program_exercises (session_id);

create table program_sets (
  id uuid primary key default gen_random_uuid(),
  program_exercise_id uuid not null references program_exercises(id) on delete cascade,
  set_number int not null,
  target_reps int not null
);

create index program_sets_exercise_id_idx on program_sets (program_exercise_id);

-- -----------------------------------------------------------------------------
-- Tables: assignment layer
-- -----------------------------------------------------------------------------

create table program_assignments (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs(id) on delete cascade,
  athlete_id uuid not null references profiles(id) on delete cascade,
  start_date date not null,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  created_at timestamptz not null default now()
);

create index program_assignments_athlete_id_idx on program_assignments (athlete_id);

-- One active assignment per athlete at a time — doesn't block historical
-- completed/cancelled assignments from coexisting alongside it.
create unique index program_assignments_one_active_per_athlete
  on program_assignments (athlete_id)
  where (status = 'active');

-- Additive, nullable links on the EXISTING table. `on delete set null` (not
-- cascade) is deliberate: deleting a program template cascades down to
-- program_assignments, but must never delete an athlete's already-scheduled
-- or already-logged training data — it should only orphan the breadcrumb
-- link back to the template that generated it.
alter table athlete_workouts
  add column program_assignment_id uuid references program_assignments(id) on delete set null,
  add column session_id uuid references sessions(id) on delete set null;

create index athlete_workouts_assignment_id_idx on athlete_workouts (program_assignment_id);

-- -----------------------------------------------------------------------------
-- RLS helpers (security definer, mirroring is_my_athlete()'s existing style).
-- At five levels deep (program_sets -> program_exercises -> sessions ->
-- weeks -> cycles -> programs), an inline exists() chain repeated in every
-- policy gets unreadable fast — cascade through small helpers instead, each
-- trivially correct on its own and auditable independently of the others.
-- -----------------------------------------------------------------------------

create or replace function is_program_owner(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from programs where id = p_program_id and coach_id = auth.uid()
  );
$$;

create or replace function is_cycle_owner(p_cycle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from cycles c where c.id = p_cycle_id and is_program_owner(c.program_id)
  );
$$;

create or replace function is_week_owner(p_week_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from weeks w where w.id = p_week_id and is_cycle_owner(w.cycle_id)
  );
$$;

create or replace function is_session_owner(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from sessions s where s.id = p_session_id and is_week_owner(s.week_id)
  );
$$;

revoke all on function is_program_owner(uuid) from public;
revoke all on function is_cycle_owner(uuid) from public;
revoke all on function is_week_owner(uuid) from public;
revoke all on function is_session_owner(uuid) from public;
grant execute on function is_program_owner(uuid) to authenticated;
grant execute on function is_cycle_owner(uuid) to authenticated;
grant execute on function is_week_owner(uuid) to authenticated;
grant execute on function is_session_owner(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- RPCs
-- -----------------------------------------------------------------------------

-- Coach-only: materializes a template onto one athlete's real calendar,
-- starting on p_start_date (must be a Monday — a program's weeks are a unit,
-- so a mid-week start would desync every subsequent week from real calendar
-- boundaries). Warn-and-replace, not hard-block: any existing
-- athlete_workouts row on a target date is deleted (cascading to its own
-- athlete_exercises/athlete_sets) before the fresh one is inserted. The
-- caller's UI is expected to have already shown the coach a conflict
-- preview — this function is the actual safety net in the sense that it
-- never merges/duplicates, but it does not itself refuse on conflict.
create or replace function assign_program(p_program_id uuid, p_athlete_id uuid, p_start_date date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment_id uuid;
  v_week_rank int := 0;
  v_week record;
  v_session record;
  v_pe record;
  v_scheduled_date date;
  v_workout_id uuid;
  v_athlete_exercise_id uuid;
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'coach') then
    raise exception 'only a coach can assign a program';
  end if;

  if not is_program_owner(p_program_id) then
    raise exception 'not_found';
  end if;

  if not exists (select 1 from profiles where id = p_athlete_id and coach_id = auth.uid()) then
    raise exception 'not_your_athlete';
  end if;

  if extract(isodow from p_start_date)::int <> 1 then
    raise exception 'start_date_must_be_monday';
  end if;

  -- Reassignment is frictionless, matching every other warn-and-replace path
  -- here: the caller's conflict preview is the only gate the coach sees, not
  -- a separate "cancel their current program first" step. The partial unique
  -- index on (athlete_id) where status='active' still enforces at most one
  -- active row as a data invariant — this update is what keeps a normal
  -- reassignment from ever hitting it.
  update program_assignments
  set status = 'cancelled'
  where athlete_id = p_athlete_id and status = 'active';

  insert into program_assignments (program_id, athlete_id, start_date, status)
  values (p_program_id, p_athlete_id, p_start_date, 'active')
  returning id into v_assignment_id;

  for v_week in
    select w.id
    from weeks w
    join cycles c on c.id = w.cycle_id
    where c.program_id = p_program_id
    order by c.position, w.week_number
  loop
    for v_session in
      select s.id, s.day_number, s.name
      from sessions s
      where s.week_id = v_week.id
      order by s.day_number
    loop
      v_scheduled_date := p_start_date + (v_week_rank * 7) + (v_session.day_number - 1);

      delete from athlete_workouts
      where athlete_id = p_athlete_id and scheduled_date = v_scheduled_date;

      insert into athlete_workouts (athlete_id, scheduled_date, program_assignment_id, session_id)
      values (p_athlete_id, v_scheduled_date, v_assignment_id, v_session.id)
      returning id into v_workout_id;

      for v_pe in
        select pe.id, pe.exercise_id, pe.position, pe.note, e.category
        from program_exercises pe
        join exercises e on e.id = pe.exercise_id
        where pe.session_id = v_session.id
        order by pe.position
      loop
        insert into athlete_exercises (athlete_workout_id, exercise_id, position, note, complete)
        values (v_workout_id, v_pe.exercise_id, v_pe.position, v_pe.note, false)
        returning id into v_athlete_exercise_id;

        -- Matches addExercise's existing conditional exactly: only 'weight'
        -- category exercises ever get set rows today.
        if v_pe.category = 'weight' then
          insert into athlete_sets (athlete_exercise_id, set_number, target_reps)
          select v_athlete_exercise_id, ps.set_number, ps.target_reps
          from program_sets ps
          where ps.program_exercise_id = v_pe.id
          order by ps.set_number;
        end if;
      end loop;
    end loop;

    v_week_rank := v_week_rank + 1;
  end loop;

  return v_assignment_id;
end;
$$;

revoke all on function assign_program(uuid, uuid, date) from public;
grant execute on function assign_program(uuid, uuid, date) to authenticated;

-- Coach-only: moves every athlete_workouts row belonging to this assignment
-- from p_from_date (must be a Monday) onward by whole weeks — earlier weeks
-- are untouched. Same warn-and-replace contract as assign_program.
--
-- Mechanics: a single `set scheduled_date = scheduled_date + n` isn't used
-- here — whether Postgres's unique-constraint check tolerates that within
-- one multi-row UPDATE depends on internal row-processing order that isn't
-- worth betting on. Instead this reuses the two-phase temp-value idiom
-- moveExercise already establishes for `position` swaps, adapted to dates:
-- park every moving row far in the future first (so distinct source dates
-- can never collide with each other regardless of order), clear whatever
-- already sits at each row's real destination (necessarily an external row,
-- since every moving row is off in temp-offset territory at that point, not
-- at its destination), then land everything on its real final date.
create or replace function shift_program_schedule(p_assignment_id uuid, p_from_date date, p_shift_weeks int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_program_id uuid;
  v_athlete_id uuid;
  v_shift_days int := p_shift_weeks * 7;
  v_moved_count int;
  v_dest_dates date[];
begin
  if extract(isodow from p_from_date)::int <> 1 then
    raise exception 'from_date_must_be_monday';
  end if;

  if p_shift_weeks = 0 then
    raise exception 'shift_weeks_must_not_be_zero';
  end if;

  select program_id, athlete_id into v_program_id, v_athlete_id
  from program_assignments where id = p_assignment_id;

  if v_program_id is null or not is_program_owner(v_program_id) then
    raise exception 'not_found';
  end if;

  update athlete_workouts
  set scheduled_date = scheduled_date + 36500
  where program_assignment_id = p_assignment_id and scheduled_date >= p_from_date;

  get diagnostics v_moved_count = row_count;

  select array_agg(scheduled_date - 36500 + v_shift_days)
  into v_dest_dates
  from athlete_workouts
  where program_assignment_id = p_assignment_id and scheduled_date >= p_from_date + 36500;

  delete from athlete_workouts
  where athlete_id = v_athlete_id and scheduled_date = any (v_dest_dates);

  update athlete_workouts
  set scheduled_date = scheduled_date - 36500 + v_shift_days
  where program_assignment_id = p_assignment_id and scheduled_date >= p_from_date + 36500;

  return v_moved_count;
end;
$$;

revoke all on function shift_program_schedule(uuid, date, int) from public;
grant execute on function shift_program_schedule(uuid, date, int) to authenticated;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table programs enable row level security;
alter table cycles enable row level security;
alter table weeks enable row level security;
alter table sessions enable row level security;
alter table program_exercises enable row level security;
alter table program_sets enable row level security;
alter table program_assignments enable row level security;

-- programs: coach owns and fully controls their own. The explicit is_coach()
-- check matters here specifically — nothing else stops an athlete-role
-- profile from being written as programs.coach_id, unlike profiles.coach_id
-- which is only ever set via the role-checked invite/claim RPCs. Everything
-- below programs transitively inherits coach-ness through is_program_owner,
-- so it isn't re-checked at every level.
create policy "Coach manages own programs"
  on programs for all
  to authenticated
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid() and is_coach());

grant select, insert, update, delete on programs to authenticated;

create policy "Coach manages own cycles"
  on cycles for all
  to authenticated
  using (is_program_owner(program_id))
  with check (is_program_owner(program_id));

grant select, insert, update, delete on cycles to authenticated;

create policy "Coach manages own weeks"
  on weeks for all
  to authenticated
  using (is_cycle_owner(cycle_id))
  with check (is_cycle_owner(cycle_id));

grant select, insert, update, delete on weeks to authenticated;

create policy "Coach manages own sessions"
  on sessions for all
  to authenticated
  using (is_week_owner(week_id))
  with check (is_week_owner(week_id));

grant select, insert, update, delete on sessions to authenticated;

create policy "Coach manages own program exercises"
  on program_exercises for all
  to authenticated
  using (is_session_owner(session_id))
  with check (is_session_owner(session_id));

grant select, insert, update, delete on program_exercises to authenticated;

create policy "Coach manages own program sets"
  on program_sets for all
  to authenticated
  using (
    exists (select 1 from program_exercises pe where pe.id = program_exercise_id and is_session_owner(pe.session_id))
  )
  with check (
    exists (select 1 from program_exercises pe where pe.id = program_exercise_id and is_session_owner(pe.session_id))
  );

grant select, insert, update, delete on program_sets to authenticated;

-- program_assignments: split policies, since read and write access are
-- genuinely asymmetric here (unlike the template tables above). The insert
-- and update checks need BOTH conditions — is_my_athlete alone would let an
-- athlete insert/update their own assignment row (is_my_athlete(self) is
-- trivially true), and is_program_owner alone would let a coach assign their
-- own template to an athlete who isn't theirs.
create policy "Coach or athlete read assignment"
  on program_assignments for select
  to authenticated
  using (is_my_athlete(athlete_id));

create policy "Coach creates assignment for their own athlete"
  on program_assignments for insert
  to authenticated
  with check (is_my_athlete(athlete_id) and is_program_owner(program_id));

create policy "Coach updates own assignment"
  on program_assignments for update
  to authenticated
  using (is_my_athlete(athlete_id) and is_program_owner(program_id))
  with check (is_my_athlete(athlete_id) and is_program_owner(program_id));

-- No delete grant: an assignment is retired via a status update (e.g. to
-- 'cancelled'), never removed outright, matching program_assignments'
-- own real-world semantics as a history of what an athlete was ever on.
grant select, insert, update on program_assignments to authenticated;
