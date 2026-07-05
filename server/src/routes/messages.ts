import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { authenticate, checkNotSuspended, requireRole } from '../middleware/auth';
import { messageLimiter } from '../middleware/rateLimit';
import { runValidations } from '../middleware/validate';
import { imageUpload, assignUploadFilename, fileToUrl } from '../utils/upload';
import { persistUploadedFile } from '../services/storedFileService';
import * as messageService from '../services/messageService';
import { query, queryOne, transaction } from '../database';
import { emitNewMessage, emitSupportClaimed, emitSupportRequest, emitSupportClosed, emitMessageDeleted, isUserSocketOnline } from '../socket/ioInstance';

const router = Router();

export const SUPPORT_STAFF_ROLES = ['admin', 'moderator', 'podrska'] as const;

export function isSupportStaff(role: string) {
  return SUPPORT_STAFF_ROLES.includes(role as typeof SUPPORT_STAFF_ROLES[number]);
}

interface SupportRow {
  id: string;
  user_id: string;
  agent_id: string | null;
  conversation_id: string | null;
  status: 'waiting' | 'active' | 'closed';
  initial_message: string;
  created_at: string;
  claimed_at: string | null;
  closed_at?: string | null;
  first_name?: string;
  last_name?: string;
  avatar_url?: string | null;
  agent_first_name?: string;
  agent_last_name?: string;
  agent_role?: string;
  rating?: number | null;
  rating_comment?: string | null;
  rated_at?: string | null;
  closed_reason?: string | null;
}

function mapSupportRequest(row: SupportRow) {
  return {
    id: row.id,
    userId: row.user_id,
    agentId: row.agent_id,
    conversationId: row.conversation_id,
    status: row.status,
    initialMessage: row.initial_message,
    createdAt: row.created_at,
    claimedAt: row.claimed_at,
    user: row.first_name ? {
      firstName: row.first_name,
      lastName: row.last_name || '',
      avatarUrl: row.avatar_url,
    } : undefined,
    agent: row.agent_first_name ? {
      firstName: row.agent_first_name,
      lastName: row.agent_last_name || '',
      role: row.agent_role,
    } : undefined,
  };
}

async function getActiveSupportRequest(userId: string) {
  const row = await queryOne<SupportRow>(
    `SELECT sr.*, u.first_name, u.last_name, u.avatar_url,
            a.first_name as agent_first_name, a.last_name as agent_last_name, a.role as agent_role
     FROM support_requests sr
     JOIN users u ON u.id = sr.user_id
     LEFT JOIN users a ON a.id = sr.agent_id
     WHERE sr.user_id = $1 AND sr.status IN ('waiting', 'active')
     ORDER BY sr.created_at DESC LIMIT 1`,
    [userId]
  );
  return row ? mapSupportRequest(row) : null;
}

async function createSupportRequest(userId: string, message: string) {
  const trimmed = message.trim();
  if (trimmed.length < 3) throw new Error('Poruka mora imati najmanje 3 karaktera');

  const existing = await getActiveSupportRequest(userId);
  if (existing) throw new Error('Vec imate aktivan zahtev za podrsku');

  const row = await queryOne<SupportRow>(
    `INSERT INTO support_requests (user_id, initial_message)
     VALUES ($1, $2) RETURNING *`,
    [userId, trimmed]
  );
  if (!row) throw new Error('Greska pri kreiranju zahteva');

  const user = await queryOne<{ first_name: string; last_name: string }>(
    'SELECT first_name, last_name FROM users WHERE id = $1',
    [userId]
  );

  const request = mapSupportRequest({ ...row, first_name: user?.first_name, last_name: user?.last_name });
  await emitSupportRequest(request);
  return request;
}

async function getSupportWaitingQueue() {
  const rows = await query<SupportRow>(
    `SELECT sr.*, u.first_name, u.last_name, u.avatar_url
     FROM support_requests sr
     JOIN users u ON u.id = sr.user_id
     WHERE sr.status = 'waiting'
     ORDER BY sr.created_at ASC`
  );
  return rows.map(mapSupportRequest);
}

