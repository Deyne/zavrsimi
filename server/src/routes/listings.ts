import { Router, Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, optionalAuth, requireRole, checkNotSuspended } from '../middleware/auth';
import { listingLimiter } from '../middleware/rateLimit';
import { runValidations } from '../middleware/validate';
import { config } from '../config';
import { asyncHandler, parseBool } from '../utils/asyncHandler';
import * as listingService from '../services/listingService';
import { persistUploadedFile } from '../services/storedFileService';
import fs from 'fs';

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      try {
        const fs = require('fs');
        if (!fs.existsSync(config.upload.dir)) {
          fs.mkdirSync(config.upload.dir, { recursive: true });
        }
        cb(null, config.upload.dir);
      } catch (err) {
        cb(err as Error, config.upload.dir);
      }
    },
    filename: (_req, file, cb) => {
      cb(null, `${uuidv4()}${path.extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: config.upload.maxFileSize, files: 10 },
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|gif/;
    cb(null, allowed.test(path.extname(file.originalname).toLowerCase()));
  },
});

function handleMulterError(err: Error, _req: Request, res: Response, next: NextFunction) {
  if (err instanceof multer.MulterError) {
    res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Slika je prevelika (max 5MB)' : err.message });
    return;
  }
  if (err) {
    res.status(400).json({ error: err.message || 'Greška pri uploadu' });
    return;
  }
  next();
}

const router = Router();

router.get('/categories', async (_req, res) => {
  const categories = await listingService.getCategories();
  res.json(categories);
});

router.get('/search', optionalAuth, async (req: Request, res: Response) => {
  const filters = {
    query: req.query.q as string,
    city: req.query.city as string,
    categoryId: req.query.categoryId ? parseInt(req.query.categoryId as string) : undefined,
    subcategoryId: req.query.subcategoryId ? parseInt(req.query.subcategoryId as string) : undefined,
    minPrice: req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined,
    maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined,
    minRating: req.query.minRating ? parseFloat(req.query.minRating as string) : undefined,
    type: req.query.type as import('@zavrsi-mi/shared').ListingType | undefined,
    verified: req.query.verified === 'true',
    latitude: req.query.lat ? parseFloat(req.query.lat as string) : undefined,
    longitude: req.query.lng ? parseFloat(req.query.lng as string) : undefined,
    radiusKm: req.query.radius ? parseFloat(req.query.radius as string) : undefined,
    page: req.query.page ? parseInt(req.query.page as string) : 1,
    limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
  };

  const result = await listingService.searchListings(filters);
  res.json(result);
});

router.get('/sos', authenticate, async (_req, res) => {
  const result = await listingService.searchListings({ type: 'sos', limit: 10 });
  res.json(result.listings);
});

router.get('/my/pending-count', authenticate, async (req: Request, res: Response) => {
  const count = await listingService.getPendingListingCount(req.authUser!.id);
  res.json({ count });
});

router.get('/:id/bids', optionalAuth, async (req: Request, res: Response) => {
  const bids = await listingService.getBidsForListing(req.params.id);
  res.json(bids);
});

router.get('/:id', optionalAuth, async (req: Request, res: Response) => {
  const listing = await listingService.getListingById(req.params.id);
  if (!listing) return res.status(404).json({ error: 'Oglas nije pronađen' });
  await listingService.incrementViewCount(req.params.id);
  res.json(listing);
});

router.post('/', authenticate, checkNotSuspended, listingLimiter,
  (req: Request, res: Response, next: NextFunction) => {
    upload.array('images', 10)(req, res, (err) => {
      if (err) return handleMulterError(err as Error, req, res, next);
      next();
    });
  },
  runValidations([
    body('title').trim().isLength({ min: 5, max: 200 }).withMessage('Naslov mora imati 5-200 karaktera'),
    body('description').trim().isLength({ min: 20 }).withMessage('Opis mora imati najmanje 20 karaktera'),
    body('categoryId').isInt().withMessage('Izaberite kategoriju'),
    body('city').trim().notEmpty().withMessage('Grad je obavezan'),
    body('type').isIn(['offer', 'request', 'sos']).withMessage('Nevalidan tip oglasa'),
  ]),
  asyncHandler(async (req, res) => {
    const files = req.files as Express.Multer.File[];
    for (const f of files || []) {
      if (f.path) {
        f.buffer = fs.readFileSync(f.path);
      }
      await persistUploadedFile(f);
    }
    const imageUrls = files?.map(f => `/uploads/${f.filename}`) || [];

    const subId = req.body.subcategoryId ? parseInt(req.body.subcategoryId, 10) : NaN;

    const listing = await listingService.createListing(req.authUser!.id, {
      type: req.body.type,
      title: req.body.title,
      description: req.body.description,
      categoryId: parseInt(req.body.categoryId, 10),
      subcategoryId: Number.isFinite(subId) ? subId : undefined,
      city: req.body.city,
      address: req.body.address || undefined,
      price: req.body.price ? parseFloat(req.body.price) : undefined,
      priceNegotiable: parseBool(req.body.priceNegotiable),
      priceType: req.body.priceType,
      phone: req.body.phone || undefined,
      isSos: req.body.type === 'sos',
      imageUrls,
    });

    await listingService.logListingCreated(
      req.authUser!.id, req.authUser!.role, listing!.id, req.body.title, listing!.status
    );

    res.status(201).json(listing);
  })
);

router.post('/:id/bids', authenticate, checkNotSuspended, requireRole('provider', 'user'),
  runValidations([
    body('price').isFloat({ min: 0 }),
    body('description').trim().isLength({ min: 10 }),
  ]), asyncHandler(async (req, res) => {
    const bid = await listingService.createBid(req.params.id, req.authUser!.id, req.body);
    res.status(201).json(bid);
  })
);

router.post('/bids/:bidId/accept', authenticate, async (req: Request, res: Response) => {
  try {
    const bid = await listingService.acceptBid(req.params.bidId, req.authUser!.id);
    res.json({ message: 'Ponuda prihvaćena', providerId: bid.provider_id, listingId: bid.listing_id });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.put('/:id', authenticate, checkNotSuspended,
  (req: Request, res: Response, next: NextFunction) => {
    upload.array('images', 10)(req, res, (err) => {
      if (err) return handleMulterError(err as Error, req, res, next);
      next();
    });
  },
  runValidations([
    body('title').optional().trim().isLength({ min: 5, max: 200 }),
    body('description').optional().trim().isLength({ min: 20 }),
    body('city').optional().trim().notEmpty(),
  ]),
  asyncHandler(async (req, res) => {
    const files = req.files as Express.Multer.File[] | undefined;
    const newImageUrls = files?.map(f => `/uploads/${f.filename}`) || [];
    for (const f of files || []) {
      if (f.path) f.buffer = fs.readFileSync(f.path);
      await persistUploadedFile(f);
    }
    const keepImages = req.body.keepImages
      ? (Array.isArray(req.body.keepImages) ? req.body.keepImages : [req.body.keepImages])
      : undefined;
    const subId = req.body.subcategoryId ? parseInt(req.body.subcategoryId, 10) : undefined;

    const listing = await listingService.updateListing(req.params.id, req.authUser!.id, req.authUser!.role, {
      type: req.body.type,
      title: req.body.title,
      description: req.body.description,
      categoryId: req.body.categoryId ? parseInt(req.body.categoryId, 10) : undefined,
      subcategoryId: Number.isFinite(subId) ? subId : undefined,
      city: req.body.city,
      address: req.body.address,
      price: req.body.price ? parseFloat(req.body.price) : undefined,
      priceNegotiable: req.body.priceNegotiable !== undefined ? parseBool(req.body.priceNegotiable) : undefined,
      priceType: req.body.priceType,
      phone: req.body.phone,
      imageUrls: newImageUrls.length ? newImageUrls : undefined,
      keepImages,
    });

    res.json(listing);
  })
);

router.delete('/:id', authenticate, asyncHandler(async (req, res) => {
  await listingService.deleteListing(req.params.id, req.authUser!.id, req.authUser!.role);
  res.json({ message: 'Oglas obrisan' });
}));

export default router;
