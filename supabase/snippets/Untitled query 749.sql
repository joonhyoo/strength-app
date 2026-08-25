create table athletes (
  id uuid primary key default gen_random_uuid(),
  name text not null
);

create table exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null check (category in ('warmup', 'circuit', 'plyo', 'weight'))
);

create table athlete_workouts (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references athletes(id) on delete cascade,
  scheduled_date date not null,
  unique (athlete_id, scheduled_date)
);

create table athlete_exercises (
  id uuid primary key default gen_random_uuid(),
  athlete_workout_id uuid not null references athlete_workouts(id) on delete cascade,
  exercise_id uuid not null references exercises(id),
  position int not null,
  note text default '',
  complete boolean not null default false
);

create table athlete_sets (
  id uuid primary key default gen_random_uuid(),
  athlete_exercise_id uuid not null references athlete_exercises(id) on delete cascade,
  set_number int not null,
  target_reps int not null,
  weight text,
  reps text
);