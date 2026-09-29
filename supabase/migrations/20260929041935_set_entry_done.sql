-- =============================================================================
-- Moves exercise completion from a per-exercise flag onto a per-unit flag.
--
-- Until now `athlete_exercises.complete` was the ONLY place a completion could
-- live, which forced two shapes into one column: a manual "done" tap for
-- conditioning, and dead weight for `weight` (whose completion is derived from
-- the sets) and `note` (which is excluded from completion math entirely). This
-- makes the column agree with the model instead: EVERY exercise is a list of
-- units of work in athlete_sets, and a unit is complete when its required input
-- is present — a `weight` for a weight set, the athlete's own tap for a
-- conditioning unit.
--
-- Consequences of that, in the same migration:
--   - `target_reps` becomes nullable, because a conditioning unit prescribes
--     nothing. A 0 sentinel would have been the alternative, but nothing stops a
--     future `plan = sets.map(s => s.target_reps)` from then rendering a circuit
--     as "3 x 0" via formatPlan; a null makes that a type error instead.
--   - (athlete_exercise_id, set_number) becomes UNIQUE. The app relies on that
--     pair as its index-alignment invariant (performed[i] answers plan[i]), and
--     nothing enforced it: `updateExercise`'s retarget loop walks the sets in
--     `order('set_number')` and writes plan[i] into each row, so a tie would let
--     Postgres hand back the tied rows in an arbitrary order and silently
--     retarget a set the athlete had already logged weight against. Verified
--     clean (0 duplicate pairs, 0 gaps) before adding the index, so this is
--     applied on live data without a repair step. Same constraint on
--     program_sets, which is the one path that could otherwise *create* a
--     duplicate (assign_program copies set_number straight off a template).
--
-- `athlete_exercises.complete` is dropped in a FOLLOWING migration, not here:
-- the app keeps writing it until the code that reads `done` is deployed, and
-- dropping it underneath a stale browser tab would 400 its completion toggle.
-- =============================================================================

alter table athlete_sets
  add column done boolean not null default false;

alter table athlete_sets
  alter column target_reps drop not null;

-- A conditioning exercise becomes exactly one unit, carrying over the flag the
-- athlete already set. A `note` deliberately gets NO unit: it is scheduled text
-- with nothing to perform, and is excluded from completion math (see
-- countsTowardCompletion in src/lib/complete.ts). A `weight` exercise already
-- has one row per set, so it is left alone.
insert into athlete_sets (athlete_exercise_id, set_number, target_reps, done)
select ae.id, 1, null, ae.complete
from athlete_exercises ae
join exercises e on e.id = ae.exercise_id
where e.category in ('warmup', 'circuit', 'plyo');

create unique index athlete_sets_exercise_set_number_key
  on athlete_sets (athlete_exercise_id, set_number);

create unique index program_sets_exercise_set_number_key
  on program_sets (program_exercise_id, set_number);

-- assign_program re-declared so a scheduled conditioning exercise arrives with
-- its unit already in place, exactly as addExercise now does. Without this an
-- assigned circuit would have no unit row to tap, and its completion would
-- silently never register. Body otherwise identical to the definition in
-- 20260831000000_program_templates.sql.
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

        -- Only 'weight' prescribes a plan, so only it copies set rows off the
        -- template. Every other non-note category gets its single unit here —
        -- matching addExercise's conditional, so a scheduled circuit has
        -- something to tap from the moment it lands.
        if v_pe.category = 'weight' then
          insert into athlete_sets (athlete_exercise_id, set_number, target_reps)
          select v_athlete_exercise_id, ps.set_number, ps.target_reps
          from program_sets ps
          where ps.program_exercise_id = v_pe.id
          order by ps.set_number;
        elsif v_pe.category in ('warmup', 'circuit', 'plyo') then
          insert into athlete_sets (athlete_exercise_id, set_number, target_reps, done)
          values (v_athlete_exercise_id, 1, null, false);
        end if;
      end loop;
    end loop;

    v_week_rank := v_week_rank + 1;
  end loop;

  return v_assignment_id;
end;
$$;
