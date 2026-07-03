import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export async function verifyRecaptcha(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!config.recaptcha.secretKey) {
    next();
    return;
  }

  const token = req.body.captchaToken;
  if (!token) {
    res.status(400).json({ error: 'CAPTCHA verifikacija je obavezna' });
    return;
  }

  try {
    const params = new URLSearchParams({
      secret: config.recaptcha.secretKey,
      response: token,
    });
    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      body: params,
    });
    const data = await response.json() as { success: boolean };
    if (!data.success) {
      res.status(400).json({ error: 'CAPTCHA verifikacija nije uspela' });
      return;
    }
    next();
  } catch {
    res.status(500).json({ error: 'Greška pri CAPTCHA verifikaciji' });
  }
}
