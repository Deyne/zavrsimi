import { query, queryOne } from '../database';

export const STAFF_ROLES = ['admin', 'moderator', 'podrska'] as const;

export function isStaffRole(role: string) {
  return STAFF_ROLES.includes(role as typeof STAFF_ROLES[number]);
}

/** SQL fragment: isključuje staff sobu i live support razgovore iz privatnih poruka. */
export const PRIVATE_CONVERSATION_FILTER = `
  COALESCE(c.is_staff_room, false) = false
  AND COALESCE(c.is_support_conversation, false) = false
  AND NOT EXISTS (
    SELECT 1 FROM support_requests sr WHERE sr.conversation_id = c.id
  )
`;

const SYSTEM_EMAIL = 'system@zavrsimi.rs';

async function getSystemUserId(): Promise<string | null> {
  const user = await queryOne<{ id: string }>(
    'SELECT id FROM users WHERE email = $1',
    [SYSTEM_EMAIL]
  );
  return user?.id ?? null;
}

/** Spaja više razgovora sa sistemom u jedan (npr. stari SOS po oglasu). */
export async function consolidateSystemConversations(systemId: string, userId: string): Promise<string | null> {
  const convs = await query<{ id: string }>(
    `SELECT c.id FROM conversations c
     JOIN conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = $1
     JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = $2
     ORDER BY c.updated_at ASC`,
    [systemId, userId]
  );

  if (convs.length <= 1) return convs[0]?.id ?? null;

  const canonicalId = convs[0].id;
  for (let i = 1; i < convs.length; i++) {
    await query('UPDATE messages SET conversation_id = $1 WHERE conversation_id = $2', [canonicalId, convs[i].id]);
    await query('DELETE FROM conversation_participants WHERE conversation_id = $1', [convs[i].id]);
    await query('DELETE FROM conversations WHERE id = $1', [convs[i].id]);
  }

  await query('UPDATE conversations SET listing_id = NULL, updated_at = NOW() WHERE id = $1', [canonicalId]);
  return canonicalId;
}

/** Spaja više razgovora između ista dva korisnika u jedan (ne dira staff grupni čet). */
export async function consolidateUserConversations(user1Id: string, user2Id: string): Promise<string | null> {
  const convs = await query<{ id: string }>(
    `SELECT c.id FROM conversations c
     WHERE COALESCE(c.is_staff_room, false) = false
     AND COALESCE(c.is_support_conversation, false) = false
     AND NOT EXISTS (SELECT 1 FROM support_requests sr WHERE sr.conversation_id = c.id)
     AND (
       SELECT COUNT(*) FROM conversation_participants cp WHERE cp.conversation_id = c.id
     ) = 2
     AND EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = c.id AND user_id = $1)
     AND EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = c.id AND user_id = $2)
     ORDER BY c.updated_at ASC`,
    [user1Id, user2Id]
  );

  if (convs.length <= 1) return convs[0]?.id ?? null;

  const canonicalId = convs[0].id;
  for (let i = 1; i < convs.length; i++) {
    await query('UPDATE messages SET conversation_id = $1 WHERE conversation_id = $2', [canonicalId, convs[i].id]);
    await query('DELETE FROM conversation_participants WHERE conversation_id = $1', [convs[i].id]);
    await query('DELETE FROM conversations WHERE id = $1', [convs[i].id]);
  }

  await query('UPDATE conversations SET listing_id = NULL, updated_at = NOW() WHERE id = $1', [canonicalId]);
  return canonicalId;
}

export async function getOrCreateSystemConversation(systemId: string, recipientId: string): Promise<string> {
  await consolidateSystemConversations(systemId, recipientId);
  return getOrCreateConversation(systemId, recipientId);
}

