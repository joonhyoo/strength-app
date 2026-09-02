-- =============================================================================
-- Widen the cycle-band palette from 3 colors to 8.
--
-- Same shape as the note-category migration: additive, no rows change,
-- nothing to backfill. The default stays 'sky' and every existing cycle
-- already holds one of the three original keys, so the new CHECK is a strict
-- superset of the old one.
--
-- The keys are stable strings the app maps to theme tokens
-- (src/lib/data/cycleColors.ts -> src/routes/layout.css) — kept out of a
-- Postgres enum on purpose, so adding the next colour is a one-line CHECK
-- swap like this one rather than an enum-alter.
-- =============================================================================

alter table cycles
  drop constraint cycles_color_key_check,
  add constraint cycles_color_key_check
    check (color_key in ('sky', 'cream', 'primary', 'crimson', 'amber', 'lime', 'teal', 'violet'));
