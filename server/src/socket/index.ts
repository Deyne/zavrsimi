import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AuthUser } from '../middleware/auth';
import * as messageService from '../services/messageService';

const SUPPORT_STAFF_ROLES = ['admin', 'moderator', 'podrska'];

function isSupportStaff(role: string) {
  return SUPPORT_STAFF_ROLES.includes(role);
}

interface AuthenticatedSocket extends Socket {
  user?: AuthUser;
}

export function setupSocket(io: Server) {
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
    if (!token) return next(new Error('Unauthorized'));

    try {
      socket.user = jwt.verify(token, config.jwt.secret) as AuthUser;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    const userId = socket.user!.id;

    socket.join(`user:${userId}`);
    if (isSupportStaff(socket.user!.role)) {
      socket.join('staff:support');
    }
    messageService.setUserOnline(userId, true).catch(() => {});
    io.emit('user:online', { userId, isOnline: true });

    socket.on('conversation:join', (conversationId: string) => {
      socket.join(`conversation:${conversationId}`);
    });

    socket.on('message:send', async (data: { conversationId: string; content: string; type?: string; imageUrl?: string }) => {
      try {
        const message = await messageService.sendMessage(
          data.conversationId, userId, data.content, data.type || 'text', data.imageUrl
        );

        io.to(`conversation:${data.conversationId}`).emit('message:new', {
          id: (message as { id: string }).id,
          conversation_id: data.conversationId,
          sender_id: userId,
          content: data.content || 'Slika',
          type: data.type || 'text',
          image_url: data.imageUrl || (message as { image_url?: string }).image_url,
          created_at: (message as { created_at: string }).created_at,
        });

        const conversations = await messageService.getConversations(userId);
        for (const conv of conversations as { id: string; participants: { id: string }[] }[]) {
          if (conv.id === data.conversationId) {
            for (const p of conv.participants || []) {
              if (p.id !== userId) {
                io.to(`user:${p.id}`).emit('notification:message', {
                  conversationId: data.conversationId,
                  preview: data.content.slice(0, 100),
                });
              }
            }
          }
        }
      } catch (err) {
        socket.emit('error', { message: (err as Error).message });
      }
    });

    socket.on('typing:start', (conversationId: string) => {
      socket.to(`conversation:${conversationId}`).emit('typing:start', { userId, conversationId });
    });

    socket.on('typing:stop', (conversationId: string) => {
      socket.to(`conversation:${conversationId}`).emit('typing:stop', { userId, conversationId });
    });

    socket.on('disconnect', () => {
      messageService.setUserOnline(userId, false).catch(() => {});
      io.emit('user:online', { userId, isOnline: false });
    });
  });
}
