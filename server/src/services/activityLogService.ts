import { query, queryOne } from '../database';

const ACTION_LABELS: Record<string, string> = {
  user_login: 'Prijava na nalog',
  user_updated: 'Izmena korisničkog profila',
  user_trade_updated: 'Promena zanimanja korisnika',
  user_suspended: 'Suspendovan nalog korisnika',
  user_unsuspended: 'Uklonjena suspenzija korisnika',
  suspension_updated: 'Izmena suspenzije korisnika',
  listing_created: 'Kreiran novi oglas',
  listing_updated: 'Izmena oglasa',
  listing_deleted: 'Obrisan oglas',
  listing_active: 'Odobren oglas',
  listing_rejected: 'Odbijen oglas',
  listing_pending: 'Oglas vraćen na proveru',
  forum_topic_created: 'Nova forum tema',
  forum_reply_created: 'Odgovor na forum temi',
};

const ROLE_LABELS: Record<string, string> = {
  user: 'Korisnik',
  provider: 'Pružalac usluga',
  moderator: 'Moderator',
  admin: 'Administrator',
};

function parseDetails(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  try {
    return JSON.parse(String(raw));
  } catch {
    return {};
  }
}

async function resolveTargetName(targetType?: string | null, targetId?: string | null) {
  if (!targetType || !targetId) return '';
  if (targetType === 'user') {
    const u = await queryOne<{ first_name: string; last_name: string; email: string }>(
      'SELECT first_name, last_name, email FROM users WHERE id = $1',
      [targetId]
    );
    return u ? `${u.first_name} ${u.last_name} (${u.email})` : '';
  }
  if (targetType === 'listing') {
    const l = await queryOne<{ title: string }>('SELECT title FROM listings WHERE id = $1', [targetId]);
    return l ? `"${l.title}"` : '';
  }
  if (targetType === 'forum_topic') {
    const t = await queryOne<{ title: string }>('SELECT title FROM forum_topics WHERE id = $1', [targetId]);
    return t ? `"${t.title}"` : '';
  }
  return '';
}

export async function describeActivityLog(log: {
  action: string;
  user_role: string;
  first_name?: string;
  last_name?: string;
  target_type?: string | null;
  target_id?: string | null;
  details?: unknown;
}): Promise<string> {
  const details = parseDetails(log.details);
  const actor = `${log.first_name || ''} ${log.last_name || ''}`.trim();
  const actorRole = ROLE_LABELS[log.user_role] || log.user_role;
  const target = await resolveTargetName(log.target_type, log.target_id);
  const action = ACTION_LABELS[log.action] || log.action;

  switch (log.action) {
    case 'user_login':
      return `${actor} (${actorRole}) se prijavio/la na nalog.`;
    case 'user_trade_updated':
      return `${actor} (${actorRole}) je promenio/la zanimanje korisnika ${target} u "${details.trade || '—'}".`;
    case 'user_suspended':
      return `${actor} (${actorRole}) je suspendovao/la ${target}. Razlog: ${details.reason || '—'}.${details.expiresAt ? ` Ističe: ${new Date(String(details.expiresAt)).toLocaleString('sr-RS')}.` : ' Trajna suspenzija.'}`;
    case 'user_unsuspended':
      return `${actor} (${actorRole}) je uklonio/la suspenziju za ${target}.`;
    case 'suspension_updated':
      return `${actor} (${actorRole}) je izmenio/la suspenziju za ${target}.`;
    case 'user_updated': {
      const changes: string[] = [];
      if (details.firstName || details.lastName) changes.push('ime/prezime');
      if (details.email) changes.push('email');
      if (details.role) changes.push(`uloga → ${ROLE_LABELS[String(details.role)] || details.role}`);
      if (details.trade) changes.push(`zanimanje → ${details.trade}`);
      if (details.newPassword) changes.push('lozinka');
      if (details.city) changes.push('grad');
      if (details.address) changes.push('adresa');
      return `${actor} (${actorRole}) je izmenio/la profil korisnika ${target}${changes.length ? `: ${changes.join(', ')}` : ''}.`;
    }
    case 'listing_created':
      return `${actor} (${actorRole}) je objavio/la oglas "${details.title || target}" (status: ${details.status || 'pending'}).`;
    case 'listing_updated':
      return `${actor} (${actorRole}) je izmenio/la oglas ${target}${details.reReview ? ' (poslato na ponovnu proveru)' : ''}.`;
    case 'listing_deleted':
      return `${actor} (${actorRole}) je obrisao/la oglas "${details.title || target}".`;
    case 'listing_active':
      return `${actor} (${actorRole}) je odobrio/la oglas ${target}${details.note ? `. Napomena: ${details.note}` : ''}.`;
    case 'listing_rejected':
      return `${actor} (${actorRole}) je odbio/la oglas ${target}. Razlog: ${details.note || '—'}.`;
    case 'forum_topic_created':
      return `${actor} (${actorRole}) je objavio/la forum temu "${details.title || target}" u sekciji ${details.section || '—'}.`;
    case 'forum_reply_created':
      return `${actor} (${actorRole}) je odgovorio/la na forum temu ${target}.`;
    default:
      return `${actor} (${actorRole}): ${action}${target ? ` — ${target}` : ''}${Object.keys(details).length ? `. Detalji: ${Object.entries(details).map(([k, v]) => `${k}: ${v}`).join(', ')}` : ''}`;
  }
}

