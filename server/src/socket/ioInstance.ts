import { Server } from 'socket.io';
import * as messageService from '../services/messageService';

let ioInstance: Server | null = null;

export function setIo(io: Server) {
  ioInstance = io;
}

export function getIo(): Server | null {
  return ioInstance;
}

export async function emitNewMessage(conversationId: string, senderId: string, message: {
  id: string;
  content: string;
  type: string;
  image_url?: string;
  created_at: string;
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
  };

  io.to(`conversation:${conversationId}`).emit('message:new', payload);

  const conversations = await messageService.getConversations(senderId);
  for (const conv of conversations as { id: string; participants: { id: string }[] }[]) {
    if (conv.id === conversationId) {
      for (const p of conv.participants || []) {
        if (p.id !== senderId) {
          io.to(`user:${p.id}`).emit('notification:message', {
            conversationId,
            preview: message.content.slice(0, 100),
          });
        }
      }
    }
  }
}
