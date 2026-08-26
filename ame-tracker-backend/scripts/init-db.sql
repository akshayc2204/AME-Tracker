-- AME Tracker local bootstrap (optional if using Docker Compose).
-- Prefer: docker compose up -d && npx prisma migrate dev
--
-- Manual example:
--   CREATE USER postgres WITH PASSWORD 'postgres' SUPERUSER;
--   CREATE DATABASE ame_tracker OWNER postgres;

CREATE DATABASE ame_tracker;
