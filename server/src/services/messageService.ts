import { query, queryOne } from '../database';

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

export async function getOrCreateSystemConversation(systemId: string, recipientId: string): Promise<string> {
  await consolidateSystemConversations(systemId, recipientId);
  return getOrCreateConversation(systemId, recipientId);
}

export async function getOrCreateConversation(user1Id: string, user2Id: string, listingId?: string) {
  const existing = await queryOne<{ id: string }>(
    listingId
      ? `SELECT c.id FROM conversations c
         JOIN conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = $1
         JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = $2
         WHERE c.listing_id = $3
         LIMIT 1`
      : `SELECT c.id FROM conversations c
         JOIN conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = $1
         JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = $2
         ORDER BY (c.listing_id IS NULL) DESC, c.updated_at DESC
         LIMIT 1`,
    listingId ? [user1Id, user2Id, listingId] : [user1Id, user2Id]
  );

  if (existing) return existing.id;

  const conv = await queryOne<{ id: string }>(
    'INSERT INTO conversations (listing_id) VALUES ($1) RETURNING id',
    [listingId || null]
  );

  if (!conv) throw new Error('Failed to create conversation');

  await query(
    'INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2), ($1, $3)',
    [conv.id, user1Id, user2Id]
  );

  return conv.id;
}

export async function sendMessage(conversationId: string, senderId: string, content: string, type = 'text', imageUrl?: string) {
  const participant = await queryOne(
    'SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2',
    [conversationId, senderId]
  );

  if (!participant) throw new Error('Niste učesnik razgovora');

  const systemId = await getSystemUserId();
  if (systemId && senderId !== systemId) {
    const isSystemThread = await queryOne(
      `SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, systemId]
    );
    if (isSystemThread) throw new Error('Na sistemska obaveštenja nije moguće odgovoriti');
  }

  const message = await queryOne(
    `INSERT INTO messages (conversation_id, sender_id, type, content, image_url)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [conversationId, senderId, type, content, imageUrl]
  );

  await query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [conversationId]);
  return message;
}

export async function getConversations(userId: string) {
  const systemId = await getSystemUserId();
  if (systemId) {
    await consolidateSystemConversations(systemId, userId);
  }

  const conversations = await query(
    `SELECT c.id, c.listing_id, c.updated_at,
            (SELECT json_agg(json_build_object('id', u.id, 'firstName', u.first_name, 'lastName', u.last_name,
              'avatarUrl', u.avatar_url, 'isOnline', u.is_online))
             FROM conversation_participants cp
             JOIN users u ON u.id = cp.user_id
             WHERE cp.conversation_id = c.id AND u.id != $1) as participants,
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
     ORDER BY c.updated_at DESC`,
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
    `SELECT m.*, u.first_name, u.last_name, u.avatar_url
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
      WHERE msg.sender_id != $1
      AND msg.created_at > COALESCE(cp.last_read_at, '1970-01-01')
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
