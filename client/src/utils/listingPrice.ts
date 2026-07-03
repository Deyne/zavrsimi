export function formatListingPrice(listing: {
  price?: number;
  priceNegotiable?: boolean;
  priceType?: string;
}): string {
  const type = listing.priceType || (listing.priceNegotiable ? 'negotiable' : 'fixed');
  if (type === 'inquiry') return 'Po upitu';
  if (type === 'negotiable') return 'Po dogovoru';
  if (listing.price !== undefined && listing.price !== null) {
    return `${listing.price.toLocaleString('sr-RS')} RSD`;
  }
  return 'Po dogovoru';
}

export function showListingPriceAmount(listing: { priceType?: string; priceNegotiable?: boolean; price?: number }) {
  const type = listing.priceType || (listing.priceNegotiable ? 'negotiable' : 'fixed');
  return type === 'fixed' && listing.price !== undefined;
}
