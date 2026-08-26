-- handle_new_user() is trigger-only (on_auth_user_created / on_auth_user_confirmed)
-- and was missing the "revoke all from public" every other security-definer
-- function here has, leaving it directly callable via
-- /rest/v1/rpc/handle_new_user by anon and authenticated (flagged by the
-- dashboard's security advisor). Triggers don't need EXECUTE grants to fire.
revoke all on function handle_new_user() from public;
