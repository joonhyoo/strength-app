# Styling consistency audit — 2026-09-03

One-time pass comparing the live app (`src/`) against the canonical design system
reference (`design_system/`, not edited). Scope per the brief: `src/lib/components/**/*.svelte`,
`src/routes/**/*.svelte`, and `src/routes/layout.css`. Every file in that scope was read in full
(38 Svelte files, ~5,000 lines, plus `layout.css`). Two rounds: an initial mechanical pass, then a
second round implementing the design-level items the first round had flagged for a human call
(the user reviewed each and gave direction — see "Follow-up round" below). Styling/markup only,
no logic changes, throughout both rounds.

## What "the design system" turned out to mean here

`design_system/` is a Figma Make React export with its own 3-font type scale (Barlow Condensed /
Outfit / JetBrains Mono), `--radius-sm` component sizing, and a documented badge/card/nav catalog.
At the start of this audit the real app implemented **none** of that type scale — no Google Fonts
import existed anywhere in `src/` or `app.html`. The initial pass therefore compared the app mostly
**against itself** (same kind of element styled the same way everywhere it appears) and used the
reference for color tokens, opacity/weight conventions, and radius/spacing scale, which the app
already implemented (via `layout.css`'s `@theme` block and the `[data-theme='brand']` DaisyUI
mapping). The follow-up round then closed that type-scale gap for real — see below.

The one deliberate exception called out in the brief — `--color-amber`/`--color-teal`/`--color-violet`
in `layout.css` and `src/lib/data/cycleColors.ts` as an extended data-viz palette — was left alone,
as instructed, in both rounds.

## Round 1 — mechanical fixes

### 1. Dead DaisyUI v4 classnames (no visual effect — verified against the installed package)

The project is on `daisyui@5.5.20`. Several classnames used throughout `src/` are DaisyUI v4
component-style modifiers that v5 removed outright (checked directly against
`node_modules/daisyui/components/*.css` — none of these selectors exist in the built CSS, and
nothing in the project defines them locally). Since the "bordered" look became `.input`/`.select`/
`.textarea`'s default in v5, every one of these was already rendering with no effect — pure dead
weight left over from a v4→v5 upgrade that wasn't fully cleaned up. Removing them changes nothing
about how any page looks today, so this was safe to do without a browser:

- **`input-bordered`** — removed from 26 `<input>` elements across `AuthForm.svelte`,
  `OtpInput.svelte`, `athletes/+page.svelte` (×2), `setup-profile/+page.svelte` (×2),
  `library/+page.svelte` (×5), `ProgramFormModal.svelte`, `CycleFormModal.svelte` (×2),
  `SessionFormModal.svelte`, `ShiftModal.svelte`, `(coach)/training/[[id]]/AddExerciseModal.svelte`
  (×5), `(coach)/library/ProgramExerciseModal.svelte` (×5).
- **`select-bordered`** — removed from 8 `<select>` elements across `AssignModal.svelte`,
  `training/[[id]]/+page.svelte`, `AddExerciseModal.svelte` (×2), `ProgramExerciseModal.svelte` (×2),
  `library/+page.svelte` (×2).
- **`textarea-bordered`** — removed from 3 `<textarea>` elements: `ProgramFormModal.svelte`,
  `AddExerciseModal.svelte`, `ProgramExerciseModal.svelte`.
- **`btn-dashed`** — removed from 6 buttons ("Add cycle"/"Add exercise"/"Add note" affordances in
  `ProgramList.svelte`, `ProgramEditor.svelte`, `CycleBand.svelte` ×2, `WorkoutTimeline.svelte` ×2).
  Note: v5's real dashed-button modifier is spelled `btn-dash`, not `btn-dashed` — but every one of
  these buttons already gets its dashed look from an accompanying `border-dashed border-base-300`
  Tailwind utility pair sitting right next to the dead class, so only the no-op token was removed;
  the working `border-dashed` styling was left untouched (confirmed visually in round 2 — still
  renders dashed).
- **`label-text`** — removed from `AuthForm.svelte` (checkbox agreement caption) and
  `setup-profile/+page.svelte` (×2 field labels). Same story: not a real v5 class, zero effect.
- **`empty-state`** — removed from `ProgramEditor.svelte`'s "No cycles yet" message. Not a DaisyUI
  class and not defined anywhere in the project's CSS; confirmed it isn't used as a test selector
  either.

### 2. Inconsistent inline field-error text size

