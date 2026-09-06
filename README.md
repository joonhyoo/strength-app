<p align="center">
  <img src="static/favicon.svg" width="64" height="64" alt="Strength App logo">
</p>

<h1 align="center">Strength App</h1>

Strength App is a coaching platform designed to streamline exercise program delivery
so that coaches and athletes can spend more time focusing on getting stronger, faster,
and more athletic.

I built this because I wanted to help my friends hit their fitness goals, but everyone
tracked their training their own way: a notes app, spreadsheet, vibes. It was
difficult to help them since all the information was scattered around. Unifying the
data and service into one workflow streamlines this process for both sides:
they get to follow a clear plan, and I get to monitor, write, and assess their progress.

Strength App was initially built from scratch with manual wireframing inspired by
TeamBuildr, and then building the core ui myself. I then leaned on agentic coding
workflows to iterate out an MVP quickly. Now I'm fixing bugs, tidying up the UI/UX,
and optimising with a mix of AI and actually reading the documentation.

I've learned a lot along the way about where AI genuinely helps in development versus
where it gets in the way, particularly around ownership of the code it writes. If I have
time I might write a blog on the things I've learnt from this project!

## Features

**Coaches**

- Build a reusable exercise/program library (cycles → sessions → exercises)
- Schedule programs onto a training calendar and shift/assign them per athlete
- Invite athletes by email and manage their roster

**Athletes**

- View today's (or any day's) workout and log sets, reps, and weight while training
- Pull up an exercise's history to see past sessions right from the workout
- Calendar and personal-records views are in progress

## Screenshots

| Program library                                              | Training timeline                                               |
| :----------------------------------------------------------- | :-------------------------------------------------------------- |
| ![Coach program library](docs/screenshots/coach-library.png) | ![Coach training timeline](docs/screenshots/coach-training.png) |

| Athlete roster                                               | Athlete workout view                                        |
| :----------------------------------------------------------- | :---------------------------------------------------------- |
| ![Coach athlete roster](docs/screenshots/coach-athletes.png) | ![Athlete workout view](docs/screenshots/athlete-train.png) |

## Tech Stack

| Technology          | Use case                       |
| :------------------ | :----------------------------- |
| SvelteKit           | Fullstack framework (Svelte 5) |
| TypeScript          | Type checking                  |
| Tailwind + DaisyUI  | Styling                        |
| Supabase            | Auth + Postgres database       |
| Vercel              | Hosting (adapter-vercel)       |
| Vitest + Playwright | Testing                        |
