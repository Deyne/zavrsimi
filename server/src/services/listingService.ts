import { query, queryOne } from '../database';
import { cacheGet, cacheSet, cacheDel } from '../database/redis';
import { SearchFilters, userTradeMatchesCategory } from '@zavrsi-mi/shared';
import { logActivity } from './activityLogService';
import { notifyMatchingProvidersForSos } from './notificationService';

export function canManageListing(userId: string, userRole: string, listingUserId: string) {
  return userId === listingUserId || userRole === 'admin' || userRole === 'moderator';
}

interface DbListing {
  id: string;
  user_id: string;
  type: string;
  title: string;
  description: string;
  category_id: number;
  subcategory_id: number | null;
  city: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  price: number | null;
  price_negotiable: boolean;
  price_type?: string;
  phone: string | null;
  status: string;
  is_sos: boolean;
  moderation_note?: string | null;
  view_count: number;
  published_at: string | null;
  created_at: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
  average_rating?: number;
  category_name?: string;
  category_slug?: string;
}

function normalizePriceType(priceType?: string, priceNegotiable?: boolean): 'fixed' | 'negotiable' | 'inquiry' {
  if (priceType === 'negotiable' || priceType === 'inquiry' || priceType === 'fixed') return priceType;
  if (priceNegotiable) return 'negotiable';
  return 'fixed';
}

function mapListing(row: DbListing, images: { id: string; url: string; sort_order: number }[] = []) {
  const priceType = normalizePriceType(row.price_type, row.price_negotiable);
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    description: row.description,
    categoryId: row.category_id,
    subcategoryId: row.subcategory_id,
    city: row.city,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    price: row.price ? parseFloat(String(row.price)) : undefined,
    priceNegotiable: priceType === 'negotiable',
    priceType,
    phone: row.phone,
    status: row.status,
    isSos: row.is_sos,
    moderationNote: row.moderation_note || undefined,
    viewCount: row.view_count,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    images: images.map(i => ({ id: i.id, url: i.url, sortOrder: i.sort_order })),
    user: row.first_name ? {
      id: row.user_id,
      firstName: row.first_name,
      lastName: row.last_name,
      avatarUrl: row.avatar_url,
      averageRating: row.average_rating ? parseFloat(String(row.average_rating)) : 0,
    } : undefined,
    category: row.category_name ? {
      id: row.category_id,
      name: row.category_name,
      slug: row.category_slug,
    } : undefined,
  };
}

export async function createListing(userId: string, data: {
  type: string;
  title: string;
  description: string;
  categoryId: number;
  subcategoryId?: number;
  city: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  price?: number;
  priceNegotiable?: boolean;
  priceType?: string;
  phone?: string;
  isSos?: boolean;
  imageUrls?: string[];
}) {
  const isSos = data.isSos || data.type === 'sos';
  const status = 'pending';
  const publishedAt = null;
  const priceType = normalizePriceType(data.priceType, data.priceNegotiable);
  const listingPrice = priceType === 'fixed' ? (data.price ?? null) : null;

  const listing = await queryOne<{ id: string }>(
    `INSERT INTO listings (user_id, type, title, description, category_id, subcategory_id,
      city, address, latitude, longitude, price, price_negotiable, price_type, phone, status, is_sos, published_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     RETURNING id`,
    [userId, data.type, data.title, data.description, data.categoryId, data.subcategoryId || null,
     data.city, data.address, data.latitude, data.longitude, listingPrice,
     priceType === 'negotiable',
     priceType,
     data.phone, status, isSos, publishedAt]
  );

  if (!listing) throw new Error('Failed to create listing');

  if (data.imageUrls?.length) {
    for (let i = 0; i < Math.min(data.imageUrls.length, 10); i++) {
      await query(
        'INSERT INTO listing_images (listing_id, url, sort_order) VALUES ($1, $2, $3)',
        [listing.id, data.imageUrls[i], i]
      );
    }
  }

  await cacheDel('listings:*');
  return getListingById(listing.id);
}

