-- TripNest upgrade 7: SECURITY (login sessions stored in the database). OKKA SARI matrame run cheyandi.
-- Run after 01..06.
USE tripnest;

-- ============================================================
-- Login sessions.
--  * Before: tokens lived in server memory (lost on restart, never expired).
--  * Now: a session row per login. We store only the SHA-256 HASH of the token,
--    so even if someone reads this table they cannot use the tokens.
--  * Every request checks the token hash + expires_at, and reads the user's CURRENT role from users.
-- ============================================================
CREATE TABLE sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id    INT      NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_session_user   (user_id),
  INDEX idx_session_expiry (expires_at)
);

-- ============================================================
-- OPTIONAL (recommended before the viva): a least-privilege MySQL user for the website.
-- Right now the backend connects as "root", which can drop the whole database if the app is ever hacked.
-- This user can only read/write the tripnest tables and run the stored procedures.
-- 1) Replace the password, 2) uncomment, 3) run, 4) put DB_USER=tripnest_app and DB_PASS=<that password> in backend/.env
-- ============================================================
-- CREATE USER 'tripnest_app'@'localhost' IDENTIFIED BY 'CHANGE_ME_TO_A_LONG_RANDOM_PASSWORD';
-- GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON tripnest.* TO 'tripnest_app'@'localhost';

-- ============================================================
-- VIVA QUERIES
-- Active sessions per user:
--   SELECT u.email, COUNT(*) AS active_sessions FROM sessions s JOIN users u ON u.user_id = s.user_id
--   WHERE s.expires_at > NOW() GROUP BY u.email;
-- Delete expired sessions (the server also does this automatically every 10 minutes):
--   DELETE FROM sessions WHERE expires_at < NOW();
-- ============================================================
