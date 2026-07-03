import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    authUser?: AuthUser;
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : req.cookies?.token;

  if (!token) {
    res.status(401).json({ error: 'Niste prijavljeni' });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as AuthUser;
    req.authUser = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Nevalidan ili istekao token' });
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : req.cookies?.token;

  if (token) {
    try {
      req.authUser = jwt.verify(token, config.jwt.secret) as AuthUser;
    } catch {
      // Guest access
    }
  }
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      res.status(401).json({ error: 'Niste prijavljeni' });
      return;
    }
    if (!roles.includes(req.authUser.role)) {
      res.status(403).json({ error: 'Nemate dozvolu za ovu akciju' });
      return;
    }
    next();
  };
}

export async function checkNotSuspended(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.authUser) return next();

  const { isUserSuspended } = await import('../services/suspensionService');
  const suspended = await isUserSuspended(req.authUser.id);

  if (suspended) {
    res.status(403).json({ error: 'Vaš nalog je suspendovan. Kontaktirajte podršku.' });
    return;
  }
  next();
}

export function sanitizeInput(input: string): string {
  const xss = require('xss');
  return xss(input.trim());
}