export async function logListingCreated(userId: string, userRole: string, listingId: string, title: string, status: string) {
  await logActivity(userId, userRole, 'listing_created', 'listing', listingId, { title, status });
}

export async function updateListing(
  listingId: string,
  actorId: string,
  actorRole: string,
  data: {
    type?: string;
    title?: string;
    description?: string;
    categoryId?: number;
    subcategoryId?: number;
    city?: string;
    address?: string;
    price?: number;
    priceNegotiable?: boolean;
    priceType?: string;
    phone?: string;
    imageUrls?: string[];
    keepImages?: string[];
  }
) {
  const existing = await queryOne<{ user_id: string; status: string; is_sos: boolean }>(
    'SELECT user_id, status, is_sos FROM listings WHERE id = $1',
    [listingId]
  );
  if (!existing) throw new Error('Oglas nije pronađen');
  if (!canManageListing(actorId, actorRole, existing.user_id)) {
    throw new Error('Nemate dozvolu za izmenu ovog oglasa');
  }

  const isStaff = actorRole === 'admin' || actorRole === 'moderator';
  const newStatus = isStaff ? existing.status : (existing.is_sos ? 'active' : 'pending');

  let resolvedPriceType: string | undefined;
  let resolvedPrice: number | null | undefined;
  if (data.priceType !== undefined || data.priceNegotiable !== undefined || data.price !== undefined) {
    resolvedPriceType = normalizePriceType(data.priceType, data.priceNegotiable);
    resolvedPrice = resolvedPriceType === 'fixed' ? (data.price ?? null) : null;
  }

  await queryOne(
    `UPDATE listings SET
      type = COALESCE($2, type),
      title = COALESCE($3, title),
      description = COALESCE($4, description),
      category_id = COALESCE($5, category_id),
      subcategory_id = COALESCE($6, subcategory_id),
      city = COALESCE($7, city),
      address = COALESCE($8, address),
      price = CASE WHEN $14::boolean THEN $9 ELSE COALESCE($9, price) END,
      price_negotiable = CASE WHEN $14::boolean THEN $15 ELSE price_negotiable END,
      price_type = CASE WHEN $14::boolean THEN $16 ELSE price_type END,
      phone = COALESCE($10, phone),
      status = $11,
      moderation_note = CASE WHEN $12 THEN NULL ELSE moderation_note END,
      updated_at = NOW()
     WHERE id = $1 RETURNING id`,
    [
      listingId, data.type, data.title, data.description, data.categoryId,
      data.subcategoryId, data.city, data.address, resolvedPrice,
      data.phone, newStatus, !isStaff,
      resolvedPriceType !== undefined,
      resolvedPriceType === 'negotiable',
      resolvedPriceType,
    ]
  );

  if (data.keepImages !== undefined || data.imageUrls !== undefined) {
    if (data.keepImages) {
      await query('DELETE FROM listing_images WHERE listing_id = $1 AND NOT (url = ANY($2::text[]))', [listingId, data.keepImages]);
    }
    if (data.imageUrls?.length) {
      const count = await queryOne<{ c: string }>(
        'SELECT COUNT(*)::int as c FROM listing_images WHERE listing_id = $1',
        [listingId]
      );
      let start = parseInt(count?.c || '0', 10);
      for (let i = 0; i < data.imageUrls.length && start + i < 10; i++) {
        await query(
          'INSERT INTO listing_images (listing_id, url, sort_order) VALUES ($1, $2, $3)',
          [listingId, data.imageUrls[i], start + i]
        );
      }
    }
  }

  await logActivity(actorId, actorRole, 'listing_updated', 'listing', listingId, {
    title: data.title,
    reReview: !isStaff,
  });
  await cacheDel('listings:*');
  return getListingById(listingId);
}

export async function deleteListing(listingId: string, actorId: string, actorRole: string) {
  const existing = await queryOne<{ user_id: string; title: string }>(
    'SELECT user_id, title FROM listings WHERE id = $1',
    [listingId]
  );
  if (!existing) throw new Error('Oglas nije pronađen');
  if (!canManageListing(actorId, actorRole, existing.user_id)) {
    throw new Error('Nemate dozvolu za brisanje ovog oglasa');
  }

  await query('DELETE FROM listings WHERE id = $1', [listingId]);
  await logActivity(actorId, actorRole, 'listing_deleted', 'listing', listingId, { title: existing.title });
  await cacheDel('listings:*');
}

