-- Migration date: 2026-06-19
--
-- Fix: service_role lacked the BYPASSRLS attribute, which caused all
-- backend writes (via the service_role connection) to be incorrectly
-- blocked by Row Level Security once RLS policies were introduced on
-- application tables. This resulted in chat, document, and profile
-- save operations failing.
--
-- service_role is Mike's trusted backend connection and is expected
-- to bypass RLS entirely, relying on application-level authorization
-- instead. This mirrors standard Supabase self-hosted configuration.

ALTER ROLE service_role WITH BYPASSRLS;
