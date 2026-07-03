import { Helmet } from 'react-helmet-async';
import { CheckCircle, Shield, Star, Phone, Mail } from 'lucide-react';
import { REPUTATION_LABELS, UserReputation, Verification } from '@zavrsi-mi/shared';
import clsx from 'clsx';

interface UserBadgesProps {
  emailVerified?: boolean;
  phoneVerified?: boolean;
  verifications?: Verification[];
  reputation?: UserReputation;
  averageRating?: number;
  completedJobs?: number;
  size?: 'sm' | 'md';
}

export function UserBadges({
  emailVerified,
  phoneVerified,
  verifications,
  reputation,
  averageRating,
  completedJobs,
  size = 'sm',
}: UserBadgesProps) {
  const iconSize = size === 'sm' ? 12 : 14;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
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