export async function getListingById(id: string) {
  const row = await queryOne<DbListing>(
    `SELECT l.*, u.first_name, u.last_name, u.avatar_url, u.average_rating,
            c.name as category_name, c.slug as category_slug
     FROM listings l
     JOIN users u ON u.id = l.user_id
     JOIN categories c ON c.id = l.category_id
     WHERE l.id = $1`,
    [id]
  );

  if (!row) return null;

  const images = await query<{ id: string; url: string; sort_order: number }>(
    'SELECT id, url, sort_order FROM listing_images WHERE listing_id = $1 ORDER BY sort_order',
    [id]
  );

  return mapListing(row, images);
}

export async function searchListings(filters: SearchFilters): Promise<{ listings: ReturnType<typeof mapListing>[]; total: number; page: number; totalPages: number }> {
  const cacheKey = `listings:${JSON.stringify(filters)}`;
  const cached = await cacheGet<{ listings: ReturnType<typeof mapListing>[]; total: number; page: number; totalPages: number }>(cacheKey);
  if (cached) return cached;

  const conditions: string[] = ["l.status = 'active'"];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (filters.query) {
    conditions.push(`(l.title ILIKE $${paramIdx} OR l.description ILIKE $${paramIdx})`);
    params.push(`%${filters.query}%`);
    paramIdx++;
  }
  if (filters.city) {
    conditions.push(`l.city ILIKE $${paramIdx}`);
    params.push(`%${filters.city}%`);
    paramIdx++;
  }
  if (filters.categoryId) {
    conditions.push(`l.category_id = $${paramIdx}`);
    params.push(filters.categoryId);
    paramIdx++;
  }
  if (filters.subcategoryId) {
    conditions.push(`l.subcategory_id = $${paramIdx}`);
    params.push(filters.subcategoryId);
    paramIdx++;
  }
  if (filters.type) {
    conditions.push(`l.type = $${paramIdx}`);
    params.push(filters.type);
    paramIdx++;
  }
  if (filters.minPrice) {
    conditions.push(`l.price >= $${paramIdx}`);
    params.push(filters.minPrice);
    paramIdx++;
  }
  if (filters.maxPrice) {
    conditions.push(`l.price <= $${paramIdx}`);
    params.push(filters.maxPrice);
    paramIdx++;
  }
  if (filters.minRating) {
    conditions.push(`u.average_rating >= $${paramIdx}`);
    params.push(filters.minRating);
    paramIdx++;
  }
  if (filters.verified) {
    conditions.push(`EXISTS (SELECT 1 FROM verifications v WHERE v.user_id = u.id AND v.status = 'approved')`);
  }

  let distanceSelect = '';
  if (filters.latitude && filters.longitude) {
    distanceSelect = `, (6371 * acos(cos(radians($${paramIdx})) * cos(radians(l.latitude)) *
      cos(radians(l.longitude) - radians($${paramIdx + 1})) +
      sin(radians($${paramIdx})) * sin(radians(l.latitude)))) AS distance`;
    params.push(filters.latitude, filters.longitude);
    paramIdx += 2;

    if (filters.radiusKm) {
      conditions.push(`(6371 * acos(cos(radians($${paramIdx - 2})) * cos(radians(l.latitude)) *
        cos(radians(l.longitude) - radians($${paramIdx - 1})) +
        sin(radians($${paramIdx - 2})) * sin(radians(l.latitude)))) <= $${paramIdx}`);
      params.push(filters.radiusKm);
      paramIdx++;
    }
  }

  const page = filters.page || 1;
  const limit = Math.min(filters.limit || 20, 50);
  const offset = (page - 1) * limit;

  const orderBy = filters.latitude
    ? 'distance ASC, l.is_sos DESC, l.created_at DESC'
    : 'l.is_sos DESC, l.created_at DESC';

  const countResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM listings l JOIN users u ON u.id = l.user_id WHERE ${conditions.join(' AND ')}`,
    params.slice(0, paramIdx - (filters.radiusKm ? 1 : 0) - (filters.latitude ? 2 : 0))
  );

  const rows = await query<DbListing & { distance?: number }>(
    `SELECT l.*, u.first_name, u.last_name, u.avatar_url, u.average_rating,
            c.name as category_name, c.slug as category_slug ${distanceSelect}
     FROM listings l
     JOIN users u ON u.id = l.user_id
     JOIN categories c ON c.id = l.category_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY ${orderBy}
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...params, limit, offset]
  );

  const listings = await Promise.all(rows.map(async (row) => {
    const images = await query<{ id: string; url: string; sort_order: number }>(
      'SELECT id, url, sort_order FROM listing_images WHERE listing_id = $1 ORDER BY sort_order LIMIT 1',
      [row.id]
    );
    return mapListing(row, images);
  }));

  const result = {
    listings,
    total: parseInt(countResult?.count || '0'),
    page,
    totalPages: Math.ceil(parseInt(countResult?.count || '0') / limit),
  };

  await cacheSet(cacheKey, result, 120);
  return result;
}

