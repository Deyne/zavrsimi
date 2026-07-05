import { query, queryOne } from '../database';
import { logActivity } from './activityLogService';
import { ForumSection } from '@zavrsi-mi/shared';

export async function createTopic(userId: string, section: ForumSection, title: string, content: string, userRole = 'user') {
  const topic = await queryOne(
    'INSERT INTO forum_topics (user_id, section, title, content) VALUES ($1, $2, $3, $4) RETURNING *',
    [userId, section, title, content]
  );
  if (topic) {
    await logActivity(userId, userRole, 'forum_topic_created', 'forum_topic', (topic as { id: string }).id, { title, section });
  }
  return topic;
}

export async function getTopics(section?: ForumSection, page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const conditions = section ? 'WHERE t.section = $3' : '';
  const params = section ? [limit, offset, section] : [limit, offset];

  const topics = await query(
    `SELECT t.*, u.first_name, u.last_name, u.avatar_url, u.reputation
     FROM forum_topics t
     JOIN users u ON u.id = t.user_id
     ${conditions}
     ORDER BY t.is_pinned DESC, t.updated_at DESC
     LIMIT $1 OFFSET $2`,
    params
  );

  return topics;
}

export async function getTopicById(id: string) {
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(id)) {
    return { topic: null, replies: [] };
  }

  await query('UPDATE forum_topics SET view_count = view_count + 1 WHERE id = $1', [id]);

  const topic = await queryOne(
    `SELECT t.*, u.first_name, u.last_name, u.avatar_url, u.reputation, u.role
     FROM forum_topics t JOIN users u ON u.id = t.user_id WHERE t.id = $1`,
    [id]
  );

  const replies = await query(
    `SELECT r.*, u.first_name, u.last_name, u.avatar_url, u.reputation, u.role
     FROM forum_replies r JOIN users u ON u.id = r.user_id
     WHERE r.topic_id = $1 ORDER BY r.created_at ASC`,
    [id]
  );

  return { topic, replies };
}

