-- Slike u bazi (prelazak VM ↔ lokalni PC bez gubitka fajlova)
CREATE TABLE IF NOT EXISTS stored_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    filename VARCHAR(255) NOT NULL UNIQUE,
    mime_type VARCHAR(100) NOT NULL,
    data BYTEA NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stored_files_filename ON stored_files(filename);

-- Jedini vlasnik platforme (iznad admina)
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_platform_owner BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_single_platform_owner
    ON users ((is_platform_owner)) WHERE is_platform_owner = true;