export async function getPendingListingCount(userId: string) {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM listings WHERE user_id = $1 AND status = 'pending'`,
    [userId]
  );
  return parseInt(row?.count || '0', 10);
}

export async function incrementViewCount(id: string) {
  await query('UPDATE listings SET view_count = view_count + 1 WHERE id = $1', [id]);
}

export async function updateListingStatus(
  id: string,
  status: string,
  actorId: string,
  note?: string,
  actorRole = 'admin'
) {
  if ((status === 'rejected') && !note?.trim()) {
    throw new Error('Obrazloženje je obavezno pri odbijanju oglasa');
  }

  if (status === 'active') {
    await query(
      `UPDATE listings SET status = $1, published_at = COALESCE(published_at, NOW()),
       moderation_note = $2, moderated_by = $3, moderated_at = NOW(), updated_at = NOW()
       WHERE id = $4`,
      [status, note || null, actorId, id]
    );
  } else {
    await query(
      `UPDATE listings SET status = $1, moderation_note = $2, moderated_by = $3,
       moderated_at = NOW(), updated_at = NOW() WHERE id = $4`,
      [status, note || null, actorId, id]
    );
  }

  await logActivity(actorId, actorRole, `listing_${status}`, 'listing', id, { note });
  await cacheDel('listings:*');

  if (status === 'active') {
    const listing = await queryOne<{ is_sos: boolean; category_id: number; title: string; city: string }>(
      'SELECT is_sos, category_id, title, city FROM listings WHERE id = $1',
      [id]
    );
    if (listing?.is_sos) {
      notifyMatchingProvidersForSos(id, listing.category_id, listing.title, listing.city).catch(err => {
        console.warn('SOS obaveštenja:', (err as Error).message);
      });
    }
  }
}

export async function createBid(listingId: string, providerId: string, data: {
  price: number;
  description: string;
  estimatedTime?: string;
}) {
  const listing = await queryOne<{ user_id: string; type: string; status: string; category_id: number; is_sos: boolean }>(
    'SELECT user_id, type, status, category_id, is_sos FROM listings WHERE id = $1',
    [listingId]
  );

  if (!listing) throw new Error('Oglas nije pronađen');
  if (listing.user_id === providerId) throw new Error('Ne možete poslati ponudu na sopstveni oglas');
  if (listing.status !== 'active') throw new Error('Ponude su moguće samo na aktivnim oglasima');
  if (!listing.type || (listing.type !== 'request' && listing.type !== 'sos' && !listing.is_sos)) {
    throw new Error('Ponude su moguće samo na oglasima tipa „Tražim uslugu” ili hitnim oglasima');
  }

  const provider = await queryOne<{ trade: string | null; role: string }>(
    'SELECT trade, role FROM users WHERE id = $1',
    [providerId]
  );
  if (!provider) throw new Error('Korisnik nije pronađen');

  if (!userTradeMatchesCategory(provider.trade || undefined, listing.category_id)) {
    throw new Error('Vaše zanimanje ne odgovara kategoriji ovog oglasa');
  }

  const existing = await queryOne(
    'SELECT id FROM bids WHERE listing_id = $1 AND provider_id = $2',
    [listingId, providerId]
  );
  if (existing) throw new Error('Već ste poslali ponudu za ovaj oglas');

  const bid = await queryOne(
    `INSERT INTO bids (listing_id, provider_id, price, description, estimated_time)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [listingId, providerId, data.price, data.description, data.estimatedTime]
  );
  return bid;
}

