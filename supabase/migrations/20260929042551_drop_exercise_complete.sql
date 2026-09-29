-- =============================================================================
-- Drops athlete_exercises.complete, now that completion lives on the units.
--
-- SEPARATE FROM 20260929041935_set_entry_done.sql ON PURPOSE. That migration
-- backfilled the flag into athlete_sets.done but deliberately left the old
-- column in place, because the app was still reading and writing it until the
-- per-unit code shipped. Dropping it in the same migration would 400 the
-- completion toggle of any browser tab still running the pre-migration bundle --
-- and this repo's set/reps inputs are one-way (value=, not bind:), so an
-- athlete mid-workout has no way to recover from a failed write.
--
-- Apply this one only after the per-unit code is deployed. Verified at
-- migration time: 0 rows of any category carried a `complete` value that
-- `done` doesn't already reflect (6 tapped conditioning exercises, all
-- carried over by the backfill; 0 weight rows ever had it set, since a weight
-- set's completion is derived from its weight and the toggle was hidden for
-- that category).
--
-- ORDER MATTERS. assign_program still names the dropped column, and Postgres
-- does NOT re-validate a plpgsql body against the catalog -- so `create or
-- replace` succeeds and the function only explodes later, at the first coach
-- who assigns a program:
--
--   rpc.failed  assignProgram  column "complete" of relation
--   "athlete_exercises" does not exist
--
-- Hence the function is re-declared FIRST, without the column, and the drop
-- happens after. Keep those two statements in this order.
-- =============================================================================

-- Re-declared so it stops writing the column this migration drops. Body is
-- otherwise identical to the definition in 20260929041935_set_entry_done.sql.
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
        insert into athlete_exercises (athlete_workout_id, exercise_id, position, note)
        values (v_workout_id, v_pe.exercise_id, v_pe.position, v_pe.note)
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


alter table athlete_exercises
  drop column complete;
