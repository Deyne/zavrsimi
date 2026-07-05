import { Server } from 'socket.io';
import * as messageService from '../services/messageService';

let ioInstance: Server | null = null;

export function setIo(io: Server) {
  ioInstance = io;
}

export function getIo(): Server | null {
  return ioInstance;
}

/** Da li je korisnik trenutno povezan preko socket-a (aktivna sesija). */
export function isUserSocketOnline(userId: string): boolean {
  const io = getIo();
  if (!io) return false;
  const room = io.sockets.adapter.rooms.get(`user:${userId}`);
  return !!room && room.size > 0;
}

export async function emitNewMessage(conversationId: string, senderId: string, message: {
  id: string;
  content: string;
  type: string;
  image_url?: string;
  created_at: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
  sender_role?: string;
}) {
  const io = getIo();
  if (!io) return;

  const payload = {
    id: message.id,
    conversation_id: conversationId,
    sender_id: senderId,
    content: message.content,
    type: message.type,
    image_url: message.image_url,
    created_at: message.created_at,
    first_name: (message as { first_name?: string }).first_name,
    last_name: (message as { last_name?: string }).last_name,
    avatar_url: (message as { avatar_url?: string }).avatar_url,
    sender_role: (message as { sender_role?: string }).sender_role,
  };

  io.to(`conversation:${conversationId}`).emit('message:new', payload);

  const participants = await messageService.queryParticipantsExcept(conversationId, senderId);
  for (const p of participants) {
    io.to(`user:${p.user_id}`).emit('notification:message', {
      conversationId,
      preview: message.content.slice(0, 100),
    });
  }
}

export function emitMessageDeleted(conversationId: string, messageId: string) {
  const io = getIo();
  if (!io) return;
  io.to(`conversation:${conversationId}`).emit('message:deleted', { conversationId, messageId });
}

export async function emitSupportRequest(request: {
  id: string;
  userId: string;
  initialMessage: string;
  createdAt: string;
  user?: { firstName: string; lastName: string };
}) {
  const io = getIo();
  if (!io) return;
  io.to('staff:support').emit('notification:support_request', {
    id: request.id,
    userId: request.userId,
    initialMessage: request.initialMessage,
    createdAt: request.createdAt,
    userName: request.user ? `${request.user.firstName} ${request.user.lastName}` : 'Korisnik',
  });
}

export async function emitSupportClaimed(request: {
  id: string;
  userId: string;
  agentId: string | null;
  conversationId: string | null;
  agent?: { firstName: string; lastName: string; role?: string };
}) {
  const io = getIo();
  if (!io) return;

  io.to(`user:${request.userId}`).emit('support:claimed', {
    requestId: request.id,
    conversationId: request.conversationId,
    agentName: request.agent ? `${request.agent.firstName} ${request.agent.lastName}` : 'Agent',
    agentRole: request.agent?.role,
    agentId: request.agentId,
  });

  io.to('staff:support').emit('support:request_claimed', { requestId: request.id });
}

export function emitSupportClosed(data: {
  id: string;
  userId: string;
  agentId: string | null;
  conversationId: string | null;
  askRating: boolean;
}) {
  const io = getIo();
  if (!io) return;

  io.to(`user:${data.userId}`).emit('support:closed', {
    requestId: data.id,
    conversationId: data.conversationId,
    askRating: data.askRating,
  });

  if (data.agentId && data.agentId !== data.userId) {
    io.to(`user:${data.agentId}`).emit('support:closed', {
      requestId: data.id,
      conversationId: data.conversationId,
      askRating: false,
    });
  }

  io.to('staff:support').emit('support:request_closed', {
    requestId: data.id,
    conversationId: data.conversationId,
  });
}