`AuthForm.svelte`'s email-validation error (`form?.errors?.email`) was `text-sm text-error`, while
every other inline field/action error in the app (`athletes/+page.svelte` ×2, `library/+page.svelte`
×3, `CycleBand.svelte` ×3 — 8 instances total, all doing the same job of a small error line right
under a field or action) uses `text-xs text-error`. Changed the one outlier to `text-xs` to match.
(The larger banner-style error boxes — `rounded-lg bg-error/10 p-3 text-sm text-error` in
`AuthForm.svelte` and `setup-profile/+page.svelte` — are a different, consistent pattern and were
left as `text-sm`, that's correct for a banner.)

### 3. One-off `rounded-md` on an otherwise-`rounded-lg` app

`WorkoutModal.svelte`'s note-preview box was the only one of 25 similarly-styled rounded
content/info boxes in the whole app using `rounded-md`; the other 24 use `rounded-lg`. Changed to
`rounded-lg`.

### Reviewed in round 1, no change made — genuinely fine

- **Cards**: all 17 `card` usages consistently pair `bg-base-100 shadow-sm` — no drift.
- **Modal titles**: all 7 modal dialogs used (and still use) `h3 class="... text-lg font-bold ..."`
  for their heading — consistent.
- **Error/warning/success info boxes**: `bg-error/10`, `bg-success/10` (both /10, matching each
  other) and `bg-warning/15` (used 3×, always /15) — different opacity per hue is a defensible,
  internally-consistent choice, not drift.
- **`CategoryIcon` colors**: all sourced from real palette tokens (`text-danger`, `text-lime`,
  `text-sky`, `text-primary`, `text-cream` in `src/lib/data/categories.ts`) — no hardcoded/generic
  Tailwind colors bypassing the token system.
- **`card-title` size split** (`text-base` override in 7 dense-dashboard cards vs. the DaisyUI
  default 1.125rem/`text-lg` in 4 solo hero cards): checked DaisyUI's own `--cardtitle-fs` default
  directly — the split correlates exactly with "dense multi-card grid" vs. "single centered card"
  layouts, reads as intentional information hierarchy, left alone.

## Round 2 — the 7 flagged items, resolved

Round 1 flagged seven items as needing a human call instead of guessing. Each was reviewed with the
user one at a time; here's what was decided and done.

1. **Type scale — adopt app-wide.** Wired up all three fonts for real: added the Google Fonts
   `@import`s to `layout.css` (matching the reference's weights) and added `--font-display`
   (Barlow Condensed), `--font-body` (Outfit), `--font-mono` (JetBrains Mono) to the existing
   `@theme` block, which makes Tailwind generate real `font-display`/`font-body`/`font-mono`
   utilities from them — `font-mono` already existed as a class name in `CycleBand.svelte`'s week
   chips, so those now correctly render JetBrains Mono instead of falling back to the browser
   default monospace stack. Set `body { font-family: var(--font-body); }` as the app-wide default.
   For the display font's reach, the user chose **"page headings + card/modal titles"**: applied
   `font-display uppercase` to every page `<h1>` (Dashboard/Library/Athletes/Training, the welcome
   splash, the auth `AuthHeader` title), every `card-title`, every modal `<h3>` dialog title,
   `WorkoutModal`'s exercise-name heading, the athlete Train page's status heading, and
   `ProgramEditor`'s program-name `<h2>`. Deliberately **not** extended to non-heading inline
   "identity" text in dense contexts — `CycleBand.svelte`'s cycle-name span and session-name spans
   inside its small grid cells, and `ProgramList.svelte`'s program-name buttons — since forcing a
   bold condensed-uppercase treatment into cramped, small-text UI is exactly the kind of visual call
   that needs a browser to verify, and this round's screenshots (see Verification) only exist for
   the elements actually changed. Also **not** extended to `join/+page.svelte`'s card-title ("Not
   linked to a coach yet") — that's a full sentence, not a short identifier, and every reference
   usage of the display treatment is on short text; forcing it there would very likely look wrong.
2. **Unused brand-gradient token.** User chose to align its angle to the reference now, since it's
   free (nothing renders it, so no visual risk either way): `90deg` → `135deg` in `layout.css`.
3. **Three eyebrow-label variants — unify into one.** Picked
   `text-xs font-semibold tracking-wide text-base-content/60 uppercase` as the single target (the
   plurality across the three original variants, and the most legible of the three opacities) and
   applied it everywhere the small-caps "eyebrow" pattern appears: `AuthHeader.svelte` and
   `AuthForm.svelte`'s auth-flow captions (previously `tracking-widest`/`40`), and
   `CycleBand.svelte`'s three day-of-week grid-cell labels (previously a custom `text-[0.64rem]` at
   `tracking-wide`/`50`, un-bolded). `athletes/+page.svelte` and `library/+page.svelte` already used
   this exact class list, so those needed no change.
4. **Icon-size sprawl — replace with Tailwind's scale, applied app-wide.** The user asked to go
   further than the original MonthGrid-only finding: convert every icon's `height="X.Yem"` (some
   also had `width=`) prop to a Tailwind `size-*` class instead, app-wide. Checked directly (a
   throwaway probe component + `vite build`, since Tailwind v4's dynamic spacing scale turned out to
   only generate fractional steps at the classic `.5`/`1.5`/`2.5`/`3.5` values, not arbitrary
   decimals like `4.5`/`5.5`/`6.5` — confirmed by inspecting the actual built CSS) which whole-`rem`
   steps were available, then mapped each of the app's 9 distinct em values (assuming the standard
   16px root) to the nearest one: `1em`/`1.1em` → `size-4`, `1.2em`/`1.3em` → `size-5`,
   `1.4em`/`1.5em`/`1.6em` → `size-6`, `3.5em` → `size-14`. That consolidated the original
   MonthGrid-vs-WorkoutTimeline 1.2/1.3em mismatch into a single shared value, along with several
   other near-duplicates, across ~49 icon usages in 15 files. Verified the icon components
   (`@iconify-svelte/mingcute` → `@iconify/css-svelte`) only apply explicit `width`/`height` SVG
   attributes when those props are passed, and forward `class` straight to the `<svg>` — so dropping
   the prop and adding the Tailwind class sizes correctly via CSS with no attribute/class conflict.