async function getAgentActiveSupportChats(agentId: string) {
  const rows = await query<SupportRow & {
    last_message?: { content: string; created_at: string; type?: string } | null;
    unread_count?: number;
  }>(
    `SELECT sr.*, u.first_name, u.last_name, u.avatar_url,
            (SELECT row_to_json(m) FROM (
              SELECT content, created_at, type FROM messages
              WHERE conversation_id = sr.conversation_id ORDER BY created_at DESC LIMIT 1
            ) m) as last_message,
            (SELECT COUNT(*)::int FROM messages msg
             JOIN conversation_participants cp ON cp.conversation_id = sr.conversation_id AND cp.user_id = $1
             WHERE msg.conversation_id = sr.conversation_id AND msg.sender_id != $1
             AND msg.created_at > COALESCE(cp.last_read_at, '1970-01-01')) as unread_count
     FROM support_requests sr
     JOIN users u ON u.id = sr.user_id
     WHERE sr.agent_id = $1 AND sr.status = 'active' AND sr.conversation_id IS NOT NULL
     ORDER BY sr.claimed_at DESC NULLS LAST, sr.created_at DESC`,
    [agentId]
  );

  return rows.map(row => ({
    ...mapSupportRequest(row),
    lastMessage: row.last_message ?? undefined,
    unreadCount: row.unread_count ?? 0,
  }));
}

async function claimSupportRequest(requestId: string, agentId: string) {
  const agent = await queryOne<{ first_name: string; last_name: string; role: string }>(
    'SELECT first_name, last_name, role FROM users WHERE id = $1',
    [agentId]
  );
  if (!agent || !isSupportStaff(agent.role)) throw new Error('Nemate dozvolu');

  const result = await transaction(async (client) => {
    const req = await client.query<SupportRow>(
      `SELECT * FROM support_requests WHERE id = $1 AND status = 'waiting' FOR UPDATE`,
      [requestId]
    );
    const row = req.rows[0];
    if (!row) throw new Error('Zahtev nije dostupan');

    const conversationId = await messageService.createSupportConversation(agentId, row.user_id);
    await client.query(
      `UPDATE support_requests
       SET status = 'active', agent_id = $1, conversation_id = $2, claimed_at = NOW()
       WHERE id = $3`,
      [agentId, conversationId, requestId]
    );

    return { row, conversationId };
  });

  const userMsg = await messageService.sendMessage(
    result.conversationId,
    result.row.user_id,
    result.row.initial_message
  );

  const welcome = `Zdravo! Ja sam ${agent.first_name} iz podr\u0161ke. Kako mogu da vam pomognem?`;
  const agentMsg = await messageService.sendMessage(result.conversationId, agentId, welcome);

  await emitNewMessage(result.conversationId, result.row.user_id, {
    id: (userMsg as { id: string }).id,
    content: result.row.initial_message,
    type: 'text',
    created_at: (userMsg as { created_at: string }).created_at,
  });
  await emitNewMessage(result.conversationId, agentId, {
    id: (agentMsg as { id: string }).id,
    content: welcome,
    type: 'text',
    created_at: (agentMsg as { created_at: string }).created_at,
    first_name: agent.first_name,
    last_name: agent.last_name,
    sender_role: agent.role,
  });

  const claimed = mapSupportRequest({
    ...result.row,
    status: 'active',
    agent_id: agentId,
    conversation_id: result.conversationId,
    claimed_at: new Date().toISOString(),
    agent_first_name: agent.first_name,
    agent_last_name: agent.last_name,
    agent_role: agent.role,
  });

  await emitSupportClaimed(claimed);
  return claimed;
}

