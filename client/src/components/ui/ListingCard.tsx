import { Link } from 'react-router-dom';
import { MapPin, Clock, AlertTriangle } from 'lucide-react';
import { Listing } from '@zavrsi-mi/shared';
import { formatListingPrice, showListingPriceAmount } from '../../utils/listingPrice';
import { StarRating } from './Badges';
import { formatDistanceToNow } from 'date-fns';
import { sr } from 'date-fns/locale';

interface ListingCardProps {
  listing: Listing;
}

export function ListingCard({ listing }: ListingCardProps) {
  const imageUrl = listing.images[0]?.url || '/placeholder-service.jpg';
  const typeLabel = listing.type === 'offer' ? 'Ponuda' : listing.type === 'request' ? 'Zahtev' : 'HITNO';

  return (
    <Link to={`/oglas/${listing.id}`} className="card group hover:shadow-card-hover transition-all duration-300">
      <div className="relative aspect-[16/10] overflow-hidden bg-gray-100">
        <img
          src={imageUrl}
          alt={listing.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          onError={(e) => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=400'; }}
        />
        <div className="absolute top-3 left-3 flex gap-2">
          {listing.isSos && (
            <span className="badge-sos">
              <AlertTriangle size={12} /> SOS
            </span>
          )}
          <span className={`badge ${listing.type === 'request' ? 'bg-purple-50 text-purple-700' : listing.type === 'sos' ? 'bg-red-50 text-red-700' : 'bg-brand-50 text-brand-700'}`}>
            {typeLabel}
          </span>
        </div>
        {(showListingPriceAmount(listing) || listing.priceType === 'negotiable' || listing.priceType === 'inquiry' || listing.priceNegotiable) && (
          <div className="absolute bottom-3 right-3 bg-white/95 backdrop-blur px-3 py-1 rounded-lg font-bold text-brand-700 shadow-sm">
            {formatListingPrice(listing)}
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="text-xs text-brand-600 font-medium mb-1">{listing.category?.name}</div>
        <h3 className="font-semibold text-gray-900 line-clamp-2 group-hover:text-brand-600 transition-colors mb-2">
          {listing.title}
        </h3>
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <span className="flex items-center gap-1">
            <MapPin size={14} /> {listing.city}
          </span>
          <span className="flex items-center gap-1">
            <Clock size={14} />
            {formatDistanceToNow(new Date(listing.createdAt), { addSuffix: true, locale: sr })}
          </span>
        </div>
        {listing.user && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
            <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-medium text-sm">
              {listing.user.firstName?.[0]}{listing.user.lastName?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {listing.user.firstName} {listing.user.lastName}
              </div>
              {listing.user.averageRating > 0 && (
                <StarRating rating={listing.user.averageRating} size={12} />
              )}
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}
