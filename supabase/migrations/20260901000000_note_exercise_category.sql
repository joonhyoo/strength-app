-- =============================================================================
-- Adds a 'note' exercise category: a coach-authored block of text an athlete
-- reads as part of a day's plan, with nothing to perform, log, or complete.
--
-- Rides entirely on existing columns — the note body lives in the `note` column
-- that athlete_exercises / program_exercises already have, and every note row
-- points at ONE shared 'Note' row in the exercises catalog (created on first
-- use by getOrCreateExercise, kept out of the catalog UI by its category). So
-- the only schema change here is widening the catalog CHECK constraint.
--
-- Additive: no existing row changes, nothing to backfill. Every add / update /
-- assign / copy / paste path already carries `category` + `note` through and
-- only ever writes set rows for `category = 'weight'`.
-- =============================================================================

alter table exercises
  drop constraint exercises_category_check,
  add constraint exercises_category_check
    check (category in ('warmup', 'circuit', 'plyo', 'weight', 'note'));