async function closeSupportRequest(
  requestId: string,
  userId: string,
  role: string,
  closedReasonParam?: string
) {
  const row = await queryOne<{
    user_id: string;
    agent_id: string | null;
    status: string;
    conversation_id: string | null;
  }>(
    'SELECT user_id, agent_id, status, conversation_id FROM support_requests WHERE id = $1',
    [requestId]
  );
  if (!row) throw new Error('Zahtev nije pronadjen');
  if (row.status === 'closed') return { askRating: false };

  const staff = isSupportStaff(role);
  if (row.user_id !== userId && row.agent_id !== userId && !staff) {
    throw new Error('Nemate dozvolu');
  }

  const wasActive = row.status === 'active';
  const isCustomer = row.user_id === userId;

  let closedReason = closedReasonParam;
  if (!closedReason) {
    if (isCustomer) closedReason = 'user_end';
    else if (row.agent_id === userId) closedReason = 'agent_end';
    else if (staff) closedReason = 'staff_end';
    else closedReason = 'user_end';
  }

  await query(
    `UPDATE support_requests SET status = 'closed', closed_at = NOW(), closed_reason = $2 WHERE id = $1`,
    [requestId, closedReason]
  );

  if (wasActive && row.conversation_id && row.agent_id && row.agent_id === userId) {
    const agent = await queryOne<{ first_name: string; last_name: string; role: string }>(
      'SELECT first_name, last_name, role FROM users WHERE id = $1',
      [userId]
    );
    const farewell = 'Razgovor je zavr\u0161en od strane podr\u0161ke. Hvala vam na kontaktu \u2014 slobodno nas ponovo kontaktirajte ako vam zatreba pomo\u0107.';
    try {
      const agentMsg = await messageService.sendMessage(row.conversation_id, userId, farewell);
      await emitNewMessage(row.conversation_id, userId, {
        id: (agentMsg as { id: string }).id,
        content: farewell,
        type: 'text',
        created_at: (agentMsg as { created_at: string }).created_at,
        first_name: agent?.first_name,
        last_name: agent?.last_name,
        sender_role: agent?.role,
      });
    } catch {
      /* ignore farewell errors */
    }
  }

  await emitSupportClosed({
    id: requestId,
    userId: row.user_id,
    agentId: row.agent_id,
    conversationId: row.conversation_id,
    askRating: wasActive,
  });

  return { askRating: wasActive && isCustomer && !staff };
}

async function closeAllActiveSupportForUser(userId: string, closedReason = 'logout') {
  await query(
    `UPDATE support_requests
     SET status = 'closed', closed_at = NOW(), closed_reason = $2
     WHERE user_id = $1 AND status IN ('waiting', 'active')`,
    [userId, closedReason]
  );
}

async function rateSupportRequest(requestId: string, userId: string, rating: number, comment?: string) {
  const row = await queryOne<{ user_id: string; status: string; rating: number | null }>(
    'SELECT user_id, status, rating FROM support_requests WHERE id = $1',
    [requestId]
  );
  if (!row) throw new Error('Zahtev nije pronadjen');
  if (row.user_id !== userId) throw new Error('Nemate dozvolu');
  if (row.status !== 'closed') throw new Error('Razgovor mora biti zatvoren pre ocene');
  if (row.rating != null) throw new Error('Vec ste ocenili ovaj razgovor');

  await query(
    `UPDATE support_requests
     SET rating = $2, rating_comment = $3, rated_at = NOW()
     WHERE id = $1`,
    [requestId, rating, comment?.trim() || null]
  );
}

async function getSupportHistoryList() {
  const rows = await query<SupportRow & { message_count: number; user_email: string }>(
    `SELECT sr.*, u.first_name, u.last_name, u.email as user_email,
            a.first_name as agent_first_name, a.last_name as agent_last_name, a.role as agent_role,
            (SELECT COUNT(*)::int FROM messages m WHERE m.conversation_id = sr.conversation_id) as message_count
     FROM support_requests sr
     JOIN users u ON u.id = sr.user_id
     LEFT JOIN users a ON a.id = sr.agent_id
     ORDER BY COALESCE(sr.closed_at, sr.claimed_at, sr.created_at) DESC`
  );

  return rows.map(row => ({
    id: row.id,
    status: row.status,
    initialMessage: row.initial_message,
    conversationId: row.conversation_id,
    createdAt: row.created_at,
    claimedAt: row.claimed_at,
    closedAt: row.closed_at,
    closedReason: row.closed_reason || null,
    rating: row.rating ?? null,
    ratingComment: row.rating_comment || null,
    ratedAt: row.rated_at || null,
    messageCount: row.message_count || 0,
    user: {
      firstName: row.first_name || '',
      lastName: row.last_name || '',
      email: row.user_email,
    },
    agent: row.agent_first_name ? {
      firstName: row.agent_first_name,
      lastName: row.agent_last_name || '',
      role: row.agent_role,
    } : undefined,
  }));
}

