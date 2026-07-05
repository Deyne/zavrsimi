import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { authenticate, optionalAuth } from '../middleware/auth';
import { runValidations } from '../middleware/validate';
import * as forumService from '../services/forumService';
import { ForumSection } from '@zavrsi-mi/shared';

const router = Router();

router.get('/', optionalAuth, async (req: Request, res: Response) => {
  const section = req.query.section as ForumSection | undefined;
  const page = parseInt(req.query.page as string) || 1;
  const topics = await forumService.getTopics(section, page);
  res.json(topics);
});

router.post('/', authenticate, runValidations([
  body('section').isIn(['preporuke', 'iskustva', 'pitanja', 'opste']).withMessage('Izaberite validnu sekciju'),
  body('title').trim().isLength({ min: 5, max: 200 }).withMessage('Naslov mora imati između 5 i 200 karaktera'),
  body('content').trim().isLength({ min: 20 }).withMessage('Sadržaj mora imati najmanje 20 karaktera'),
]), async (req: Request, res: Response) => {
  const topic = await forumService.createTopic(
    req.authUser!.id,
    req.body.section,
    req.body.title,
    req.body.content,
    req.authUser!.role
  );
  res.status(201).json(topic);
});

router.get('/providers', async (req: Request, res: Response) => {
  try {
    const providers = await forumService.getProvidersDirectory(
      req.query.trade as string,
      req.query.city as string
    );
    res.json(providers);
  } catch (err) {
    console.error('GET /forum/providers:', (err as Error).message);
    res.status(500).json({ error: 'Greška pri učitavanju majstora' });
  }
});

router.get('/map/providers', async (req: Request, res: Response) => {
  try {
    const providers = await forumService.getProvidersOnMap(
      req.query.city as string,
      req.query.trade as string,
      req.query.categoryId ? parseInt(req.query.categoryId as string) : undefined
    );
    res.json(providers);
  } catch (err) {
    console.error('GET /forum/map/providers:', (err as Error).message);
    res.status(500).json({ error: 'Greška pri učitavanju majstora' });
  }
});

router.get('/availability/:userId', async (req: Request, res: Response) => {
  const month = req.query.month as string || new Date().toISOString().slice(0, 7);
  const availability = await forumService.getAvailability(req.params.userId, month);
  res.json(availability);
});

router.put('/availability', authenticate, async (req: Request, res: Response) => {
  await forumService.setAvailability(req.authUser!.id, req.body.dates);
  res.json({ message: 'Dostupnost ažurirana' });
});

router.get('/:id', optionalAuth, async (req: Request, res: Response) => {
  const result = await forumService.getTopicById(req.params.id);
  if (!result.topic) return res.status(404).json({ error: 'Tema nije pronađena' });
  res.json(result);
});

router.post('/:id/replies', authenticate, runValidations([
  body('content').trim().isLength({ min: 5 }),
  body('quoteText').optional().trim().isLength({ max: 1000 }),
  body('quoteAuthorName').optional().trim().isLength({ max: 200 }),
]), async (req: Request, res: Response) => {
  const reply = await forumService.createReply(
    req.params.id,
    req.authUser!.id,
    req.body.content,
    req.authUser!.role,
    req.body.quoteText ? { text: req.body.quoteText, authorName: req.body.quoteAuthorName } : undefined
  );
  res.status(201).json(reply);
});

export default router;
