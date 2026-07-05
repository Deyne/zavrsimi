import { Helmet } from 'react-helmet-async';
import { CheckCircle, Shield, ShieldCheck, Star, Phone, Mail, Headphones, type LucideIcon } from 'lucide-react';
import { REPUTATION_LABELS, UserReputation, Verification } from '@zavrsi-mi/shared';
import clsx from 'clsx';

const STAFF_ROLES = ['admin', 'moderator', 'podrska'] as const;
type StaffRole = typeof STAFF_ROLES[number];

const ROLE_BADGE_CONFIG: Record<StaffRole, { label: string; Icon: LucideIcon; className: string }> = {
  admin: {
    label: 'Administrator',
    Icon: Shield,
    className: 'bg-red-500/10 text-red-700 border-red-400/30 shadow-[0_0_10px_rgba(239,68,68,0.2)] dark:bg-red-500/15 dark:text-red-300 dark:border-red-400/35 dark:shadow-[0_0_14px_rgba(239,68,68,0.28)]',
  },
  moderator: {
    label: 'Moderator',
    Icon: ShieldCheck,
    className: 'bg-emerald-500/10 text-emerald-700 border-emerald-400/30 shadow-[0_0_10px_rgba(16,185,129,0.2)] dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-400/35 dark:shadow-[0_0_14px_rgba(16,185,129,0.28)]',
  },
  podrska: {
    label: 'Podr\u0161ka',
    Icon: Headphones,
    className: 'bg-amber-500/10 text-amber-800 border-amber-400/30 shadow-[0_0_10px_rgba(245,158,11,0.2)] dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-400/35 dark:shadow-[0_0_14px_rgba(245,158,11,0.28)]',
  },
};

export function RoleBadge({ role, size = 'sm' }: { role?: string | null; size?: 'sm' | 'md' }) {
  if (!role || !STAFF_ROLES.includes(role as StaffRole)) return null;
  const cfg = ROLE_BADGE_CONFIG[role as StaffRole];
  const iconSize = size === 'sm' ? 11 : 13;
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 rounded-full font-semibold border',
      size === 'md' ? 'text-xs px-2.5 py-1' : 'text-[10px] px-2 py-0.5',
      cfg.className
    )}>
      <cfg.Icon size={iconSize} />
      {cfg.label}
    </span>
  );
}

interface UserBadgesProps {
  emailVerified?: boolean;
  phoneVerified?: boolean;
  verifications?: Verification[];
  reputation?: UserReputation;
  role?: string | null;
  averageRating?: number;
  completedJobs?: number;
  size?: 'sm' | 'md';
}

export function UserBadges({
  emailVerified,
  phoneVerified,
  verifications,
  reputation,
  role,
  averageRating,
  completedJobs,
  size = 'sm',
}: UserBadgesProps) {
  const iconSize = size === 'sm' ? 12 : 14;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <RoleBadge role={role} size={size} />
      {emailVerified && (
        <span className="badge-verified" title="Potvrđen email">
          <Mail size={iconSize} /> Email
        </span>
      )}
      {phoneVerified && (
        <span className="badge-verified" title="Potvrđen telefon">
          <Phone size={iconSize} /> Telefon
        </span>
      )}
      {verifications?.some(v => v.type === 'provider' && v.status === 'approved') && (
        <span className="badge-verified" title="Verifikovan majstor">
          <Shield size={iconSize} /> Majstor
        </span>
      )}
      {verifications?.some(v => v.type === 'top_provider' && v.status === 'approved') && (
        <span className="badge bg-amber-50 text-amber-700" title="Top pružalac">
          <Star size={iconSize} /> Top
        </span>
      )}
      {reputation && reputation !== 'novi_clan' && (
        <span className="badge-reputation">
          <CheckCircle size={iconSize} /> {REPUTATION_LABELS[reputation]}
        </span>
      )}
      {averageRating !== undefined && averageRating > 0 && (
        <span className="badge bg-yellow-50 text-yellow-700">
          <Star size={iconSize} className="fill-yellow-400 text-yellow-400" />
          {averageRating.toFixed(1)}
        </span>
      )}
      {completedJobs !== undefined && completedJobs > 0 && (
        <span className="badge bg-gray-100 text-gray-600">{completedJobs} poslova</span>
      )}
    </div>
  );
}

interface StarRatingProps {
  rating: number;
  max?: number;
  size?: number;
  interactive?: boolean;
  onChange?: (rating: number) => void;
}

export function StarRating({ rating, max = 5, size = 16, interactive, onChange }: StarRatingProps) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <button
          key={i}
          type="button"
          disabled={!interactive}
          onClick={() => onChange?.(i + 1)}
          className={clsx(interactive && 'cursor-pointer hover:scale-110 transition-transform')}
        >
          <Star
            size={size}
            className={clsx(
              i < Math.round(rating)
                ? 'fill-yellow-400 text-yellow-400'
                : 'text-gray-300'
            )}
          />
        </button>
      ))}
    </div>
  );
}

export function SEOHead({
  title,
  description,
  image,
  url,
}: {
  title: string;
  description: string;
  image?: string;
  url?: string;
}) {
  return (
    <Helmet>
      <title>{title} | Završi Mi</title>
      <meta name="description" content={description} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      {image && <meta property="og:image" content={image} />}
      {url && <link rel="canonical" href={url} />}
    </Helmet>
  );
}