async function getSupportHistoryDetail(requestId: string) {
  const row = await queryOne<SupportRow & { user_email: string }>(
    `SELECT sr.*, u.first_name, u.last_name, u.email as user_email,
            a.first_name as agent_first_name, a.last_name as agent_last_name, a.role as agent_role
     FROM support_requests sr
     JOIN users u ON u.id = sr.user_id
     LEFT JOIN users a ON a.id = sr.agent_id
     WHERE sr.id = $1`,
    [requestId]
  );
  if (!row) throw new Error('Zahtev nije pronadjen');

  let messages: {
    id: string;
    sender_id: string;
    content: string;
    type: string;
    created_at: string;
    first_name: string;
    last_name: string;
    sender_role: string;
    image_url?: string | null;
  }[] = [];

  if (row.conversation_id) {
    messages = await query(
      `SELECT m.id, m.sender_id, m.content, m.type, m.created_at, m.image_url,
              u.first_name, u.last_name, u.role as sender_role
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.conversation_id = $1
       ORDER BY m.created_at ASC`,
      [row.conversation_id]
    );
  } else if (row.status === 'waiting') {
    messages = [{
      id: 'initial',
      sender_id: row.user_id,
      content: row.initial_message,
      type: 'text',
      created_at: row.created_at,
      first_name: row.first_name || '',
      last_name: row.last_name || '',
      sender_role: 'user',
      image_url: null,
    }];
  }

  return {
    request: {
      id: row.id,
      status: row.status,
      initialMessage: row.initial_message,
      conversationId: row.conversation_id,
      createdAt: row.created_at,
      claimedAt: row.claimed_at,
      closedAt: row.closed_at || null,
      closedReason: row.closed_reason || null,
      rating: row.rating ?? null,
      ratingComment: row.rating_comment || null,
      ratedAt: row.rated_at || null,
      messageCount: messages.length,
      user: {
        firstName: row.first_name || '',
        lastName: row.last_name || '',
        email: row.user_email,
      },
      agent: row.agent_first_name ? {
        firstName: row.agent_first_name,
        lastName: row.agent_last_name || '',
        role: row.agent_role,
      } : undefined,
    },
    messages,
  };
}

export const supportRouter = Router();

