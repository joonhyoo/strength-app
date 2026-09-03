# Styling consistency audit — 2026-09-03

One-time pass comparing the live app (`src/`) against the canonical design system
reference (`design_system/`, not edited). Scope per the brief: `src/lib/components/**/*.svelte`,
`src/routes/**/*.svelte`, and `src/routes/layout.css`. Every file in that scope was read in full
(38 Svelte files, ~5,000 lines, plus `layout.css`). No logic or behavior changes anywhere —
class-string edits only.

## What "the design system" turned out to mean here

`design_system/` is a Figma Make React export with its own 3-font type scale (Barlow Condensed /
Outfit / JetBrains Mono), `--radius-sm` component sizing, and a documented badge/card/nav catalog.
The real app does **not** implement that type scale at all — no Google Fonts import exists
anywhere in `src/` or `app.html`, so the whole app runs on Tailwind/DaisyUI's default font stack.
Given that gap, this audit mostly compared the app **against itself** (same kind of element styled
the same way everywhere it appears) rather than pixel-matching the reference, and used the
reference for color tokens, opacity/weight conventions, and radius/spacing scale, which the app
_does_ implement (via `layout.css`'s `@theme` block and the `[data-theme='brand']` DaisyUI mapping).
See "Flagged, not fixed" #1 for the type-scale gap itself.

The one deliberate exception called out in the brief — `--color-amber`/`--color-teal`/`--color-violet`
in `layout.css` and `src/lib/data/cycleColors.ts` as an extended data-viz palette — was left alone,
as instructed.

## Fixed

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
  Tailwind utility pair sitting right next to the dead class, so I only removed the no-op token and
  left the working `border-dashed` styling untouched. Switching to the real `btn-dash` component
  class instead would change the rendered border/padding treatment in a way I can't verify without
  a browser — that's a separate, judgment-call fix, not a mechanical one.
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

### 3. Mismatched letter-spacing on twin "eyebrow" labels in the same screen

`AuthHeader.svelte`'s "Strength App" caption (always visible, above the sign-in title) and
`AuthForm.svelte`'s dev-only "Test Accounts" caption (rendered directly below it in the same flow)
share every class except one: `text-xs font-semibold text-base-content/40 uppercase`, but
`tracking-widest` vs. `tracking-wider`. Reads as drift rather than an intentional two-tier system —
unlike the other tracking/opacity variants found elsewhere (see "Flagged" #3), these two sit
back-to-back on the identical screen. Changed `AuthForm.svelte`'s to `tracking-widest` to match.
Low-risk either way since this block only renders with `dev` true.

### 4. One-off `rounded-md` on an otherwise-`rounded-lg` app

`WorkoutModal.svelte`'s note-preview box was the only one of 25 similarly-styled rounded
content/info boxes in the whole app using `rounded-md`; the other 24 (including every other
"muted background note/info box" like `CycleBand.svelte`'s clipboard banner and
`AssignModal.svelte`/`ShiftModal.svelte`'s conflict boxes) use `rounded-lg`. No pattern anywhere
else in the app scales radius down for a nested box. Changed to `rounded-lg`.

## Reviewed, no change made — genuinely fine

- **Cards**: all 17 `card` usages consistently pair `bg-base-100 shadow-sm` — no drift.
- **Modal titles**: all 7 modal dialogs use `h3 class="mb-4 text-lg font-bold"` for their heading —
  consistent.
- **Error/warning/success info boxes**: `bg-error/10`, `bg-success/10` (both /10, matching each
  other) and `bg-warning/15` (used 3×, always /15) — different opacity per hue is a defensible,
  internally-consistent choice, not drift.
- **`CategoryIcon` colors**: all sourced from real palette tokens (`text-danger`, `text-lime`,
  `text-sky`, `text-primary`, `text-cream` in `src/lib/data/categories.ts`) — no hardcoded/generic
  Tailwind colors bypassing the token system.
- **`card-title` size split** (`text-base` override in 7 dense-dashboard cards vs. the DaisyUI
  default 1.125rem/`text-lg` in 4 solo hero cards): checked DaisyUI's own `--cardtitle-fs` default
  directly — the split correlates exactly with "dense multi-card grid" vs. "single centered card"
  layouts, which reads as intentional information hierarchy, not a bug.

## Flagged, not fixed — needs a human call

1. **Type scale from `design_system` isn't implemented at all.** No Google Fonts import anywhere in
   `src/` or `app.html`; the app runs entirely on the default Tailwind/DaisyUI font stack. The only
   `font-mono`/`font-display` utility classes anywhere in `src/` are two in `CycleBand.svelte` (the
   week-number chip and its "Week N" label), which as a result render in the browser's default
   monospace stack, not JetBrains Mono — they're outliers by default since nothing else in the app
   uses a font-family utility at all. I didn't touch these: unlike the dead DaisyUI classes above,
   `font-mono` is a real, active utility that visibly changes rendering today (proportional → mono),
   so removing it is a visual change I can't verify without a browser, and adopting the reference's
   3-font system app-wide is a much bigger call than this pass's mandate. Left exactly as-is either
   way; flagging for a deliberate decision either direction.
2. **`--background-image-brand-gradient` in `layout.css` is unused.** It's declared (`90deg`,
   vs. the reference's `135deg` — otherwise identical stops) but no class or inline style anywhere
   in `src/` actually references it; the splash/auth-mark SVGs each inline their own gradient with
   explicit stops instead. Since nothing renders it, the angle mismatch against the reference has no
   live effect — noting it in case it's meant to be wired up somewhere, but there's nothing to fix
   mechanically (an unused declaration's "correct" value isn't mine to guess at).
3. **Three different "small uppercase eyebrow label" treatments now exist**, each internally
   consistent and each tied to a distinct context, but never reconciled with each other:
   - `tracking-widest`, `text-base-content/40` — auth flow (`AuthHeader.svelte` +
     `AuthForm.svelte`, after fix #3 above)
   - `tracking-wide`, `text-base-content/60` — dense dashboard section headers (`athletes/+page.svelte`,
     `library/+page.svelte`)
   - `tracking-wide`, `text-base-content/50`, `text-[0.64rem]` — day-of-week micro-labels inside
     grid cells (`CycleBand.svelte` ×3)
     Each pattern is self-consistent and plausibly matched to its context (hero/auth vs. dashboard
     section vs. dense grid cell), so I didn't collapse them into one — but a real type scale (see #1)
     would settle this properly instead of each context inventing its own eyebrow style.
4. **Micro-variance in icon size for the same button-size class.** `btn-ghost btn-sm` pairs with a
   1.2em icon in `MonthGrid.svelte`'s month-nav chevrons, but 1.3em in `WorkoutTimeline.svelte`'s and
   `athletes/+page.svelte`'s row-action icons. ~1.6px difference at default type size, the two are
   never seen side by side, and I have no way to confirm which "looks right" against each button's
   padding without rendering both. Noting it, not guessing at it.
5. **Field-label span convention still has a visible split after the dead-class cleanup.** Most
   field labels across the Library/Training modals use `<span class="label">Text</span>` (a real
   DaisyUI class: muted color, `inline-flex`, small gap). `AuthForm.svelte`'s checkbox caption and
   `setup-profile/+page.svelte`'s two field labels only ever had the dead `label-text` sitting next
   to plain `text-xs` (and, in `setup-profile`, `label` was already present alongside it) — so after
   removing the no-op class, those three spans still don't get the same muted/inline-flex treatment
   real `.label` usage gives everywhere else. Fixing this means either adding `.label` (a visible
   color/layout change) or confirming plain text is intentional there — a call I can't make blind.
6. **`WorkoutModal.svelte`'s modal is a structurally different archetype from every other modal.**
   It's `rounded-none` at every breakpoint (deliberately — it's an edge-to-edge full-viewport dialog
   on the athlete's phone-width column) and gains `md:border-x` at desktop without ever restoring
   rounding, while all 7 other modals use DaisyUI's default `modal-box` rounding untouched. Given
   this modal's whole layout (full-height, capped `max-w-[750px]` to mirror `(athlete)/+layout.svelte`)
   is intentionally a different shape from the coach's small centered form dialogs, this reads as a
   deliberate second archetype rather than a missed override — flagging for awareness, not fixing.
7. **`Athletes` and `Training` pages have no page-level `<h1>`.** `Dashboard` and `Library` both open
   with `<h1 class="mb-4 text-xl font-bold">{Page name}</h1>`; Athletes and Training go straight into
   their content grid with no equivalent heading. This is an information-architecture/content
   question, not a token/color/radius one, and fixing it means adding new copy — outside what a
   styling pass should decide unilaterally.

## Verification

- `npm run check`: clean before and after (0 errors, 0 warnings on the 516 project files both times).
  It always prints a `design_system/vite.config.ts` module-resolution error to stderr
  (`@vitejs/plugin-react` isn't installed for that standalone Figma-export app) — pre-existing,
  unrelated to `src/`, and unaffected by anything in this pass.
- `npm run lint` (`prettier --check . && eslint .`): the baseline, taken _before_ any edit in this
  pass, already failed at the prettier step on `.opencode/package.json` (pre-existing, untouched by
  this audit) and — checked separately by running `eslint .` directly since the prettier failure
  short-circuits the npm script — already had 18 `svelte/no-unused-svelte-ignore` errors in
  `AuthForm.svelte`'s script block (lines 35/46/86/90), also pre-existing and out of scope for a
  styling/markup-only pass. After this pass's edits, `eslint .` reports the exact same 18 errors at
  the same locations (nothing new), and `prettier --check .` reports only the same pre-existing
  `.opencode/package.json` warning — confirmed by running `prettier --write` on just the files this
  audit touched (three of them had lines that now fit `printWidth: 100` after the dead classes were
  removed, so prettier collapsed them back onto fewer lines) and re-checking.
