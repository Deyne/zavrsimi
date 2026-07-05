import { query, queryOne, transaction } from '../database';
import { updateReputation } from './authService';

export async function getReviewForListing(reviewerId: string, listingId: string) {
  return queryOne<{ id: string }>(
    `SELECT id FROM reviews WHERE reviewer_id = $1 AND listing_id = $2 LIMIT 1`,
    [reviewerId, listingId]
  );
}

export async function createReview(data: {
  reviewerId: string;
  revieweeId: string;
  listingId?: string;
  rating: number;
  comment?: string;
  isRecommended: boolean;
}) {
  if (data.reviewerId === data.revieweeId) {
    throw new Error('Ne možete oceniti sami sebe');
  }

  if (data.listingId) {
    const existing = await getReviewForListing(data.reviewerId, data.listingId);
    if (existing) {
      throw new Error('Već ste ocenili majstora za ovaj oglas');
    }
  }

  const review = await transaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO reviews (reviewer_id, reviewee_id, listing_id, rating, comment, is_recommended)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [data.reviewerId, data.revieweeId, data.listingId ?? null, data.rating, data.comment ?? null, data.isRecommended]
    );

    const stats = await client.query<{ avg: string; recs: string }>(
      `SELECT AVG(rating) as avg,
              SUM(CASE WHEN is_recommended THEN 1 ELSE 0 END) as recs
       FROM reviews WHERE reviewee_id = $1`,
      [data.revieweeId]
    );

    const avg = parseFloat(stats.rows[0]?.avg || '0');
    const recs = parseInt(String(stats.rows[0]?.recs || '0'), 10);

    await client.query(
      `UPDATE users SET
        average_rating = $1,
        completed_jobs = completed_jobs + 1,
        recommendation_count = $2
       WHERE id = $3`,
      [avg.toFixed(2), recs, data.revieweeId]
    );

    return inserted.rows[0];
  });

  await updateReputation(data.revieweeId);
  return review;
}

export async function getReviewsForUser(userId: string, page = 1, limit = 10) {
  const offset = (page - 1) * limit;

  const reviews = await query(
    `SELECT r.*, u.first_name, u.last_name, u.avatar_url,
            l.id as listing_id, l.title as listing_title
     FROM reviews r
     JOIN users u ON u.id = r.reviewer_id
     LEFT JOIN listings l ON l.id = r.listing_id
     WHERE r.reviewee_id = $1
     ORDER BY r.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  return reviews.map(r => ({
    id: (r as { id: string }).id,
    rating: (r as { rating: number }).rating,
    comment: (r as { comment: string }).comment,
    isRecommended: (r as { is_recommended: boolean }).is_recommended,
    createdAt: (r as { created_at: string }).created_at,
    listing: (r as { listing_id: string | null }).listing_id ? {
      id: (r as { listing_id: string }).listing_id,
      title: (r as { listing_title: string }).listing_title,
    } : null,
    reviewer: {
      firstName: (r as { first_name: string }).first_name,
      lastName: (r as { last_name: string }).last_name,
      avatarUrl: (r as { avatar_url: string }).avatar_url,
    },
  }));
}

export async function requestVerification(userId: string, type: string, documentUrl?: string) {
  return queryOne(
    `INSERT INTO verifications (user_id, type, document_url)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, type) DO UPDATE SET status = 'pending', document_url = $3
     RETURNING *`,
    [userId, type, documentUrl]
  );
}

export async function reviewVerification(verificationId: string, adminId: string, status: string, note?: string) {
  const verification = await queryOne<{ user_id: string; type: string }>(
    'UPDATE verifications SET status = $1, admin_note = $2, reviewed_by = $3, reviewed_at = NOW() WHERE id = $4 RETURNING user_id, type',
    [status, note, adminId, verificationId]
  );

  if (verification && status === 'approved') {
    if (verification.type === 'email') {
      await query('UPDATE users SET email_verified = true WHERE id = $1', [verification.user_id]);
    } else if (verification.type === 'phone') {
      await query('UPDATE users SET phone_verified = true WHERE id = $1', [verification.user_id]);
    }
  }

  await query(
    'INSERT INTO audit_logs (admin_id, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5)',
    [adminId, `verification_${status}`, 'verification', verificationId, JSON.stringify({ note })]
  );

  return verification;
}
