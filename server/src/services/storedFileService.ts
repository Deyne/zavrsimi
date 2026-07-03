import fs from 'fs';
import path from 'path';
import { query, queryOne } from '../database';
import { config } from '../config';
import { assignUploadFilename } from '../utils/upload';

export async function saveStoredFile(buffer: Buffer, filename: string, mimeType: string) {
  await query(
    `INSERT INTO stored_files (filename, mime_type, data)
     VALUES ($1, $2, $3)
     ON CONFLICT (filename) DO UPDATE SET mime_type = $2, data = $3`,
    [filename, mimeType, buffer]
  );
  const diskPath = path.join(config.upload.dir, filename);
  try {
    fs.mkdirSync(config.upload.dir, { recursive: true });
    fs.writeFileSync(diskPath, buffer);
  } catch {
    /* disk cache optional */
  }
}

export async function getStoredFile(filename: string): Promise<{ data: Buffer; mimeType: string } | null> {
  const row = await queryOne<{ data: Buffer; mime_type: string }>(
    'SELECT data, mime_type FROM stored_files WHERE filename = $1',
    [filename]
  );
  if (row) return { data: row.data, mimeType: row.mime_type };

  const diskPath = path.join(config.upload.dir, filename);
  if (fs.existsSync(diskPath)) {
    const data = fs.readFileSync(diskPath);
    const ext = path.extname(filename).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png'
      : ext === '.webp' ? 'image/webp'
      : ext === '.gif' ? 'image/gif'
      : 'image/jpeg';
    await saveStoredFile(data, filename, mimeType).catch(() => {});
    return { data, mimeType };
  }
  return null;
}

export async function importDiskFilesToDb() {
  if (!fs.existsSync(config.upload.dir)) return;
  const files = fs.readdirSync(config.upload.dir);
  for (const filename of files) {
    if (filename.startsWith('.')) continue;
    const exists = await queryOne('SELECT 1 FROM stored_files WHERE filename = $1', [filename]);
    if (exists) continue;
    const diskPath = path.join(config.upload.dir, filename);
    if (!fs.statSync(diskPath).isFile()) continue;
    const data = fs.readFileSync(diskPath);
    const ext = path.extname(filename).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.gif' ? 'image/gif' : 'image/jpeg';
    await saveStoredFile(data, filename, mimeType).catch(() => {});
  }
}

export async function persistUploadedFile(file: Express.Multer.File) {
  const buffer = file.buffer ?? (file.path ? fs.readFileSync(file.path) : null);
  if (!buffer) throw new Error('Upload fajl nije pročitan');
  const filename = file.filename || assignUploadFilename(file);
  const mimeType = file.mimetype || 'application/octet-stream';
  await saveStoredFile(buffer, filename, mimeType);
}