export async function createReply(
  topicId: string,
  userId: string,
  content: string,
  userRole = 'user',
  quote?: { text?: string; authorName?: string }
) {
  const reply = await queryOne(
    `INSERT INTO forum_replies (topic_id, user_id, content, quote_text, quote_author_name)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [topicId, userId, content, quote?.text?.trim() || null, quote?.authorName?.trim() || null]
  );

  await query(
    'UPDATE forum_topics SET reply_count = reply_count + 1, updated_at = NOW() WHERE id = $1',
    [topicId]
  );

  if (reply) {
    await logActivity(userId, userRole, 'forum_reply_created', 'forum_topic', topicId, { contentLength: content.length });
  }

  return reply;
}

export async function setAvailability(userId: string, dates: { date: string; status: string; note?: string }[]) {
  for (const d of dates) {
    await query(
      `INSERT INTO availability (user_id, date, status, note)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, date) DO UPDATE SET status = $3, note = $4`,
      [userId, d.date, d.status, d.note]
    );
  }
}

export async function getAvailability(userId: string, month: string) {
  return query(
    'SELECT date, status, note FROM availability WHERE user_id = $1 AND date >= $2::date AND date < ($2::date + INTERVAL \'1 month\')',
    [userId, `${month}-01`]
  );
}

function privacyMapOffset(userId: string, lat: number, lng: number) {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    hash |= 0;
  }
  const angle = ((hash % 360) * Math.PI) / 180;
  const dist = 0.004 + (Math.abs(hash) % 80) / 10000;
  return {
    lat: lat + Math.cos(angle) * dist,
    lng: lng + Math.sin(angle) * dist,
  };
}

export async function getProvidersOnMap(city?: string, trade?: string, categoryId?: number) {
  const conditions = [
    "u.trade IS NOT NULL",
    "u.address IS NOT NULL AND TRIM(u.address) != ''",
    'u.latitude IS NOT NULL',
    'u.longitude IS NOT NULL',
    "u.role IN ('provider', 'user')",
    'u.is_suspended = false',
  ];
  const params: unknown[] = [];
  let idx = 1;

  if (city) {
    conditions.push(`u.city ILIKE $${idx}`);
    params.push(`%${city}%`);
    idx++;
  }

  if (trade) {
    conditions.push(`u.trade = $${idx}`);
    params.push(trade);
    idx++;
  }

  if (categoryId) {
    const { getTradesForCategory } = await import('@zavrsi-mi/shared');
    const trades = getTradesForCategory(categoryId);
    if (trades.length) {
      conditions.push(`u.trade = ANY($${idx}::text[])`);
      params.push(trades);
      idx++;
    }
  }

  const rows = await query<{
    id: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
    city: string;
    latitude: number;
    longitude: number;
    trade: string;
    average_rating: number;
    completed_jobs: number;
    reputation: string;
  }>(
    `SELECT u.id, u.first_name, u.last_name, u.avatar_url, u.city,
            u.latitude, u.longitude, u.trade,
            u.average_rating, u.completed_jobs, u.reputation
     FROM users u
     WHERE ${conditions.join(' AND ')}
     ORDER BY u.average_rating DESC
     LIMIT 100`,
    params
  );

  return rows.map(r => {
    const offset = privacyMapOffset(r.id, Number(r.latitude), Number(r.longitude));
    return {
      ...r,
      latitude: offset.lat,
      longitude: offset.lng,
      areaLabel: r.city,
    };
  });
}

export async function getProvidersDirectory(trade?: string, city?: string) {
  const conditions = [
    "u.trade IS NOT NULL",
    "TRIM(u.trade) != ''",
    'u.is_suspended = false',
  ];
  const params: unknown[] = [];
  let idx = 1;

  if (city) {
    conditions.push(`u.city ILIKE $${idx++}`);
    params.push(`%${city}%`);
  }
  if (trade) {
    conditions.push(`u.trade = $${idx++}`);
    params.push(trade);
  }

  const providers = await query<{
    id: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
    city: string;
    trade: string;
    average_rating: number;
    completed_jobs: number;
    reputation: string;
    bio: string | null;
    role: string;
  }>(
    `SELECT u.id, u.first_name, u.last_name, u.avatar_url, u.city, u.trade,
            u.average_rating, u.completed_jobs, u.reputation, u.bio, u.role
     FROM users u
     WHERE ${conditions.join(' AND ')}
     ORDER BY u.average_rating DESC, u.completed_jobs DESC
     LIMIT 100`,
    params
  );

  const result = [];
  for (const p of providers) {
    const listings = await query<{
      id: string;
      title: string;
      price: number | null;
      price_type: string | null;
      city: string;
      image_url: string | null;
      created_at: string;
    }>(
      `SELECT l.id, l.title, l.price, COALESCE(l.price_type, 'fixed') as price_type, l.city, l.created_at,
              (SELECT url FROM listing_images li WHERE li.listing_id = l.id ORDER BY sort_order LIMIT 1) as image_url
       FROM listings l
       WHERE l.user_id = $1 AND l.status = 'active'
       ORDER BY l.created_at DESC
       LIMIT 8`,
      [p.id]
    );
    result.push({ ...p, listings });
  }
  return result;
}

export async function ensurePlatformOwner() {
  const placeholder = 'tvoj-email@example.com';
  const configured = process.env.PLATFORM_OWNER_EMAIL?.toLowerCase().trim();
  const email = !configured || configured === placeholder
    ? 'admin@zavrsimi.rs'
    : configured;

  await query('UPDATE users SET is_platform_owner = false WHERE is_platform_owner = true AND LOWER(email) != $1', [email]);
  await query(
    `UPDATE users SET is_platform_owner = true, role = 'admin'
     WHERE LOWER(email) = $1`,
    [email]
  );
}

export async function getAdminStats() {
  const stats = await queryOne<{
    total_users: string;
    total_providers: string;
    active_listings: string;
    pending_listings: string;
    pending_verifications: string;
    sos_listings: string;
  }>(
    `SELECT
      (SELECT COUNT(*) FROM users WHERE role != 'admin') as total_users,
      (SELECT COUNT(*) FROM users WHERE role = 'provider') as total_providers,
      (SELECT COUNT(*) FROM listings WHERE status = 'active') as active_listings,
      (SELECT COUNT(*) FROM listings WHERE status = 'pending') as pending_listings,
      (SELECT COUNT(*) FROM verifications WHERE status = 'pending') as pending_verifications,
      (SELECT COUNT(*) FROM listings WHERE is_sos = true AND status = 'active') as sos_listings`
  );

  return stats;
}

export async function getUsers(page = 1, limit = 20, search?: string) {
  const offset = (page - 1) * limit;
  const conditions = search ? 'WHERE email ILIKE $3 OR first_name ILIKE $3 OR last_name ILIKE $3' : '';
  const params = search ? [limit, offset, `%${search}%`] : [limit, offset];

  return query(
    `SELECT id, email, role, trade, first_name, last_name, city, address, phone, bio, avatar_url, is_suspended, is_platform_owner, created_at
     FROM users ${conditions}
     ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    params
  );
}

export async function getUserById(userId: string) {
  return queryOne(
    `SELECT id, email, role, trade, first_name, last_name, city, address, phone, bio, is_suspended, is_platform_owner, created_at
     FROM users WHERE id = $1`,
    [userId]
  );
}

