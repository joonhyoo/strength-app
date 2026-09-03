-- =============================================================================
-- Shift Schedule: key off the athlete + a date, not a program_assignment_id.
--
-- shift_program_schedule only ever moved rows carrying the assignment it was
-- given, so an athlete who was never run through Assign Program (a coach who
-- hand-writes every day via Add Exercise instead) had no assignment for the
-- old signature to key off — the feature had nothing to move and the UI
-- refused to even show the form. Re-scoping by athlete_id (mirroring
-- clearWeek's existing athlete+date-range scoping, one file over) moves
-- everything actually scheduled from p_from_date onward regardless of how it
-- got there, assignment-linked or hand-written alike. Same signature shape
-- (uuid, date, int), so this replaces the function in place.
--
-- The old version derived its coach-ownership check from the assignment row
-- it looked up; with no assignment to lean on, this checks coach_id directly
-- on profiles, matching assign_program's own check one migration up.
--
-- `create or replace` can't rename an existing parameter (Postgres rejects
-- that outright, same signature or not) — drop first, then create fresh.
-- =============================================================================

drop function if exists shift_program_schedule(uuid, date, int);

create function shift_program_schedule(p_athlete_id uuid, p_from_date date, p_shift_weeks int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
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

  if not exists (select 1 from profiles where id = p_athlete_id and coach_id = auth.uid()) then
    raise exception 'not_your_athlete';
  end if;

  update athlete_workouts
  set scheduled_date = scheduled_date + 36500
  where athlete_id = p_athlete_id and scheduled_date >= p_from_date;

  get diagnostics v_moved_count = row_count;

  select array_agg(scheduled_date - 36500 + v_shift_days)
  into v_dest_dates
  from athlete_workouts
  where athlete_id = p_athlete_id and scheduled_date >= p_from_date + 36500;

  delete from athlete_workouts
  where athlete_id = p_athlete_id and scheduled_date = any (v_dest_dates);

  update athlete_workouts
  set scheduled_date = scheduled_date - 36500 + v_shift_days
  where athlete_id = p_athlete_id and scheduled_date >= p_from_date + 36500;

  return v_moved_count;
end;
$$;

revoke all on function shift_program_schedule(uuid, date, int) from public;
grant execute on function shift_program_schedule(uuid, date, int) to authenticated;