export async function getOrCreateConversation(user1Id: string, user2Id: string, _listingId?: string) {
  const systemId = await getSystemUserId();
  if (systemId && (user1Id === systemId || user2Id === systemId)) {
    return getOrCreateSystemConversation(systemId, user1Id === systemId ? user2Id : user1Id);
  }

  await consolidateUserConversations(user1Id, user2Id);

  const existing = await queryOne<{ id: string }>(
    `SELECT c.id FROM conversations c
     JOIN conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = $1
     JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = $2
     WHERE COALESCE(c.is_staff_room, false) = false
     AND COALESCE(c.is_support_conversation, false) = false
     AND NOT EXISTS (SELECT 1 FROM support_requests sr WHERE sr.conversation_id = c.id)
     AND (
       SELECT COUNT(*) FROM conversation_participants cp WHERE cp.conversation_id = c.id
     ) = 2
     LIMIT 1`,
    [user1Id, user2Id]
  );

  if (existing) return existing.id;

  const conv = await queryOne<{ id: string }>(
    'INSERT INTO conversations (listing_id, is_support_conversation) VALUES (NULL, false) RETURNING id'
  );

  if (!conv) throw new Error('Failed to create conversation');

  await query(
    'INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2), ($1, $3)',
    [conv.id, user1Id, user2Id]
  );

  return conv.id;
}

/** Novi razgovor isključivo za live support (ne meša se sa privatnim porukama). */
export async function createSupportConversation(agentId: string, userId: string): Promise<string> {
  const conv = await queryOne<{ id: string }>(
    `INSERT INTO conversations (listing_id, is_support_conversation) VALUES (NULL, true) RETURNING id`
  );
  if (!conv) throw new Error('Support razgovor nije kreiran');

  await query(
    'INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2), ($1, $3)',
    [conv.id, agentId, userId]
  );

  return conv.id;
}

export async function isSupportConversation(conversationId: string): Promise<boolean> {
  const row = await queryOne<{ is_support: boolean }>(
    `SELECT (
       COALESCE(c.is_support_conversation, false)
       OR EXISTS (SELECT 1 FROM support_requests sr WHERE sr.conversation_id = c.id)
     ) as is_support
     FROM conversations c WHERE c.id = $1`,
    [conversationId]
  );
  return Boolean(row?.is_support);
}

