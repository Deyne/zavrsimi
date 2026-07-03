import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config';
import { query, queryOne } from '../database';
import { logActivity } from './activityLogService';
import { AuthUser } from '../middleware/auth';

interface DbUser {
  id: string;
  email: string;
  password_hash: string | null;
  google_id: string | null;
  role: string;
  trade: string | null;
  first_name: string;
  last_name: string;
  phone: string | null;
  avatar_url: string | null;
  bio: string | null;
  city: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  reputation: string;
  completed_jobs: number;
  average_rating: number;
  recommendation_count: number;
  is_online: boolean;
  email_verified: boolean;
  phone_verified: boolean;
  is_platform_owner?: boolean;
  created_at: string;
}

function mapUser(u: DbUser) {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    trade: u.trade || undefined,
    firstName: u.first_name,
    lastName: u.last_name,
    phone: u.phone,
    avatarUrl: u.avatar_url,
    bio: u.bio,
    city: u.city,
    address: u.address,
    latitude: u.latitude,
    longitude: u.longitude,
    reputation: u.reputation,
    completedJobs: u.completed_jobs,
    averageRating: parseFloat(String(u.average_rating)),
    recommendationCount: u.recommendation_count,
    isOnline: u.is_online,
    emailVerified: u.email_verified,
    phoneVerified: u.phone_verified,
    isPlatformOwner: Boolean(u.is_platform_owner),
    createdAt: u.created_at,
  };
}

export function generateTokens(user: AuthUser) {
  const accessToken = jwt.sign(user, config.jwt.secret, { expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'] });
  const refreshToken = jwt.sign({ id: user.id }, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn as jwt.SignOptions['expiresIn'],
  });
  return { accessToken, refreshToken };
}

export async function register(data: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role?: string;
  city?: string;
}) {
  const hash = await bcrypt.hash(data.password, 12);
  const role = data.role === 'provider' ? 'provider' : 'user';

  const user = await queryOne<DbUser>(
    `INSERT INTO users (email, password_hash, first_name, last_name, role, city)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [data.email.toLowerCase(), hash, data.firstName, data.lastName, role, data.city || null]
  );

  if (!user) throw new Error('Registration failed');

  const authUser: AuthUser = { id: user.id, email: user.email, role: user.role };
  const tokens = generateTokens(authUser);

  const tokenHash = crypto.createHash('sha256').update(tokens.refreshToken).digest('hex');
  await query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'30 days\')',
    [user.id, tokenHash]
  );

  return { user: mapUser(user), ...tokens };
}

export async function login(email: string, password: string) {
  const { getSuspensionLoginMessage } = await import('./suspensionService');
  const suspensionMsg = await getSuspensionLoginMessage(email);
  if (suspensionMsg) throw new Error(suspensionMsg);

  const user = await queryOne<DbUser>(
    'SELECT * FROM users WHERE email = $1',
    [email.toLowerCase()]
  );

  if (!user || !user.password_hash) throw new Error('Pogrešan email ili lozinka');

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new Error('Pogrešan email ili lozinka');

  const authUser: AuthUser = { id: user.id, email: user.email, role: user.role };
  const tokens = generateTokens(authUser);

  await logActivity(user.id, user.role, 'user_login', 'user', user.id);

  return { user: mapUser(user), ...tokens };
}

export async function getUserById(id: string) {
  const user = await queryOne<DbUser>('SELECT * FROM users WHERE id = $1', [id]);
  if (!user) return null;

  const verifications = await query(
    'SELECT id, type, status FROM verifications WHERE user_id = $1 AND status = $2',
    [id, 'approved']
  );

  return { ...mapUser(user), verifications };
}

export async function updateProfile(userId: string, data: Partial<{
  firstName: string;
  lastName: string;
  phone: string;
  bio: string;
  city: string;
  address: string;
  latitude: number;
  longitude: number;
  avatarUrl: string;
  trade: string;
}>) {
  let latUpdate: number | null | undefined;
  let lngUpdate: number | null | undefined;

  if (data.address !== undefined || data.city !== undefined) {
    const current = await queryOne<{ city: string | null; address: string | null }>(
      'SELECT city, address FROM users WHERE id = $1',
      [userId]
    );
    const cityVal = (data.city ?? current?.city ?? '').trim();
    const addressVal = (data.address ?? current?.address ?? '').trim();
    if (addressVal && cityVal) {
      const { geocodeAddress } = await import('../utils/geocode');
      const coords = await geocodeAddress(cityVal, addressVal);
      latUpdate = coords?.latitude ?? null;
      lngUpdate = coords?.longitude ?? null;
    } else {
      latUpdate = null;
      lngUpdate = null;
    }
  }

  if (latUpdate !== undefined) {
    await query(
      'UPDATE users SET latitude = $1, longitude = $2 WHERE id = $3',
      [latUpdate, lngUpdate, userId]
    );
  }

  const user = await queryOne<DbUser>(
    `UPDATE users SET
      first_name = COALESCE($2, first_name),
      last_name = COALESCE($3, last_name),
      phone = COALESCE($4, phone),
      bio = COALESCE($5, bio),
      city = COALESCE($6, city),
      address = COALESCE($7, address),
      avatar_url = COALESCE($8, avatar_url),
      trade = COALESCE($9, trade),
      updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [
      userId, data.firstName, data.lastName, data.phone, data.bio, data.city,
      data.address, data.avatarUrl, data.trade,
    ]
  );

  return user ? mapUser(user) : null;
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await queryOne<{ password_hash: string }>(
    'SELECT password_hash FROM users WHERE id = $1',
    [userId]
  );

  if (!user?.password_hash) throw new Error('Korisnik nema lozinku');

  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) throw new Error('Trenutna lozinka nije ispravna');

  const hash = await bcrypt.hash(newPassword, 12);
  await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, userId]);
}

