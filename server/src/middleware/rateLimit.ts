import { Request, Response, NextFunction } from 'express';

/** Rate limiting is disabled — pass-through middleware */
export function globalLimiter(_req: Request, _res: Response, next: NextFunction) {
  next();
}

export const authLimiter = globalLimiter;
export const listingLimiter = globalLimiter;
export const messageLimiter = globalLimiter;
