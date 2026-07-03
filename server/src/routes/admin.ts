import { Router, Request, Response } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import * as forumService from '../services/forumService';
import * as listingService from '../services/listingService';
import * as reviewService from '../services/reviewService';
import * as activityLogService from '../services/activityLogService';
import * as suspensionService from '../services/suspensionService';

const router = Router();

router.use(authenticate, requireRole('admin', 'moderator'));

router.get('/stats', async (_req, res) => {
  const stats = await forumService.getAdminStats();
  res.json(stats);
});

router.get('/users', async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const search = req.query.search as string;
  const users = await forumService.getUsers(page, 20, search);
  res.json(users);
});

router.get('/users/:id', async (req: Request, res: Response) => {
  const user = await forumService.getUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Korisnik nije pronađen' });
  res.json(user);
});

router.put('/users/:id', async (req: Request, res: Response) => {
  try {
    const user = await forumService.updateUserAdmin(
      req.authUser!.id,
      req.params.id,
      req.body,
      req.authUser!.role,
      req.authUser!.id
    );
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.post('/users/:id/suspend', async (req: Request, res: Response) => {
  try {
    const suspension = await suspensionService.createSuspension(
      req.authUser!.id,
      req.authUser!.role,
      req.params.id,
      {
        reason: req.body.reason,
        evidence: req.body.evidence,
        expiresAt: req.body.expiresAt,
        durationDays: req.body.durationDays ? parseInt(req.body.durationDays, 10) : undefined,
      }
    );
    res.json({ message: 'Korisnik suspendovan', suspensionId: suspension?.id });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.get('/suspensions', async (_req, res) => {
  const suspensions = await suspensionService.getActiveSuspensions();
  res.json({ suspensions });
});

router.put('/suspensions/:id', async (req: Request, res: Response) => {
  try {
    await suspensionService.updateSuspension(
      req.authUser!.id,
      req.authUser!.role,
      req.params.id,
      {
        reason: req.body.reason,
        evidence: req.body.evidence,
        expiresAt: req.body.expiresAt,
        durationDays: req.body.durationDays ? parseInt(req.body.durationDays, 10) : undefined,
      }
    );
    res.json({ message: 'Suspenzija ažurirana' });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.post('/suspensions/:id/lift', async (req: Request, res: Response) => {
  try {
    await suspensionService.liftSuspension(req.authUser!.id, req.authUser!.role, req.params.id);
    res.json({ message: 'Suspenzija uklonjena' });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.get('/listings/pending', async (_req, res) => {
  const { query } = await import('../database');
  const listings = await query(
    `SELECT l.id, l.title, l.type, l.city, l.created_at, u.first_name, u.last_name, u.email
     FROM listings l JOIN users u ON u.id = l.user_id
     WHERE l.status = 'pending' ORDER BY l.created_at DESC LIMIT 50`
  );
  res.json({ listings });
});

router.put('/listings/:id/status', async (req: Request, res: Response) => {
  try {
    await listingService.updateListingStatus(
      req.params.id,
      req.body.status,
      req.authUser!.id,
      req.body.note,
      req.authUser!.role
    );
    res.json({ message: 'Status ažuriran' });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.delete('/listings/:id', async (req: Request, res: Response) => {
  try {
    await listingService.deleteListing(req.params.id, req.authUser!.id, req.authUser!.role);
    res.json({ message: 'Oglas obrisan' });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.get('/verifications/pending', async (_req, res) => {
  const { query } = await import('../database');
  const verifications = await query(
    `SELECT v.*, u.first_name, u.last_name, u.email
     FROM verifications v JOIN users u ON u.id = v.user_id
     WHERE v.status = 'pending' ORDER BY v.created_at`
  );
  res.json(verifications);
});

router.put('/verifications/:id', async (req: Request, res: Response) => {
  await reviewService.reviewVerification(req.params.id, req.authUser!.id, req.body.status, req.body.note);
  res.json({ message: 'Verifikacija obrađena' });
});

router.get('/logs', requireRole('admin'), async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const result = await activityLogService.getActivityLogs(page, 50, {
    userId: req.query.userId as string,
    action: req.query.action as string,
    role: req.query.role as string,
  });
  res.json(result);
});

export default router;