export async function findOrCreateGoogleUser(profile: {
  googleId: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
}) {
  let user = await queryOne<DbUser>(
    'SELECT * FROM users WHERE google_id = $1 OR email = $2',
    [profile.googleId, profile.email.toLowerCase()]
  );

  if (!user) {
    user = await queryOne<DbUser>(
      `INSERT INTO users (email, google_id, first_name, last_name, avatar_url, email_verified, role)
       VALUES ($1, $2, $3, $4, $5, true, 'user') RETURNING *`,
      [profile.email.toLowerCase(), profile.googleId, profile.firstName, profile.lastName, profile.avatarUrl]
    );
  } else if (!user.google_id) {
    user = await queryOne<DbUser>(
      'UPDATE users SET google_id = $1, email_verified = true WHERE id = $2 RETURNING *',
      [profile.googleId, user.id]
    );
  }

  if (!user) throw new Error('Google auth failed');

  const authUser: AuthUser = { id: user.id, email: user.email, role: user.role };
  return { user: mapUser(user), ...generateTokens(authUser) };
}

export async function updateReputation(userId: string) {
  const stats = await queryOne<{ completed: number; avg_rating: number; activity: number }>(
    `SELECT
      u.completed_jobs as completed,
      u.average_rating as avg_rating,
      (SELECT COUNT(*) FROM listings WHERE user_id = u.id) +
      (SELECT COUNT(*) FROM forum_topics WHERE user_id = u.id) as activity
     FROM users u WHERE u.id = $1`,
    [userId]
  );

  if (!stats) return;

  let reputation = 'novi_clan';
  const completed = Number(stats.completed) || 0;
  const avgRating = Number(stats.avg_rating) || 0;

  if (completed >= 50 && avgRating >= 4.8) reputation = 'elitni_majstor';
  else if (completed >= 25 && avgRating >= 4.5) reputation = 'ekspert';
  else if (completed >= 10 && avgRating >= 4.0) reputation = 'proveren_clan';
  else if (completed >= 3 && avgRating >= 3.5) reputation = 'pouzdan_clan';

  await query('UPDATE users SET reputation = $1 WHERE id = $2', [reputation, userId]);
}

export async function getPublicProfile(userId: string, requesterId?: string) {
  const user = await queryOne<DbUser>(
    'SELECT * FROM users WHERE id = $1 AND is_suspended = false',
    [userId]
  );
  if (!user) return null;

  const verifications = await query(
    'SELECT id, type, status FROM verifications WHERE user_id = $1 AND status = $2',
    [userId, 'approved']
  );

  const profile = mapUser(user);
  const isOwner = requesterId === userId;

  return {
    ...profile,
    email: isOwner ? profile.email : undefined,
    phone: isOwner || user.phone_verified ? profile.phone : undefined,
    verifications,
  };
}