export async function logActivity(
  userId: string,
  userRole: string,
  action: string,
  targetType?: string,
  targetId?: string,
  details?: Record<string, unknown>
) {
  await query(
    `INSERT INTO activity_logs (user_id, user_role, action, target_type, target_id, details)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, userRole, action, targetType || null, targetId || null, details ? JSON.stringify(details) : null]
  );
}

export async function getActivityLogs(page = 1, limit = 50, filters?: {
  userId?: string;
  action?: string;
  role?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const offset = (page - 1) * limit;
  const conditions: string[] = ['1=1'];
  const params: unknown[] = [];
  let idx = 1;

  if (filters?.userId) {
    conditions.push(`al.user_id = $${idx++}`);
    params.push(filters.userId);
  }
  if (filters?.action) {
    const actions = filters.action.split(',').map(a => a.trim()).filter(Boolean);
    if (actions.length === 1) {
      conditions.push(`al.action = $${idx++}`);
      params.push(actions[0]);
    } else if (actions.length > 1) {
      conditions.push(`al.action = ANY($${idx++}::text[])`);
      params.push(actions);
    }
  }
  if (filters?.role) {
    conditions.push(`al.user_role = $${idx++}`);
    params.push(filters.role);
  }
  if (filters?.search) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(`(u.first_name ILIKE $${idx} OR u.last_name ILIKE $${idx} OR u.email ILIKE $${idx} OR CONCAT(u.first_name, ' ', u.last_name) ILIKE $${idx})`);
    params.push(term);
    idx++;
  }
  if (filters?.dateFrom) {
    conditions.push(`al.created_at >= $${idx++}::timestamptz`);
    params.push(filters.dateFrom);
  }
  if (filters?.dateTo) {
    conditions.push(`al.created_at < ($${idx++}::date + INTERVAL '1 day')`);
    params.push(filters.dateTo);
  }

  params.push(limit, offset);

  const rows = await query(
    `SELECT al.*, u.first_name, u.last_name, u.email
     FROM activity_logs al
     JOIN users u ON u.id = al.user_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY al.created_at DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    params
  );

  const countRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count
     FROM activity_logs al
     JOIN users u ON u.id = al.user_id
     WHERE ${conditions.join(' AND ')}`,
    params.slice(0, params.length - 2)
  );

  const logs = await Promise.all(rows.map(async (row) => {
    const entry = row as Record<string, unknown>;
    return {
      ...entry,
      action_label: ACTION_LABELS[String(entry.action)] || String(entry.action),
      description: await describeActivityLog(entry as Parameters<typeof describeActivityLog>[0]),
    };
  }));

  return {
    logs,
    total: parseInt(countRow?.count || '0', 10),
    page,
    totalPages: Math.ceil(parseInt(countRow?.count || '0', 10) / limit),
  };
}
