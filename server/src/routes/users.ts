import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { authenticate, optionalAuth } from '../middleware/auth';
import { verifyRecaptcha } from '../middleware/recaptcha';
import { runValidations } from '../middleware/validate';
import { imageUpload, assignUploadFilename, fileToUrl } from '../utils/upload';
import { persistUploadedFile } from '../services/storedFileService';
import * as authService from '../services/authService';
import * as listingService from '../services/listingService';
import * as reviewService from '../services/reviewService';

const router = Router();

router.get('/users/:id', optionalAuth, async (req: Request, res: Response) => {
  const profile = await authService.getPublicProfile(req.params.id, req.authUser?.id);
  if (!profile) return res.status(404).json({ error: 'Korisnik nije pronađen' });

  const listings = await listingService.getUserListings(req.params.id, 6);
  const reviews = await reviewService.getReviewsForUser(req.params.id, 1, 5);

  res.json({ user: profile, listings, reviews });
});

router.post('/avatar', authenticate, imageUpload.single('avatar'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'Fajl nije uploadovan' });
  assignUploadFilename(req.file);
  await persistUploadedFile(req.file);
  const avatarUrl = fileToUrl(req.file);
  const user = await authService.updateProfile(req.authUser!.id, { avatarUrl });
  res.json(user);
});

router.post('/verify/email/send', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await authService.sendEmailVerification(req.authUser!.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.post('/verify/email/confirm', authenticate, runValidations([
  body('code').isLength({ min: 6, max: 6 }),
]), async (req: Request, res: Response) => {
  try {
    await authService.confirmEmailVerification(req.authUser!.id, req.body.code);
    const user = await authService.getUserById(req.authUser!.id);
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.post('/verify/phone/send', authenticate, runValidations([
  body('phone').notEmpty(),
]), async (req: Request, res: Response) => {
  try {
    const result = await authService.sendPhoneVerification(req.authUser!.id, req.body.phone);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.post('/verify/phone/confirm', authenticate, runValidations([
  body('code').isLength({ min: 6, max: 6 }),
]), async (req: Request, res: Response) => {
  try {
    await authService.confirmPhoneVerification(req.authUser!.id, req.body.code);
    const user = await authService.getUserById(req.authUser!.id);
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

export { verifyRecaptcha };
export default router;