export async function getConversationContext(conversationId: string, userId: string) {
  const participant = await queryOne(
    'SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2',
    [conversationId, userId]
  );
  if (!participant) throw new Error('Niste učesnik razgovora');

  const isSupport = await isSupportConversation(conversationId);
  const peers = await query<{
    id: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
    role: string;
    is_online: boolean;
  }>(
    `SELECT u.id, u.first_name, u.last_name, u.avatar_url, u.role, u.is_online
     FROM conversation_participants cp
     JOIN users u ON u.id = cp.user_id
     WHERE cp.conversation_id = $1 AND cp.user_id != $2`,
    [conversationId, userId]
  );

  let supportRequest: {
    id: string;
    status: string;
    claimedAt: string | null;
    agentId: string | null;
  } | null = null;

  if (isSupport) {
    const sr = await queryOne<{
      id: string;
      status: string;
      claimed_at: string | null;
      agent_id: string | null;
    }>(
      `SELECT id, status, claimed_at, agent_id FROM support_requests
       WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [conversationId]
    );
    if (sr) {
      supportRequest = {
        id: sr.id,
        status: sr.status,
        claimedAt: sr.claimed_at,
        agentId: sr.agent_id,
      };
    }
  }

  return {
    isSupportConversation: isSupport,
    supportRequest,
    participants: peers.map(p => ({
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      avatarUrl: p.avatar_url,
      role: p.role,
      isOnline: p.is_online,
    })),
  };
}

async function getOrCreateStaffRoomId(): Promise<string> {
  let row = await queryOne<{ id: string }>(
    `SELECT id FROM conversations WHERE is_staff_room = true LIMIT 1`
  );
  if (!row) {
    row = await queryOne<{ id: string }>(
      `INSERT INTO conversations (listing_id, is_staff_room) VALUES (NULL, true) RETURNING id`
    );
  }
  if (!row) throw new Error('Staff soba nije kreirana');
  return row.id;
}

export async function syncStaffRoomAccess(userId: string, role: string) {
  const roomId = await getOrCreateStaffRoomId();
  if (isStaffRole(role)) {
    await query(
      `INSERT INTO conversation_participants (conversation_id, user_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [roomId, userId]
    );
  } else {
    await query(
      `DELETE FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2`,
      [roomId, userId]
    );
  }
}

export async function deleteMessage(messageId: string, requesterId: string, requesterRole: string) {
  if (requesterRole !== 'admin') throw new Error('Samo administrator moze brisati tuđe poruke');

  const msg = await queryOne<{ conversation_id: string; sender_id: string }>(
    'SELECT conversation_id, sender_id FROM messages WHERE id = $1',
    [messageId]
  );
  if (!msg) throw new Error('Poruka nije pronadjena');
  if (msg.sender_id === requesterId) throw new Error('Koristite brisanje samo za tuđe poruke');

  const participant = await queryOne(
    'SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2',
    [msg.conversation_id, requesterId]
  );
  if (!participant) throw new Error('Niste ucesnik razgovora');

  await query('DELETE FROM messages WHERE id = $1', [messageId]);
  return msg.conversation_id;
}

export async function sendMessage(conversationId: string, senderId: string, content: string, type = 'text', imageUrl?: string) {
  const participant = await queryOne(
    'SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2',
    [conversationId, senderId]
  );

  if (!participant) throw new Error('Niste učesnik razgovora');

  const closedSupport = await queryOne(
    `SELECT 1 FROM support_requests WHERE conversation_id = $1 AND status = 'closed' LIMIT 1`,
    [conversationId]
  );
  if (closedSupport) throw new Error('Support razgovor je završen');

  const systemId = await getSystemUserId();
  if (systemId && senderId !== systemId) {
    const isSystemThread = await queryOne(
      `SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, systemId]
    );
    if (isSystemThread) throw new Error('Na sistemska obaveštenja nije moguće odgovoriti');
  }

  const inserted = await queryOne<{ id: string }>(
    `INSERT INTO messages (conversation_id, sender_id, type, content, image_url)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [conversationId, senderId, type, content, imageUrl]
  );

  await query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [conversationId]);

  const message = await queryOne(
    `SELECT m.*, u.first_name, u.last_name, u.avatar_url, u.role as sender_role
     FROM messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.id = $1`,
    [inserted!.id]
  );

  return message;
}

export async function getConversations(userId: string) {
  const userRole = await queryOne<{ role: string }>('SELECT role FROM users WHERE id = $1', [userId]);
  if (userRole) {
    await syncStaffRoomAccess(userId, userRole.role);
  }

  const systemId = await getSystemUserId();
  if (systemId) {
    await consolidateSystemConversations(systemId, userId);
  }

  const others = await query<{ other_id: string }>(
    `SELECT DISTINCT cp2.user_id as other_id
     FROM conversation_participants cp1
     JOIN conversations c ON c.id = cp1.conversation_id
     JOIN conversation_participants cp2 ON cp2.conversation_id = cp1.conversation_id AND cp2.user_id != cp1.user_id
     WHERE cp1.user_id = $1 AND cp2.user_id != COALESCE($2, '00000000-0000-0000-0000-000000000000'::uuid)
       AND COALESCE(c.is_staff_room, false) = false
       AND COALESCE(c.is_support_conversation, false) = false
       AND NOT EXISTS (SELECT 1 FROM support_requests sr WHERE sr.conversation_id = c.id)`,
    [userId, systemId]
  );
  for (const { other_id } of others) {
    await consolidateUserConversations(userId, other_id);
  }

  const conversations = await query(
    `SELECT c.id, c.listing_id, c.updated_at, COALESCE(c.is_staff_room, false) as is_staff_room,
            (SELECT json_agg(json_build_object('id', u.id, 'firstName', u.first_name, 'lastName', u.last_name,
              'avatarUrl', u.avatar_url, 'isOnline', u.is_online, 'role', u.role))
             FROM conversation_participants cp
             JOIN users u ON u.id = cp.user_id
             WHERE cp.conversation_id = c.id AND u.id != $1) as participants,
            (SELECT COUNT(*)::int FROM conversation_participants cp2
             WHERE cp2.conversation_id = c.id AND cp2.user_id != $1) as other_participant_count,
            (SELECT row_to_json(m) FROM (
              SELECT content, created_at, sender_id, type FROM messages
              WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1
            ) m) as last_message,
            (SELECT COUNT(*) FROM messages msg
             JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = $1
             WHERE msg.conversation_id = c.id AND msg.sender_id != $1
             AND msg.created_at > COALESCE(cp.last_read_at, '1970-01-01')) as unread_count
     FROM conversations c
     JOIN conversation_participants cp ON cp.conversation_id = c.id
     WHERE cp.user_id = $1
       AND COALESCE(c.is_staff_room, false) = false
       AND COALESCE(c.is_support_conversation, false) = false
       AND NOT EXISTS (SELECT 1 FROM support_requests sr WHERE sr.conversation_id = c.id)
     ORDER BY COALESCE(c.is_staff_room, false) DESC, c.updated_at DESC`,
    [userId]
  );

  return conversations;
}

export async function getMessages(conversationId: string, userId: string, page = 1, limit = 50) {
  const participant = await queryOne(
    'SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2',
    [conversationId, userId]
  );

  if (!participant) throw new Error('Niste učesnik razgovora');

  const offset = (page - 1) * limit;
  const messages = await query(
    `SELECT m.*, u.first_name, u.last_name, u.avatar_url, u.role as sender_role
     FROM messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.conversation_id = $1
     ORDER BY m.created_at DESC
     LIMIT $2 OFFSET $3`,
    [conversationId, limit, offset]
  );

  await query(
    'UPDATE conversation_participants SET last_read_at = NOW() WHERE conversation_id = $1 AND user_id = $2',
    [conversationId, userId]
  );

  return messages.reverse();
}

export async function getUnreadCount(userId: string) {
  const row = await queryOne<{ count: string }>(
    `SELECT COALESCE(SUM(sub.cnt), 0)::int as count FROM (
      SELECT COUNT(*) as cnt FROM messages msg
      JOIN conversation_participants cp ON cp.conversation_id = msg.conversation_id AND cp.user_id = $1
      JOIN conversations c ON c.id = msg.conversation_id
      WHERE msg.sender_id != $1
      AND msg.created_at > COALESCE(cp.last_read_at, '1970-01-01')
      AND COALESCE(c.is_staff_room, false) = false
      AND COALESCE(c.is_support_conversation, false) = false
      AND NOT EXISTS (SELECT 1 FROM support_requests sr WHERE sr.conversation_id = c.id)
    ) sub`,
    [userId]
  );
  return parseInt(row?.count || '0', 10);
}

export async function setUserOnline(userId: string, isOnline: boolean) {
  await query(
    'UPDATE users SET is_online = $1, last_seen = NOW() WHERE id = $2',
    [isOnline, userId]
  );
}

export async function queryParticipantsExcept(conversationId: string, excludeUserId: string) {
  return query<{ user_id: string }>(
    `SELECT user_id FROM conversation_participants
     WHERE conversation_id = $1 AND user_id != $2`,
    [conversationId, excludeUserId]
  );
}

export async function getStaffRoomIdForUser(userId: string): Promise<string | null> {
  const user = await queryOne<{ role: string }>('SELECT role FROM users WHERE id = $1', [userId]);
  if (!user || !isStaffRole(user.role)) return null;

  await syncStaffRoomAccess(userId, user.role);

  const room = await queryOne<{ id: string }>(
    `SELECT id FROM conversations WHERE is_staff_room = true LIMIT 1`
  );
  if (!room) return null;

  const participant = await queryOne(
    'SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2',
    [room.id, userId]
  );
  if (!participant) return null;

  return room.id;
}

export async function getStaffRoomMembers(userId: string) {
  const roomId = await getStaffRoomIdForUser(userId);
  if (!roomId) throw new Error('Nemate pristup');

  return query<{
    id: string;
    first_name: string;
    last_name: string;
    role: string;
    is_online: boolean;
    avatar_url: string | null;
  }>(
    `SELECT u.id, u.first_name, u.last_name, u.role, u.is_online, u.avatar_url
     FROM conversation_participants cp
     JOIN users u ON u.id = cp.user_id
     WHERE cp.conversation_id = $1
     ORDER BY u.is_online DESC, u.first_name ASC, u.last_name ASC`,
    [roomId]
  );
}