supportRouter.get('/history', authenticate, requireRole('admin'), async (_req, res) => {
  try {
    const history = await getSupportHistoryList();
    res.json({ history });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

supportRouter.get('/history/:id', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const detail = await getSupportHistoryDetail(req.params.id);
    res.json(detail);
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

supportRouter.post('/request', authenticate, runValidations([
  body('message').trim().isLength({ min: 3, max: 2000 }),
]), async (req: Request, res: Response) => {
  try {
    const request = await createSupportRequest(req.authUser!.id, req.body.message);
    res.status(201).json({ request });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

supportRouter.get('/mine', authenticate, async (req: Request, res: Response) => {
  const request = await getActiveSupportRequest(req.authUser!.id);
  res.json({ request });
});

supportRouter.get('/queue', authenticate, requireRole('admin', 'moderator', 'podrska'), async (_req, res) => {
  const queue = await getSupportWaitingQueue();
  res.json({ queue });
});

supportRouter.get('/active', authenticate, requireRole('admin', 'moderator', 'podrska'), async (req: Request, res: Response) => {
  const chats = await getAgentActiveSupportChats(req.authUser!.id);
  res.json({ chats });
});

supportRouter.post('/:id/claim', authenticate, requireRole('admin', 'moderator', 'podrska'), async (req: Request, res: Response) => {
  try {
    const request = await claimSupportRequest(req.params.id, req.authUser!.id);
    res.json({ request });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

supportRouter.post('/close-active', authenticate, async (req: Request, res: Response) => {
  try {
    if (isSupportStaff(req.authUser!.role)) {
      return res.json({ message: 'OK' });
    }
    await closeAllActiveSupportForUser(req.authUser!.id, 'logout');
    res.json({ message: 'Support razgovori zatvoreni' });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

supportRouter.post('/:id/rate', authenticate, runValidations([
  body('rating').isInt({ min: 1, max: 5 }),
  body('comment').optional().trim().isLength({ max: 1000 }),
]), async (req: Request, res: Response) => {
  try {
    await rateSupportRequest(
      req.params.id,
      req.authUser!.id,
      parseInt(req.body.rating, 10),
      req.body.comment
    );
    res.json({ message: 'Hvala na oceni' });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

supportRouter.post('/:id/close', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await closeSupportRequest(
      req.params.id,
      req.authUser!.id,
      req.authUser!.role
    );
    res.json({ message: 'Razgovor zatvoren', askRating: result.askRating });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.post('/upload', authenticate, imageUpload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fajl nije uploadovan' });
  assignUploadFilename(req.file);
  await persistUploadedFile(req.file);
  res.json({ url: fileToUrl(req.file) });
});

router.get('/unread-count', authenticate, async (req: Request, res: Response) => {
  const count = await messageService.getUnreadCount(req.authUser!.id);
  res.json({ count });
});

router.get('/', authenticate, async (req: Request, res: Response) => {
  const conversations = await messageService.getConversations(req.authUser!.id);
  res.json(conversations);
});

router.post('/start', authenticate, async (req: Request, res: Response) => {
  const conversationId = await messageService.getOrCreateConversation(
    req.authUser!.id, req.body.recipientId, req.body.listingId
  );
  res.json({ conversationId });
});

router.get('/staff-room/members', authenticate, async (req: Request, res: Response) => {
  try {
    const members = await messageService.getStaffRoomMembers(req.authUser!.id);
    res.json({
      members: members.map(m => ({
        ...m,
        is_online: isUserSocketOnline(m.id) || Boolean(m.is_online),
      })),
    });
  } catch (err) {
    res.status(403).json({ error: (err as Error).message });
  }
});

router.get('/staff-room', authenticate, async (req: Request, res: Response) => {
  try {
    const id = await messageService.getStaffRoomIdForUser(req.authUser!.id);
    if (!id) return res.status(403).json({ error: 'Nemate pristup' });
    res.json({ id });
  } catch (err) {
    res.status(403).json({ error: (err as Error).message });
  }
});

router.get('/:id/context', authenticate, async (req: Request, res: Response) => {
  try {
    const context = await messageService.getConversationContext(req.params.id, req.authUser!.id);
    res.json(context);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.get('/:id/messages', authenticate, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const messages = await messageService.getMessages(req.params.id, req.authUser!.id, page);
    res.json(messages);
  } catch (err) {
    res.status(403).json({ error: (err as Error).message });
  }
});

router.delete('/:id/messages/:messageId', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const conversationId = await messageService.deleteMessage(
      req.params.messageId,
      req.authUser!.id,
      req.authUser!.role
    );
    emitMessageDeleted(conversationId, req.params.messageId);
    res.json({ message: 'Poruka obrisana' });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.post('/:id/messages', authenticate, checkNotSuspended, messageLimiter,
  runValidations([
    body('content').optional().trim(),
    body('type').optional().isIn(['text', 'image']),
  ]),
  async (req: Request, res: Response) => {
    try {
      const content = req.body.content?.trim() || (req.body.imageUrl ? 'Slika' : '');
      if (!content && !req.body.imageUrl) {
        return res.status(400).json({ error: 'Poruka ne može biti prazna' });
      }
      const message = await messageService.sendMessage(
        req.params.id, req.authUser!.id, content, req.body.type || 'text', req.body.imageUrl
      );
      const msg = message as {
        id: string; content: string; type: string; image_url?: string; created_at: string;
        first_name?: string; last_name?: string; avatar_url?: string; sender_role?: string;
      };
      await emitNewMessage(req.params.id, req.authUser!.id, {
        id: msg.id,
        content: msg.content,
        type: msg.type,
        image_url: msg.image_url,
        created_at: msg.created_at,
        first_name: msg.first_name,
        last_name: msg.last_name,
        avatar_url: msg.avatar_url,
        sender_role: msg.sender_role,
      });
      res.status(201).json(message);
    } catch (err) {
      res.status(403).json({ error: (err as Error).message });
    }
  }
);

export default router;