export async function acceptBid(bidId: string, userId: string) {
  const bid = await queryOne<{ listing_id: string; provider_id: string }>(
    'SELECT b.listing_id, b.provider_id FROM bids b JOIN listings l ON l.id = b.listing_id WHERE b.id = $1 AND l.user_id = $2',
    [bidId, userId]
  );

  if (!bid) throw new Error('Ponuda nije pronađena');

  await query('UPDATE bids SET status = $1 WHERE listing_id = $2 AND id != $3', ['rejected', bid.listing_id, bidId]);
  await query('UPDATE bids SET status = $1 WHERE id = $2', ['accepted', bidId]);
  await query('UPDATE listings SET status = $1 WHERE id = $2', ['completed', bid.listing_id]);

  return bid;
}

export async function getBidsForListing(listingId: string) {
  const rows = await query(
    `SELECT b.*, u.first_name, u.last_name, u.avatar_url, u.average_rating, u.completed_jobs, u.reputation
     FROM bids b
     JOIN users u ON u.id = b.provider_id
     WHERE b.listing_id = $1
     ORDER BY b.created_at DESC`,
    [listingId]
  );

  return rows.map(r => ({
    id: (r as { id: string }).id,
    listingId: (r as { listing_id: string }).listing_id,
    providerId: (r as { provider_id: string }).provider_id,
    price: parseFloat(String((r as { price: number }).price)),
    description: (r as { description: string }).description,
    estimatedTime: (r as { estimated_time: string }).estimated_time,
    status: (r as { status: string }).status,
    createdAt: (r as { created_at: string }).created_at,
    provider: {
      id: (r as { provider_id: string }).provider_id,
      firstName: (r as { first_name: string }).first_name,
      lastName: (r as { last_name: string }).last_name,
      avatarUrl: (r as { avatar_url: string }).avatar_url,
      averageRating: parseFloat(String((r as { average_rating: number }).average_rating || 0)),
      completedJobs: (r as { completed_jobs: number }).completed_jobs,
      reputation: (r as { reputation: string }).reputation,
    },
  }));
}

export async function getUserListings(userId: string, limit = 10, includeAll = false) {
  const rows = await query<DbListing>(
    `SELECT l.*, c.name as category_name, c.slug as category_slug
     FROM listings l
     JOIN categories c ON c.id = l.category_id
     WHERE l.user_id = $1 ${includeAll ? '' : "AND l.status = 'active'"}
     ORDER BY l.created_at DESC LIMIT $2`,
    [userId, limit]
  );

  return Promise.all(rows.map(async (row) => {
    const images = await query<{ id: string; url: string; sort_order: number }>(
      'SELECT id, url, sort_order FROM listing_images WHERE listing_id = $1 ORDER BY sort_order LIMIT 1',
      [row.id]
    );
    return mapListing(row, images);
  }));
}

export async function getCategories() {
  const cached = await cacheGet('categories');
  if (cached) return cached;

  const categories = await query(
    'SELECT id, name, slug, icon FROM categories WHERE is_active = true ORDER BY sort_order'
  );

  for (const cat of categories as Array<{ id: number; subcategories?: unknown }>) {
    const subs = await query(
      'SELECT id, category_id, name, slug FROM subcategories WHERE category_id = $1 AND is_active = true ORDER BY sort_order',
      [cat.id]
    );
    cat.subcategories = subs;
  }

  await cacheSet('categories', categories, 3600);
  return categories;
}
