import { Request, Response, NextFunction } from 'express';

interface PgError extends Error {
  code?: string;
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  const pgErr = err as PgError;
  console.error('Error:', err.message, err.stack?.split('\n')[1] || '');

  if (res.headersSent) return;

  if (pgErr.code === '23505' || err.message.includes('duplicate key')) {
    res.status(409).json({ error: err.message.includes('reviews') ? 'Već ste ocenili majstora za ovaj oglas' : 'Resurs već postoji' });
    return;
  }

  if (err.message === 'Već ste ocenili majstora za ovaj oglas' || err.message === 'Ne možete oceniti sami sebe') {
    res.status(409).json({ error: err.message });
    return;
  }

  if (err.message.includes('foreign key')) {
    res.status(400).json({ error: 'Nevalidna kategorija ili podkategorija' });
    return;
  }

  if (err.message.includes('ECONNREFUSED') || err.message.includes('connect')) {
    res.status(503).json({ error: 'Baza podataka nije dostupna. Proverite Docker.' });
    return;
  }

  res.status(500).json({ error: err.message || 'Interna greška servera' });
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Ruta nije pronađena' });
}
