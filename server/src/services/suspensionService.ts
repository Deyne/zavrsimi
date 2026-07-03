import { query, queryOne } from '../database';
import { logActivity } from './activityLogService';

export interface SuspensionRecord {
  id: string;
  user_id: string;
  suspended_by: string;
  suspended_by_role: string;
  reason: string;
  evidence: string | null;
  starts_at: string;
  expires_at: string | null;
  is_active: boolean;
  lifted_at: string | null;
  lifted_by: string | null;
  created_at: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  suspender_first_name?: string;
  suspender_last_name?: string;
}

export async function expireStaleSuspensions() {
  await query(
    `UPDATE user_suspensions SET is_active = false, lifted_at = NOW(), updated_at = NOW()
     WHERE is_active = true AND expires_at IS NOT NULL AND expires_at <= NOW()`
  );
  await query(
    `UPDATE users u SET is_suspended = false, updated_at = NOW()
     WHERE is_suspended = true
     AND NOT EXISTS (
       SELECT 1 FROM user_suspensions s
       WHERE s.user_id = u.id AND s.is_active = true
       AND (s.expires_at IS NULL OR s.expires_at > NOW())
     )`
  );
}

export async function isUserSuspended(userId: string): Promise<boolean> {
  await expireStaleSuspensions();
  const row = await queryOne<{ active: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM user_suspensions
       WHERE user_id = $1 AND is_active = true
       AND (expires_at IS NULL OR expires_at > NOW())
     ) as active`,
    [userId]
  );
  return Boolean(row?.active);
}

export async function createSuspension(
  actorId: string,
  actorRole: string,
  userId: string,
  data: { reason: string; evidence?: string; expiresAt?: string | null; durationDays?: number }
) {
  if (!data.reason?.trim()) throw new Error('Razlog suspenzije je obavezan');

  const target = await queryOne<{ role: string; is_platform_owner: boolean }>(
    'SELECT role, is_platform_owner FROM users WHERE id = $1', [userId]
  );
  if (!target) throw new Error('Korisnik nije pronađen');
  if (target.is_platform_owner) throw new Error('Vlasnik platforme ne može biti suspendovan');
  if (target.role === 'admin') throw new Error('Admin nalog ne može biti suspendovan');
  if (actorRole === 'moderator' && target.role === 'moderator') {
    throw new Error('Moderator ne može suspendovati drugog moderatora');
  }

  let expiresAt: string | null = data.expiresAt || null;
  if (!expiresAt && data.durationDays && data.durationDays > 0) {
    const d = new Date();
    d.setDate(d.getDate() + data.durationDays);
    expiresAt = d.toISOString();
  }

  await query(
    `UPDATE user_suspensions SET is_active = false, lifted_at = NOW(), updated_at = NOW()
     WHERE user_id = $1 AND is_active = true`,
    [userId]
  );

  const suspension = await queryOne<{ id: string }>(
    `INSERT INTO user_suspensions (user_id, suspended_by, suspended_by_role, reason, evidence, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [userId, actorId, actorRole, data.reason.trim(), data.evidence?.trim() || null, expiresAt]
  );

  await query('UPDATE users SET is_suspended = true, updated_at = NOW() WHERE id = $1', [userId]);

  await logActivity(actorId, actorRole, 'user_suspended', 'user', userId, {
    reason: data.reason,
    evidence: data.evidence,
    expiresAt,
    suspensionId: suspension?.id,
  });

  return suspension;
}

export async function liftSuspension(actorId: string, actorRole: string, suspensionId: string) {
  const s = await queryOne<{ user_id: string }>(
    'SELECT user_id FROM user_suspensions WHERE id = $1 AND is_active = true',
    [suspensionId]
  );
  if (!s) throw new Error('Suspenzija nije pronađena');

  await query(
    `UPDATE user_suspensions SET is_active = false, lifted_at = NOW(), lifted_by = $2, updated_at = NOW()
     WHERE id = $1`,
    [suspensionId, actorId]
  );
  await query('UPDATE users SET is_suspended = false, updated_at = NOW() WHERE id = $1', [s.user_id]);

  await logActivity(actorId, actorRole, 'user_unsuspended', 'user', s.user_id, { suspensionId });
}

export async function updateSuspension(
  actorId: string,
  actorRole: string,
  suspensionId: string,
  data: { reason?: string; evidence?: string; expiresAt?: string | null; durationDays?: number }
) {
  const existing = await queryOne<SuspensionRecord>(
    'SELECT * FROM user_suspensions WHERE id = $1 AND is_active = true',
    [suspensionId]
  );
  if (!existing) throw new Error('Suspenzija nije pronađena');

  let expiresAt = data.expiresAt !== undefined ? data.expiresAt : existing.expires_at;
  if (data.durationDays && data.durationDays > 0) {
    const d = new Date();
    d.setDate(d.getDate() + data.durationDays);
    expiresAt = d.toISOString();
  }

  await query(
    `UPDATE user_suspensions SET
      reason = COALESCE($2, reason),
      evidence = COALESCE($3, evidence),
      expires_at = $4,
      updated_at = NOW()
     WHERE id = $1`,
    [suspensionId, data.reason?.trim(), data.evidence?.trim(), expiresAt]
  );

  await logActivity(actorId, actorRole, 'suspension_updated', 'user', existing.user_id, {
    suspensionId,
    reason: data.reason,
    expiresAt,
  });
}

export function formatSuspensionRemaining(expiresAt: string | null): string {
  if (!expiresAt) return 'Trajanje: trajna suspenzija.';
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Suspenzija ističe.';
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} ${days === 1 ? 'dan' : 'dana'}`);
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'sat' : 'sati'}`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes} ${minutes === 1 ? 'minut' : 'minuta'}`);
  return `Preostalo do isteka: ${parts.join(', ')}.`;
}

export async function getSuspensionLoginMessage(email: string): Promise<string | null> {
  await expireStaleSuspensions();
  const user = await queryOne<{ id: string }>('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (!user) return null;

  const s = await queryOne<{ reason: string; expires_at: string | null }>(
    `SELECT reason, expires_at FROM user_suspensions
     WHERE user_id = $1 AND is_active = true
     AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY created_at DESC LIMIT 1`,
    [user.id]
  );
  if (!s) return null;

  return `Vaš nalog je suspendovan. Razlog: ${s.reason}. ${formatSuspensionRemaining(s.expires_at)}`;
}

export async function getActiveSuspensions() {
  await expireStaleSuspensions();
  return query<SuspensionRecord>(
    `SELECT s.*,
            u.first_name, u.last_name, u.email,
            sb.first_name as suspender_first_name, sb.last_name as suspender_last_name
     FROM user_suspensions s
     JOIN users u ON u.id = s.user_id
     JOIN users sb ON sb.id = s.suspended_by
     WHERE s.is_active = true
     AND (s.expires_at IS NULL OR s.expires_at > NOW())
     ORDER BY s.created_at DESC`
  );
}
