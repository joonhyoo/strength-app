-- Test accounts (each gets its own random, unknown password —
-- login is via the dev-only quick-login button on the login page,
-- which signs in through a service-role-generated magic link, not a password)
-- Trigger auto-creates profiles with role='athlete'
-- We update the coach's role and link athletes afterwards

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, invited_at,
  confirmation_token, confirmation_sent_at,
  recovery_token, recovery_sent_at,
  email_change_token_new, email_change, email_change_sent_at,
  last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data,
  is_super_admin, created_at, updated_at,
  phone_confirmed_at, phone_change_sent_at,
  banned_until, reauthentication_sent_at, deleted_at
)
VALUES
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'coach@test.com', crypt(gen_random_uuid()::text, gen_salt('bf')),
   now(), now(), '', now(), '', now(), '', '', now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"email":"coach@test.com","name":"Coach"}'::jsonb,
   false, now(), now(), now(), now(), now(), now(), now()),

  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'anthony@test.com', crypt(gen_random_uuid()::text, gen_salt('bf')),
   now(), now(), '', now(), '', now(), '', '', now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"email":"anthony@test.com","name":"Anthony"}'::jsonb,
   false, now(), now(), now(), now(), now(), now(), now()),

  ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'jack@test.com', crypt(gen_random_uuid()::text, gen_salt('bf')),
   now(), now(), '', now(), '', now(), '', '', now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"email":"jack@test.com","name":"Jack"}'::jsonb,
   false, now(), now(), now(), now(), now(), now(), now()),

  -- Real inbox, for testing the actual send_code/verify_code email flow
  -- rather than the dev quick-login bypass (shouldCreateUser:false means
  -- this account has to exist beforehand for send_code to work at all).
  ('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'joonhyoo12@gmail.com', crypt(gen_random_uuid()::text, gen_salt('bf')),
   now(), now(), '', now(), '', now(), '', '', now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"email":"joonhyoo12@gmail.com","name":"joon"}'::jsonb,
   false, now(), now(), now(), now(), now(), now(), now());

-- Set coach role (trigger defaults to 'athlete')
UPDATE profiles SET role = 'coach', coach_id = id WHERE id = '22222222-2222-2222-2222-222222222222';

-- Link athletes to coach
UPDATE profiles SET coach_id = '22222222-2222-2222-2222-222222222222' WHERE id IN ('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555');

-- Test accounts are pre-configured, already-agreed data (same spirit as the
-- role/coach_id setup above) — mirrors what the prod backfill migration does
-- for real pre-existing accounts, which is a no-op here since seed.sql runs
-- after migrations and these rows don't exist yet at migration time.
UPDATE profiles SET terms_accepted_at = now();

-- Pre-fill usernames too, same reasoning as terms_accepted_at above — these
-- are meant to be ready-to-use test accounts, so they shouldn't hit the
-- needsUsername() /setup-profile gate on first quick-login.
INSERT INTO profile_private (id, username) VALUES
  ('22222222-2222-2222-2222-222222222222', 'coach'),
  ('33333333-3333-3333-3333-333333333333', 'anthony'),
  ('44444444-4444-4444-4444-444444444444', 'jack'),
  ('55555555-5555-5555-5555-555555555555', 'joon');

-- Adding some exercises to start 
INSERT INTO exercises (name, category) VALUES
  ('Barbell Warmup', 'warmup'),
  ('Sprint Warmup', 'warmup'),
  ('Barbell Back Squat', 'weight'),
  ('Romanian Deadlift', 'weight'),
  ('Front Squat', 'weight'),
  ('Reverse Lunge', 'weight'),
  ('Squat Jump', 'plyo'),
  ('Acceleration Development', 'plyo'),
  ('Depth Drop', 'plyo');

INSERT INTO exercises (name, category) VALUES
  ('Barbell Military Press', 'weight'),
  ('Copenhagen Planks', 'weight'),
  ('Clean Pull', 'weight'),
  ('Power Clean', 'weight'),
  ('Hex Bar Deadlift', 'weight'),
  ('Bulgarian Split Squat', 'weight'),
  ('Pull-Up', 'weight'),
  ('Bench Press', 'weight'),
  ('Single Leg Romanian Deadlift', 'weight'),
  ('Prone YTB', 'warmup'),
  ('Face Pulls', 'warmup'),
  ('Band External/Internal Rotation', 'warmup'),
  ('Barbell Squat Jumps', 'plyo'),
  ('Pogo Jumps', 'plyo'),
  ('Band Assisted Jumps', 'plyo'),
  ('Hurdle Hops', 'plyo'),
  ('Jump Sessions', 'plyo'),
  ('Single Leg Alternating Bounds', 'plyo');
