## Current Phase Cleanup

- [ ] `supabase db reset` was run this session to apply the above migration — the real test account from the previous live-user-report session (`1moomoo3@gmail.com`, "jimmy jones") no longer exists locally. If that user is still testing, they'll need to be re-invited and go through signup again.
- [ ] Found and worked around a `prettier-plugin-tailwindcss` bug while doing the color refactor: a long CSS comment in `layout.css` got shredded (one word per line) on `--write`, and — separately — an apostrophe inside a CSS comment crashed the parser outright (`CssSyntaxError: Unterminated string`). Worked around by keeping CSS comments in this file short (under ~100 chars) and apostrophe-free; not filed upstream. Worth knowing if `layout.css` grows more inline documentation later — verify with `prettier --check` (not just `--write`, then trust it) after any future comment addition there.
- [ ] Considered a coach-manageable "add category" feature (beyond warmup/circuit/plyo/weight) and decided against it for now — declined by the user, hardcoding new categories manually when needed instead. **To hardcode a new exercise category**, touch all of these (there's no single source of truth today):
  - `supabase/migrations/*.sql`: new migration to widen the CHECK constraint — `alter table exercises drop constraint exercises_category_check, add constraint exercises_category_check check (category in (...));` (original constraint: `supabase/migrations/20260812000000_initial_schema.sql:9`)
  - `src/lib/types.ts`: add the new value to the `ExerciseCategory` union
  - `src/lib/components/CategoryIcon.svelte`: add an entry to `iconMap` (icon + color) — TypeScript will actually error here until you do, since it's a `Record<ExerciseCategory, ...>`
  - Three duplicated `categoryLabel`/`categoryOptions` definitions that all need the same new entry: `src/routes/(coach)/library/+page.svelte`, `src/routes/(coach)/training/[[id]]/AddExerciseModal.svelte`, `src/routes/(coach)/training/[[id]]/WorkoutTimeline.svelte`
  - If this keeps happening, worth eventually consolidating those three duplicated label/option maps into one shared `src/lib/data/` export (not done now — three copies was fine when there was no editing UI yet, but it's real duplication risk now that categories change more than once).

- [ ] Refactors and tidy up some formatting + check security spec on things as you go

## Deployment (Vercel)

Blockers for going public. Build and `svelte-check` are already clean (0 errors, 453 files), there are no Node-only APIs and no hardcoded localhost URLs in `src/` — so what's left is config and authorization.

**Self-registration is now closed at the app layer**: `send_code` only sets `shouldCreateUser: true` when the submitted email matches a pending coach invite (`coach_invites`), verified server-side via the service-role key — confirmed empirically that Supabase's OTP endpoint returns a real `422` for an uninvited email with `create_user: false`, not a silent no-op (see testing-notes.md, 2026-08-25). The Supabase dashboard "disable sign-ups" toggle below is still worth doing as defense in depth (a bug in this check, or a direct API call bypassing the app, would otherwise still reach hosted Supabase's own signup allowance).

RLS itself was scoped in `20260823000000_scoped_rls.sql` (no longer blanket `USING (true)`), so what's left is making sure it's actually applied. `src/routes/api/workout/+server.ts` takes `athleteId` straight from the request body with no auth check of its own — the `(athlete)`/`(coach)` layout guards don't cover the `api/` group — so RLS is the only thing standing between a stranger and read/write/delete on every athlete's data.

### Code changes

### Supabase (hosted)

`supabase/config.toml` is local-CLI only — none of it reaches the hosted project, so these are all dashboard settings.

- [ ] `supabase link --project-ref <ref>` then `supabase db push` (applies the 7 migrations; does not run seed.sql)
- [ ] Verify seed.sql never ran against hosted: `select id, email from auth.users where email like '%@test.com';` — delete if present. It inserts `coach@test.com` / `anthony@test.com` / `jack@test.com` with the password literally set to `password`
- [ ] Never `supabase db reset` while linked to hosted — `[db.seed] enabled = true` would seed those accounts
- [ ] Dashboard → Authentication → disable "Allow new users to sign up" (belt and braces; the client flag alone isn't authoritative)
- [ ] Dashboard → Authentication → Email → confirm "Confirm email" is **enabled** (hosted default). An athlete's `profiles` row (and `coach_id` assignment) is only created once `email_confirmed_at` is actually set — see `handle_new_user`'s `on_auth_user_confirmed` trigger in `20260826000000_coach_email_invites.sql` — so this must stay on for that gate to mean anything. Local `supabase/config.toml` was flipped to `enable_confirmations = true` to match and make this testable locally (see testing-notes.md, 2026-08-25), but that file never reaches hosted — verify the hosted toggle directly, don't assume it matches.
- [ ] Create the coach account by hand (athletes now self-serve via the coach's email-invite flow, not manual creation). The `handle_new_user` trigger auto-creates a profile with `role='athlete'` once confirmed, so afterwards promote to `role='coach'`. Expect the coach to land on `/setup-profile` (username + name) on first real login — that's intended, not a bug, same gate every account goes through once (`needsUsername()`, `20260827000000_profile_setup.sql`)
- [ ] Site URL + redirect URLs → `https://strength.hyuji.dev` (currently `http://192.168.0.251:5173`). The magic-link flow verifies typed codes in-app, so no email redirect URLs are strictly required — but set them anyway in case links are enabled later
- [ ] Custom SMTP → Resend. The hosted default sender only delivers to your own team's addresses and caps around 2–4/hr, so athletes would simply never receive codes
- [ ] Magic Link email template → the `{{ .Token }}` version from `supabase/templates/magic_link.html`. The hosted default sends a _link_, but the app calls `verifyOtp` against a typed 6-digit code — miss this and login silently breaks
- [ ] Raise the email rate limit above the local `email_sent = 2` per hour

### Vercel

- [ ] Domain: DNS `CNAME strength.hyuji.dev → cname.vercel-dns.com` (record name `strength` under the `hyuji.dev` zone), then Vercel → Project Settings → Domains → add `strength.hyuji.dev` (SSL is issued automatically — note `.dev` requires HTTPS/HSTS, which Vercel's automatic certs cover). No code changes needed — `hooks.server.ts` derives the cookie `secure` flag from the request protocol, cookies are host-scoped so they can't clash with other hyuji.dev subdomains, and localhost dev is unaffected
- [ ] Import the repo (SvelteKit auto-detected, no `vercel.json` needed) and set the production branch — merge `design/mockui` → `main` or point Vercel at it
- [ ] Env vars `PUBLIC_SUPABASE_URL` + `PUBLIC_SUPABASE_PUBLISHABLE_KEY` on Production, Preview and Development. They're read via `$env/static/public`, so they're **inlined at build time** — missing means the build fails outright, and changing one needs a redeploy, not a restart
- [ ] Verify RLS actually bites: logged in as athlete A, POST `/api/workout` with `action: 'getDay'` and athlete B's uuid. Must return null, not B's workout
- [ ] Expect one hard refresh on first prod visit — the service worker precaches per `version` and a cached bundle can still hold the old inlined Supabase URL

## Post-Deploy Cleanup (not blocking)

Real but not urgent at under 10 users.

- [ ] Generate `src/database.types.ts` — `app.d.ts` imports a file that doesn't exist. `skipLibCheck` hides it, so it passes both build and svelte-check, but every Supabase query is effectively untyped
- [ ] `robots.txt` allows all crawling (harmless — every route redirects when unauthenticated)
- [ ] `manifest.json`: still no maskable icon (would need new artwork with a safe-zone design — `id`/`scope`/proper `name` casing already fixed, 2026-08-25)
- [ ] Fix the `config.toml` template path — `./supabase/templates/…` resolves to `supabase/supabase/templates/…`
- [ ] Delete `supabase/snippets/` — two "Untitled query" files, one a stale v1 schema with a hardcoded seeded UUID
- [ ] `export const prerender = true` on `src/routes/auth/error/+page.svelte` — the only static route; everything else is SSR-on-demand because the root layout calls `getClaims()` every request
- [ ] Trim the build: `playwright` and the `supabase` CLI are devDependencies and install on every Vercel build. Drop the dev-only Tailscale `allowedHosts` entry in `vite.config.ts`
- [ ] `.npmrc` sets `engine-strict=true` with no `engines` field — inert now, but would hard-fail the build if an `engines` range is added that Vercel doesn't match

## Future Iterations

- Create a design palette (impeccable)
- Add url link for video demo (figure that out)
- Coach can view all created exercises
- Coach can edit created exercises
- Move Privacy Policy / Terms of Service to a separate domain instead of in-app routes. Currently `src/routes/privacy` and `src/routes/terms`, linked from the consent checkbox shown at the "agree" step of sign-up (`src/lib/components/AuthForm.svelte`) and the athlete profile page (`src/routes/(athlete)/profile/+page.svelte`). When moved, update both links to point externally and decide whether to keep or remove the in-app routes.

## Scaled approach for multiple groups of athletes (highly unlikely for project scope)

- Coaches sign up
- Coaches create a group (i.e. XYZ Volleyball Club)
- Coaches send invite links to athletes
- Athletes join groups via invite links/codes
- Coaches can assign athletes from the group (Coach - Athlete)
