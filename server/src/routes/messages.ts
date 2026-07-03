import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { authenticate, checkNotSuspended } from '../middleware/auth';
import { messageLimiter } from '../middleware/rateLimit';
import { runValidations } from '../middleware/validate';
import { imageUpload, assignUploadFilename, fileToUrl } from '../utils/upload';
import { persistUploadedFile } from '../services/storedFileService';
import * as messageService from '../services/messageService';
import { emitNewMessage } from '../socket/ioInstance';

const router = Router();

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

router.get('/:id/messages', authenticate, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const messages = await messageService.getMessages(req.params.id, req.authUser!.id, page);
    res.json(messages);
  } catch (err) {
    res.status(403).json({ error: (err as Error).message });
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
      const msg = message as { id: string; content: string; type: string; image_url?: string; created_at: string };
      await emitNewMessage(req.params.id, req.authUser!.id, {
        id: msg.id,
        content: msg.content,
        type: msg.type,
        image_url: msg.image_url,
        created_at: msg.created_at,
      });
      res.status(201).json(message);
    } catch (err) {
      res.status(403).json({ error: (err as Error).message });
    }
  }
);

export default router;
