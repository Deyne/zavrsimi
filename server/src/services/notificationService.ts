import { query, queryOne } from '../database';
import { getTradesForCategory } from '@zavrsi-mi/shared';
import * as messageService from './messageService';
import { emitNewMessage } from '../socket/ioInstance';

const SYSTEM_EMAIL = 'system@zavrsimi.rs';

export async function getSystemUserId(): Promise<string> {
  let user = await queryOne<{ id: string }>(
    'SELECT id FROM users WHERE email = $1',
    [SYSTEM_EMAIL]
  );

  if (!user) {
    user = await queryOne<{ id: string }>(
      `INSERT INTO users (email, role, first_name, last_name, email_verified, phone_verified)
       VALUES ($1, 'admin', 'Završi Mi', 'Sistem', true, true) RETURNING id`,
      [SYSTEM_EMAIL]
    );
  }

  if (!user) throw new Error('Sistemski korisnik nije dostupan');
  return user.id;
}

export async function sendSystemMessage(
  recipientId: string,
  content: string,
  options?: { type?: string; imageUrl?: string }
) {
  const systemId = await getSystemUserId();
  const conversationId = await messageService.getOrCreateSystemConversation(systemId, recipientId);
  const message = await messageService.sendMessage(
    conversationId,
    systemId,
    content,
    options?.type || 'text',
    options?.imageUrl
  );

  const msg = message as { id: string; content: string; type: string; image_url?: string; created_at: string };
  await emitNewMessage(conversationId, systemId, {
    id: msg.id,
    content: msg.content,
    type: msg.type,
    image_url: msg.image_url,
    created_at: msg.created_at,
  });

  return { conversationId, message };
}

export async function notifyMatchingProvidersForSos(
  listingId: string,
  categoryId: number,
  title: string,
  city: string
) {
  const trades = getTradesForCategory(categoryId);
  if (trades.length === 0) return;

  const providers = await query<{ id: string }>(
    `SELECT id FROM users
     WHERE trade = ANY($1::text[])
       AND role IN ('provider', 'user')
       AND is_suspended = false`,
    [trades]
  );

  const imageRow = await queryOne<{ url: string }>(
    'SELECT url FROM listing_images WHERE listing_id = $1 ORDER BY sort_order LIMIT 1',
    [listingId]
  );

  const payload = JSON.stringify({
    listingId,
    title,
    city,
    preview: `🚨 HITAN OGLAS u vašoj struci! "${title}" — ${city}`,
  });

  for (const provider of providers) {
    try {
      await sendSystemMessage(provider.id, payload, {
        type: 'listing_alert',
        imageUrl: imageRow?.url,
      });
    } catch (err) {
      console.warn('SOS obaveštenje nije poslato korisniku', provider.id, (err as Error).message);
    }
  }
}
