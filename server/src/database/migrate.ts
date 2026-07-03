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

  for (const file of files) {
    const applied = await queryOne('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
    if (applied) continue;

    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
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