5. **Label-span convention split — retracted, no fix needed.** On closer inspection this wasn't a
   real inconsistency: `setup-profile/+page.svelte`'s spans already kept the real `.label` class
   (round 1 only stripped the dead `label-text` sitting next to it). `AuthForm.svelte`'s checkbox
   caption doesn't have `.label` on the `<span>` itself, but its parent `<label>` does, and `.label`'s
   muted color is an inherited CSS property — so the caption already inherits the same muted look via
   its ancestor. Different, equally-idiomatic use of the same class (wrapping a checkbox vs. a
   caption above an input), not drift. Left as-is.
6. **`WorkoutModal`'s modal shape — confirmed intentional, left as-is.** Found stronger evidence on
   a second look: `(athlete)/+layout.svelte` (the athlete app shell itself) uses the exact same
   `md:border-x md:border-base-300`-with-no-rounding treatment, for the same reason (a phone-width
   column that's bordered, not rounded, once the viewport is wider than the column). `WorkoutModal`
   matches its own parent layout's established convention rather than drifting from it. User agreed;
   no change.
7. **Missing page-level `<h1>` on Athletes and Training — added.** Added
   `<h1 class="mb-4 font-display text-xl font-bold uppercase">Athletes</h1>` (restructuring
   `athletes/+page.svelte` to wrap its content grid the same way Dashboard/Library do: an outer
   `<div class="my-4">` with the heading, then the grid with its own `my-4` removed) and
   `<h1 class="mt-4 mb-4 font-display text-xl font-bold uppercase">Training</h1>` in
   `training/[[id]]/+page.svelte` (as a standalone heading before the existing clipboard-banner
   conditional, since that page has no single wrapping element to borrow spacing from — given its
   own `mt-4`/`mb-4` instead). Both match Dashboard/Library's heading treatment exactly (now also
   carrying the font-display/uppercase treatment from item 1).

## Visual verification (round 2)

Round 1 had no way to render the app. For round 2 — a real font swap, uppercase headings, and an
app-wide icon resize — that was too much visual surface to sign off on blind, so the dev server was
actually launched and driven headlessly (Playwright, since `chromium-cli` wasn't available in this
sandbox; the project's own `playwright` devDependency and cached Chromium build were used directly,
pointing `executablePath` at the installed browser directly since its cached revision
didn't match what `playwright-core@1.60.0` expected). Screenshotted, logged in as each test account
(dev-only quick-login): the sign-in screen, coach Dashboard, Library (Programs tab with a real
program open — cycle/week chips, `font-mono` week numbers — and the Exercises tab), Athletes,
Training, and the athlete Train tab. All rendered cleanly: both new fonts loading and visibly
distinct from each other, uppercase condensed headings reading crisply at every size from page `<h1>`
down to modal titles, the unified eyebrow label legible in both the auth flow and dashboard sections,
icons proportionate to their buttons at every new size step, and the `btn-dashed` cleanup's dashed
borders still rendering correctly. No console errors on any screen. Not visually spot-checked:
`WorkoutModal` itself and the in-workout exercise view (the seeded test athletes had no exercises
scheduled on the day tested) — these use the exact same font/icon-sizing mechanism already confirmed
working elsewhere, just not seen directly.

## Verification (both rounds)

- `npm run check`: clean throughout (0 errors, 0 warnings on the 516 project files, checked after
  every round). It always prints a `design_system/vite.config.ts` module-resolution error to stderr
  (`@vitejs/plugin-react` isn't installed for that standalone Figma-export app) — pre-existing,
  unrelated to `src/`, and unaffected by anything in this audit.
- `npm run lint` (`prettier --check . && eslint .`): the baseline, taken _before_ any edit, already
  failed at the prettier step on `.opencode/package.json` (pre-existing, untouched here) and —
  checked separately by running `eslint .` directly since the prettier failure short-circuits the
  npm script — already had 18 `svelte/no-unused-svelte-ignore` errors in `AuthForm.svelte`'s script
  block (lines 35/46/86/90), also pre-existing and out of scope for a styling/markup-only pass.
  After every round of edits, `eslint .` reports the exact same 18 errors at the same locations
  (nothing new), and `prettier --check .` reports only the same pre-existing `.opencode/package.json`
  warning — confirmed each time by running `prettier --write` on just the files that round touched
  (reflowing line-wrapping after class strings got shorter or longer) and re-checking.
