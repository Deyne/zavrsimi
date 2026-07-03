import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import passport from 'passport';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { config } from '../config';
import { authenticate } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimit';
import { verifyRecaptcha } from '../middleware/recaptcha';
import { runValidations } from '../middleware/validate';
import * as authService from '../services/authService';

passport.use(new JwtStrategy({
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: config.jwt.secret,
}, async (payload, done) => {
  done(null, payload);
}));

if (config.google.clientId) {
  passport.use(new GoogleStrategy({
    clientID: config.google.clientId,
    clientSecret: config.google.clientSecret,
    callbackURL: config.google.callbackUrl,
  }, async (_accessToken, _refreshToken, profile, done) => {
    try {
      const result = await authService.findOrCreateGoogleUser({
        googleId: profile.id,
        email: profile.emails?.[0]?.value || '',
        firstName: profile.name?.givenName || '',
        lastName: profile.name?.familyName || '',
        avatarUrl: profile.photos?.[0]?.value,
      });
      done(null, result);
    } catch (err) {
      done(err as Error);
    }
  }));
}

const router = Router();

router.post('/register', authLimiter, verifyRecaptcha, runValidations([
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('firstName').trim().isLength({ min: 2 }),
  body('lastName').trim().isLength({ min: 2 }),
]), async (req: Request, res: Response) => {
  try {
    const result = await authService.register(req.body);
    res.cookie('token', result.accessToken, { httpOnly: true, secure: config.env === 'production', sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.post('/login', authLimiter, runValidations([
  body('email').isEmail(),
  body('password').notEmpty(),
]), async (req: Request, res: Response) => {
  try {
    const result = await authService.login(req.body.email, req.body.password);
    res.cookie('token', result.accessToken, { httpOnly: true, secure: config.env === 'production', sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: (err as Error).message });
  }
});

router.post('/logout', (_req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Odjavljeni ste' });
});

router.post('/forgot-password', authLimiter, runValidations([
  body('email').isEmail().normalizeEmail(),
]), async (req: Request, res: Response) => {
  try {
    const result = await authService.requestPasswordReset(req.body.email);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.post('/reset-password', authLimiter, runValidations([
  body('email').isEmail().normalizeEmail(),
  body('token').notEmpty(),
  body('newPassword').isLength({ min: 8 }),
]), async (req: Request, res: Response) => {
  try {
    await authService.resetPassword(req.body.email, req.body.token, req.body.newPassword);
    res.json({ message: 'Lozinka uspešno promenjena' });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.get('/me', authenticate, async (req: Request, res: Response) => {
  const user = await authService.getUserById(req.authUser!.id);
  res.json(user);
});

router.put('/profile', authenticate, async (req: Request, res: Response) => {
  const user = await authService.updateProfile(req.authUser!.id, req.body);
  res.json(user);
});

router.put('/password', authenticate, runValidations([
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 }),
]), async (req: Request, res: Response) => {
  try {
    await authService.changePassword(req.authUser!.id, req.body.currentPassword, req.body.newPassword);
    res.json({ message: 'Lozinka promenjena' });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));
router.get('/google/callback', passport.authenticate('google', { session: false, failureRedirect: `${config.clientUrl}/prijava` }),
  (req: Request, res: Response) => {
    const result = req.user as unknown as { accessToken: string };
    res.redirect(`${config.clientUrl}/auth/callback?token=${result.accessToken}`);
  }
);

export default router;
