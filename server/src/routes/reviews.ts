import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { runValidations } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import * as reviewService from '../services/reviewService';

const router = Router();

router.post('/', authenticate, runValidations([
  body('revieweeId').isUUID(),
  body('listingId').optional({ values: 'null' }).isUUID(),
  body('rating').isInt({ min: 1, max: 5 }),
  body('comment').optional({ values: 'null' }).trim(),
  body('isRecommended').isBoolean(),
]), asyncHandler(async (req: Request, res: Response) => {
  const review = await reviewService.createReview({
    reviewerId: req.authUser!.id,
    revieweeId: req.body.revieweeId,
    listingId: req.body.listingId,
    rating: req.body.rating,
    comment: req.body.comment,
    isRecommended: req.body.isRecommended,
  });
  res.status(201).json(review);
}));

router.get('/listing/:listingId/mine', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const review = await reviewService.getReviewForListing(req.authUser!.id, req.params.listingId);
  res.json({ reviewed: !!review });
}));

router.get('/user/:userId', asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const reviews = await reviewService.getReviewsForUser(req.params.userId, page);
  res.json(reviews);
}));

router.post('/verify', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const verification = await reviewService.requestVerification(
    req.authUser!.id, req.body.type, req.body.documentUrl
  );
  res.status(201).json(verification);
}));

export default router;
