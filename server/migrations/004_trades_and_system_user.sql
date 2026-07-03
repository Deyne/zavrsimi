-- Zanimanje / struka majstora
ALTER TABLE users ADD COLUMN IF NOT EXISTS trade VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_users_trade ON users(trade) WHERE trade IS NOT NULL;

-- Sistemski nalog za obaveštenja
INSERT INTO users (email, role, first_name, last_name, email_verified, phone_verified)
SELECT 'system@zavrsimi.rs', 'admin', 'Završi Mi', 'Sistem', true, true
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'system@zavrsimi.rs');
