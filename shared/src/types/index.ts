export type UserRole = 'guest' | 'user' | 'provider' | 'moderator' | 'admin' | 'podrska';
export type UserReputation = 'novi_clan' | 'pouzdan_clan' | 'proveren_clan' | 'ekspert' | 'elitni_majstor' | 'aktivan_clan' | 'veteran';
export type ListingType = 'offer' | 'request' | 'sos';
export type ListingStatus = 'draft' | 'pending' | 'active' | 'paused' | 'completed' | 'rejected' | 'expired';
export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';
export type VerificationType = 'phone' | 'email' | 'user' | 'provider' | 'top_provider';
export type VerificationStatus = 'pending' | 'approved' | 'rejected';
export type AvailabilityStatus = 'free' | 'busy' | 'vacation';
export type ForumSection = 'preporuke' | 'iskustva' | 'pitanja' | 'opste';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  trade?: string;
  firstName: string;
  lastName: string;
  phone?: string;
  avatarUrl?: string;
  bio?: string;
  city?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  reputation: UserReputation;
  completedJobs: number;
  averageRating: number;
  recommendationCount: number;
  isOnline: boolean;
  emailVerified: boolean;
  phoneVerified: boolean;
  isPlatformOwner?: boolean;
  verifications?: Verification[];
  createdAt: string;
}

export interface Verification {
  id: string;
  type: VerificationType;
  status: VerificationStatus;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  icon?: string;
  subcategories?: Subcategory[];
}

export interface Subcategory {
  id: number;
  categoryId: number;
  name: string;
  slug: string;
}

export interface Listing {
  id: string;
  userId: string;
  type: ListingType;
  title: string;
  description: string;
  categoryId: number;
  subcategoryId?: number;
  category?: Category;
  city: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  price?: number;
  priceNegotiable: boolean;
  priceType?: 'fixed' | 'negotiable' | 'inquiry';
  phone?: string;
  status: ListingStatus;
  isSos: boolean;
  moderationNote?: string;
  viewCount: number;
  images: ListingImage[];
  user?: User;
  bids?: Bid[];
  publishedAt?: string;
  createdAt: string;
}

export interface ListingImage {
  id: string;
  url: string;
  sortOrder: number;
}

export interface Bid {
  id: string;
  listingId: string;
  providerId: string;
  price: number;
  description: string;
  estimatedTime?: string;
  status: OfferStatus;
  provider?: User;
  createdAt: string;
}

export interface Review {
  id: string;
  reviewerId: string;
  revieweeId: string;
  listingId?: string;
  rating: number;
  comment?: string;
  isRecommended: boolean;
  reviewer?: User;
  createdAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  type: 'text' | 'image' | 'listing_alert';
  content: string;
  imageUrl?: string;
  isRead: boolean;
  sender?: User;
  createdAt: string;
}

export interface Conversation {
  id: string;
  listingId?: string;
  participants: User[];
  lastMessage?: Message;
  unreadCount: number;
  updatedAt: string;
}

export interface ForumTopic {
  id: string;
  userId: string;
  section: ForumSection;
  title: string;
  content: string;
  isPinned: boolean;
  isLocked: boolean;
  viewCount: number;
  replyCount: number;
  user?: User;
  createdAt: string;
}

export interface SearchFilters {
  query?: string;
  city?: string;
  categoryId?: number;
  subcategoryId?: number;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  type?: ListingType;
  verified?: boolean;
  available?: boolean;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  page?: number;
  limit?: number;
}

export const REPUTATION_LABELS: Record<UserReputation, string> = {
  novi_clan: 'Novi \u010dlan',
  pouzdan_clan: 'Pouzdan \u010dlan',
  proveren_clan: 'Proveren \u010dlan',
  aktivan_clan: 'Aktivan \u010dlan',
  ekspert: 'Ekspert',
  elitni_majstor: 'Elitni majstor',
  veteran: 'Veteran',
};

export const FORUM_SECTION_LABELS: Record<ForumSection, string> = {
  preporuke: 'Preporuke',
  iskustva: 'Iskustva',
  pitanja: 'Pitanja i odgovori',
  opste: 'Opšte diskusije',
};
