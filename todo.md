## Current Phase Cleanup

- [ ] Found and worked around a `prettier-plugin-tailwindcss` bug while doing the color refactor: a long CSS comment in `layout.css` got shredded (one word per line) on `--write`, and — separately — an apostrophe inside a CSS comment crashed the parser outright (`CssSyntaxError: Unterminated string`). Worked around by keeping CSS comments in this file short (under ~100 chars) and apostrophe-free; not filed upstream. Worth knowing if `layout.css` grows more inline documentation later — verify with `prettier --check` (not just `--write`, then trust it) after any future comment addition there.
- [ ] Considered a coach-manageable "add category" feature (beyond warmup/circuit/plyo/weight) and decided against it for now — declined by the user, hardcoding new categories manually when needed instead. **To hardcode a new exercise category**, touch all of these (there's no single source of truth today):
    - `supabase/migrations/*.sql`: new migration to widen the CHECK constraint — `alter table exercises drop constraint exercises_category_check, add constraint exercises_category_check check (category in (...));` (original constraint: `supabase/migrations/20260812000000_initial_schema.sql:9`)
    - `src/lib/types.ts`: add the new value to the `ExerciseCategory` union
    - `src/lib/components/CategoryIcon.svelte`: add an entry to `iconMap` (icon + color) — TypeScript will actually error here until you do, since it's a `Record<ExerciseCategory, ...>`
    - Three duplicated `categoryLabel`/`categoryOptions` definitions that all need the same new entry: `src/routes/(coach)/library/+page.svelte`, `src/routes/(coach)/training/[[id]]/AddExerciseModal.svelte`, `src/routes/(coach)/training/[[id]]/WorkoutTimeline.svelte`
    - If this keeps happening, worth eventually consolidating those three duplicated label/option maps into one shared `src/lib/data/` export (not done now — three copies was fine when there was no editing UI yet, but it's real duplication risk now that categories change more than once).

## Deployment (Vercel) — shipped

Site is live, DNS/Vercel/Supabase dashboard config all done. One standing rule, not a task — keep in mind going forward:

- [ ] Never `supabase db reset` while linked to hosted — `[db.seed] enabled = true` would reseed the `@test.com` accounts onto the production project.

## Post-Deploy Cleanup (not blocking)

Real but not urgent at under 10 users.

- [ ] Generate `src/database.types.ts` — `app.d.ts` imports a file that doesn't exist. `skipLibCheck` hides it, so it passes both build and svelte-check, but every Supabase query is effectively untyped
- [ ] `robots.txt` allows all crawling (harmless — every route redirects when unauthenticated)
- [ ] `manifest.json`: still no maskable icon (would need new artwork with a safe-zone design — `id`/`scope`/proper `name` casing already fixed, 2026-08-25)
- [ ] Delete `supabase/snippets/` — two "Untitled query" files, one a stale v1 schema with a hardcoded seeded UUID
- [ ] `export const prerender = true` on `src/routes/auth/error/+page.svelte` — the only static route; everything else is SSR-on-demand because the root layout calls `getClaims()` every request
- [ ] Trim the build: `playwright` and the `supabase` CLI are devDependencies and install on every Vercel build. Drop the dev-only Tailscale `allowedHosts` entry in `vite.config.ts`
- [ ] `.npmrc` sets `engine-strict=true` with no `engines` field — inert now, but would hard-fail the build if an `engines` range is added that Vercel doesn't match

## Future Iterations

- Create a design palette (impeccable)
- Add url link for video demo (figure that out)
- Visual for what cycle/lift they are doing (labels or smth figure it out)

## Scaled approach for multiple groups of athletes (highly unlikely for project scope)

- Coaches sign up
- Coaches create a group (i.e. XYZ Volleyball Club)
- Coaches send invite links to athletes
- Athletes join groups via invite links/codes
- Coaches can assign athletes from the group (Coach - Athlete)

## URGENT AND IMPORTANT

- Generate a report of how the code works and understand it
- Feature by feature implement test cases
- Find all fallbacks and remove the ones that arent helpful, I need the app to fail loud

## URGENT

- Weird glitch back after optimistic load shift on exercises.
- Clear Day button on workout timeline
- Inconsistent spacing between workout icons
- Exercises with descriptions (Dynamic Flexibility, General Strength Circuits) the kind that doesn't change, should be kept same (maybe i can placeholder notes so if they want to be changed the option is there atleast)
- Need some marker on which specific exercises have been completed, i dont want the icons to change so maybe i'll add a small green circle next to completed exercises (since the dot status is a bit vague on its own on partial completions)
- Workout icon line is a bit dark and thin, slighlty thicker slightly whiter
- Restyle videos (should load fresh every time, artifacts are confusing)

## FOR LATER

- No progress view for you or the athlete. There's nowhere to see "is this lift trending up" — you'd have to flip through daily history by hand. The athlete-facing Records page is also a full placeholder, so they can't self-serve "what's my PR" either, which becomes your problem via text.
- profiles.notes — a column already in your schema for per-athlete notes (injuries, goals) — completely unused today. Small lift, real value.
- coach athletes page stack invite and your athletes columns. onclick atheletes show a view of user information (name, previous programs, current program, all time pr numbers on select lifts, current cycle pr numbers on the same lifts)
- athlete can see automatically recommended weight based on last 3 performances and ideal 1RM percentages, so they know how much weight to target for working sets
- show different cycles as different colours on coach/training calendar so its easier to tell when what cycle starts and ends, the text is nice but a clear visual cue is easier.
- move the program, cycle and week label to just underneath the date in the workout builder, itsa bit easier to see
- fun new name instead of strength-app (stride)
- match styling and make it consistent
- since i want substitutions to be possible, I need to consider how this ui will appear on coach side and how the athlete shows up since i want the option to undo an opt-out or substitution
- go through pages one at a time when you can and tidy up ui/ux
