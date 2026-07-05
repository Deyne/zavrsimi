import fs from 'fs';
import path from 'path';
import { pool, queryOne } from './index';

const BASELINE_MIGRATIONS: { file: string; check: string }[] = [
  {
    file: '001_initial_schema.sql',
    check: `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users' LIMIT 1`,
  },
  {
    file: '002_subcategories.sql',
    check: `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'subcategories' LIMIT 1`,
  },
];

/** Embedded SQL for migrations that were saved with wrong encoding (UTF-16/BOM). */
const PATCHED_MIGRATIONS: Record<string, string> = {
  '009_reputation_ranks.sql': `
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'user_reputation' AND e.enumlabel = 'aktivan_clan'
  ) THEN
    ALTER TYPE user_reputation ADD VALUE 'aktivan_clan';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'user_reputation' AND e.enumlabel = 'veteran'
  ) THEN
    ALTER TYPE user_reputation ADD VALUE 'veteran';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'user_role' AND e.enumlabel = 'podrska'
  ) THEN
    ALTER TYPE user_role ADD VALUE 'podrska';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS support_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES users(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'closed')),
    initial_message TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    claimed_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_support_requests_status ON support_requests(status);
CREATE INDEX IF NOT EXISTS idx_support_requests_user ON support_requests(user_id);
`,
  '010_forum_reply_quotes.sql': `
ALTER TABLE forum_replies ADD COLUMN IF NOT EXISTS quote_text TEXT;
ALTER TABLE forum_replies ADD COLUMN IF NOT EXISTS quote_author_name VARCHAR(200);
`,
  '011_staff_group_chat.sql': `
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_staff_room BOOLEAN DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_single_staff_room ON conversations (is_staff_room) WHERE is_staff_room = true;
`,
  '012_support_ratings.sql': `
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS rating SMALLINT CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5));
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS rating_comment TEXT;
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS rated_at TIMESTAMPTZ;
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS closed_reason VARCHAR(30);
`,
  '013_support_conversations.sql': `
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_support_conversation BOOLEAN DEFAULT false;

UPDATE conversations c
SET is_support_conversation = true
WHERE id IN (
  SELECT conversation_id FROM support_requests WHERE conversation_id IS NOT NULL
);

DO $$
DECLARE
  sr RECORD;
  new_private_id UUID;
  split_at TIMESTAMPTZ;
BEGIN
  FOR sr IN
    SELECT id, user_id, agent_id, conversation_id, claimed_at, created_at
    FROM support_requests
    WHERE conversation_id IS NOT NULL
  LOOP
    split_at := COALESCE(sr.claimed_at, sr.created_at);

    IF EXISTS (
      SELECT 1 FROM messages m
      WHERE m.conversation_id = sr.conversation_id
        AND m.created_at < split_at
    ) THEN
      INSERT INTO conversations (listing_id, is_support_conversation)
      VALUES (NULL, false)
      RETURNING id INTO new_private_id;

      INSERT INTO conversation_participants (conversation_id, user_id)
      SELECT new_private_id, cp.user_id
      FROM conversation_participants cp
      WHERE cp.conversation_id = sr.conversation_id
      ON CONFLICT DO NOTHING;

      UPDATE messages
      SET conversation_id = new_private_id
      WHERE conversation_id = sr.conversation_id
        AND created_at < split_at;
    END IF;
  END LOOP;
END $$;
`,
};

function readMigrationSql(filePath: string): string {
  const buf = fs.readFileSync(filePath);

  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.subarray(2).toString('utf16le').replace(/\u0000/g, '');
  }

  return buf.toString('utf8').replace(/^\uFEFF/, '').replace(/\u0000/g, '');
}

async function bootstrapBaselineMigrations() {
  for (const { file, check } of BASELINE_MIGRATIONS) {
    const exists = await queryOne(check);
    if (exists) {
      await pool.query(
        'INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
        [file]
      );
    }
  }
}

export async function runMigrations() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await bootstrapBaselineMigrations();

  const dir = path.resolve(__dirname, '../../migrations');
  if (!fs.existsSync(dir)) return;

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  const patchedOnly = Object.keys(PATCHED_MIGRATIONS).filter(f => !files.includes(f));
  const allFiles = [...files, ...patchedOnly].sort();

  for (const file of allFiles) {
    const applied = await queryOne('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
    if (applied) continue;

    const filePath = path.join(dir, file);
    const sql = PATCHED_MIGRATIONS[file]
      ?? (fs.existsSync(filePath) ? readMigrationSql(filePath) : null);
    if (!sql?.trim()) continue;

    try {
      await pool.query(sql);
      await pool.query(
        'INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
        [file]
      );
      console.log(`✓ Migracija: ${file}`);
    } catch (err) {
      console.error(`✗ Migracija ${file} neuspešna:`, (err as Error).message);
    }
  }
}