const verificationCodes = new Map<string, { code: string; expires: number }>();

function storeCode(key: string, code: string) {
  verificationCodes.set(key, { code, expires: Date.now() + 10 * 60 * 1000 });
}

function verifyCode(key: string, code: string): boolean {
  const entry = verificationCodes.get(key);
  if (!entry || entry.expires < Date.now()) return false;
  if (entry.code !== code) return false;
  verificationCodes.delete(key);
  return true;
}

export async function sendEmailVerification(userId: string) {
  const user = await queryOne<{ email: string; email_verified: boolean }>(
    'SELECT email, email_verified FROM users WHERE id = $1',
    [userId]
  );
  if (!user) throw new Error('Korisnik nije pronađen');
  if (user.email_verified) throw new Error('Email je već potvrđen');

  const code = String(Math.floor(100000 + Math.random() * 900000));
  storeCode(`email:${userId}`, code);
  console.log(`[DEV] Email verifikacioni kod za ${user.email}: ${code}`);
  return { message: 'Kod poslat na email', devCode: process.env.NODE_ENV !== 'production' ? code : undefined };
}

export async function confirmEmailVerification(userId: string, code: string) {
  if (!verifyCode(`email:${userId}`, code)) throw new Error('Neispravan ili istekao kod');
  await query('UPDATE users SET email_verified = true WHERE id = $1', [userId]);
  await query(
    `INSERT INTO verifications (user_id, type, status) VALUES ($1, 'email', 'approved')
     ON CONFLICT (user_id, type) DO UPDATE SET status = 'approved'`,
    [userId]
  );
}

export async function sendPhoneVerification(userId: string, phone: string) {
  const user = await queryOne('SELECT id FROM users WHERE id = $1', [userId]);
  if (!user) throw new Error('Korisnik nije pronađen');

  await query('UPDATE users SET phone = $1 WHERE id = $2', [phone, userId]);
  const code = String(Math.floor(100000 + Math.random() * 900000));
  storeCode(`phone:${userId}`, code);
  console.log(`[DEV] SMS kod za ${phone}: ${code}`);
  return { message: 'Kod poslat na telefon', devCode: process.env.NODE_ENV !== 'production' ? code : undefined };
}

export async function confirmPhoneVerification(userId: string, code: string) {
  if (!verifyCode(`phone:${userId}`, code)) throw new Error('Neispravan ili istekao kod');
  await query('UPDATE users SET phone_verified = true WHERE id = $1', [userId]);
  await query(
    `INSERT INTO verifications (user_id, type, status) VALUES ($1, 'phone', 'approved')
     ON CONFLICT (user_id, type) DO UPDATE SET status = 'approved'`,
    [userId]
  );
}

export async function requestPasswordReset(email: string) {
  const user = await queryOne<{ id: string; email: string; password_hash: string | null }>(
    'SELECT id, email, password_hash FROM users WHERE email = $1 AND is_suspended = false',
    [email.toLowerCase()]
  );

  if (!user || !user.password_hash) {
    return { message: 'Ako nalog postoji, poslali smo link za reset lozinke' };
  }

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  await query(
    'UPDATE password_resets SET used = true WHERE user_id = $1 AND used = false',
    [user.id]
  );
  await query(
    'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'1 hour\')',
    [user.id, tokenHash]
  );

  console.log(`[DEV] Reset lozinke za ${user.email}: http://localhost:5173/reset-lozinke?token=${token}&email=${encodeURIComponent(user.email)}`);
  return {
    message: 'Ako nalog postoji, poslali smo link za reset lozinke',
    devToken: process.env.NODE_ENV !== 'production' ? token : undefined,
  };
}

export async function resetPassword(email: string, token: string, newPassword: string) {
  const user = await queryOne<{ id: string }>(
    'SELECT id FROM users WHERE email = $1 AND is_suspended = false',
    [email.toLowerCase()]
  );
  if (!user) throw new Error('Neispravan link za reset');

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const reset = await queryOne<{ id: string }>(
    `SELECT id FROM password_resets
     WHERE user_id = $1 AND token_hash = $2 AND used = false AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [user.id, tokenHash]
  );

  if (!reset) throw new Error('Link je neispravan ili istekao');

  const hash = await bcrypt.hash(newPassword, 12);
  await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, user.id]);
  await query('UPDATE password_resets SET used = true WHERE id = $1', [reset.id]);
}