export async function updateUserAdmin(adminId: string, userId: string, data: {
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
  trade?: string;
  city?: string;
  address?: string;
  phone?: string;
  bio?: string;
  newPassword?: string;
}, requesterRole = 'admin', requesterId?: string) {
  const requester = await queryOne<{ role: string; is_platform_owner: boolean }>(
    'SELECT role, is_platform_owner FROM users WHERE id = $1',
    [requesterId || adminId]
  );
  const target = await queryOne<{ role: string; is_platform_owner: boolean }>(
    'SELECT role, is_platform_owner FROM users WHERE id = $1',
    [userId]
  );
  if (!target) throw new Error('Korisnik nije pronađen');

  const isOwner = Boolean(requester?.is_platform_owner);
  const isAdmin = requesterRole === 'admin' || isOwner;
  const isModerator = requesterRole === 'moderator';

  if (!isAdmin && !isModerator) throw new Error('Nemate dozvolu');

  if (target.is_platform_owner && data.role !== undefined) {
    throw new Error('Vlasnik platforme ne može biti degradiran');
  }

  const adminRoleChange = data.role === 'admin' || (target.role === 'admin' && data.role && data.role !== 'admin');
  if (adminRoleChange && !isOwner) {
    throw new Error('Samo vlasnik platforme može dodeliti ili ukloniti admin ulogu');
  }

  if (isModerator) {
    if (data.trade === undefined) throw new Error('Moderator može menjati samo zanimanje');
    const extra = ['firstName', 'lastName', 'email', 'role', 'city', 'address', 'phone', 'bio', 'newPassword']
      .filter(k => (data as Record<string, unknown>)[k] !== undefined);
    if (extra.length > 0) throw new Error('Moderator može menjati samo zanimanje korisnika');

    await query(
      `UPDATE users SET trade = NULLIF($1::text, ''), updated_at = NOW() WHERE id = $2`,
      [data.trade ?? '', userId]
    );
    await logActivity(adminId, 'moderator', 'user_trade_updated', 'user', userId, { trade: data.trade });
    return getUserById(userId);
  }

  const allowedRoles = ['user', 'provider', 'moderator', 'admin', 'podrska'];
  if (data.role && !allowedRoles.includes(data.role)) {
    throw new Error('Neispravna uloga');
  }

  if (data.newPassword?.trim()) {
    const bcrypt = await import('bcryptjs');
    if (data.newPassword.length < 8) throw new Error('Lozinka mora imati najmanje 8 karaktera');
    const hash = await bcrypt.hash(data.newPassword, 12);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);
  }

  if (data.address !== undefined || data.city !== undefined) {
    const current = await queryOne<{ city: string | null; address: string | null }>(
      'SELECT city, address FROM users WHERE id = $1',
      [userId]
    );
    const cityVal = (data.city ?? current?.city ?? '').trim();
    const addressVal = (data.address ?? current?.address ?? '').trim();
    if (addressVal && cityVal) {
      const { geocodeAddress } = await import('../utils/geocode');
      const coords = await geocodeAddress(cityVal, addressVal);
      await query(
        'UPDATE users SET latitude = $1, longitude = $2 WHERE id = $3',
        [coords?.latitude ?? null, coords?.longitude ?? null, userId]
      );
    } else {
      await query('UPDATE users SET latitude = NULL, longitude = NULL WHERE id = $1', [userId]);
    }
  }

  const user = await queryOne(
    `UPDATE users SET
      first_name = COALESCE($2, first_name),
      last_name = COALESCE($3, last_name),
      email = COALESCE($4, email),
      role = COALESCE($5, role),
      city = COALESCE($6, city),
      address = COALESCE($7, address),
      phone = COALESCE($8, phone),
      bio = COALESCE($9, bio),
      trade = CASE WHEN $11 THEN NULLIF($10::text, '') ELSE trade END,
      updated_at = NOW()
     WHERE id = $1
     RETURNING id, email, role, trade, first_name, last_name, city, address, phone, bio, is_suspended, created_at`,
    [
      userId,
      data.firstName,
      data.lastName,
      data.email?.toLowerCase(),
      data.role,
      data.city,
      data.address,
      data.phone,
      data.bio,
      data.trade ?? '',
      data.trade !== undefined,
    ]
  );

  if (!user) throw new Error('Korisnik nije pronađen');

  if (data.role !== undefined) {
    const { syncStaffRoomAccess } = await import('./messageService');
    await syncStaffRoomAccess(userId, (user as { role: string }).role);
  }

  await logActivity(adminId, 'admin', 'user_updated', 'user', userId, {
    ...data,
    newPassword: data.newPassword ? '[promenjena]' : undefined,
  });

  return user;
}
