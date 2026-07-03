import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Search, Filter, SlidersHorizontal } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { ListingCard } from '../components/ui/ListingCard';
import { api } from '../services/api';
import { Listing, Category } from '@zavrsi-mi/shared';

export default function ListingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [listings, setListings] = useState<Listing[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  const [filters, setFilters] = useState({
    q: searchParams.get('q') || '',
    city: searchParams.get('city') || '',
    categoryId: searchParams.get('categoryId') || '',
    type: searchParams.get('type') || '',
    minPrice: searchParams.get('minPrice') || '',
    maxPrice: searchParams.get('maxPrice') || '',
    minRating: searchParams.get('minRating') || '',
    verified: searchParams.get('verified') === 'true',
    page: parseInt(searchParams.get('page') || '1'),
  });

  useEffect(() => {
    api.get<Category[]>('/listings/categories').then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== '' && v !== false && v !== 0) params.set(k, String(v));
    });

    api.get<{ listings: Listing[]; total: number }>(`/listings/search?${params}`)
      .then(r => { setListings(r.listings); setTotal(r.total); })
      .catch(() => setListings([]))
      .finally(() => setLoading(false));
  }, [filters]);

  const applyFilters = () => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== '' && v !== false && v !== 0 && k !== 'page') params.set(k, String(v));
    });
    setSearchParams(params);
    setFilters(f => ({ ...f, page: 1 }));
  };

  return (
    <Layout>
      <Helmet>
        <title>Oglasi - Pretraži lokalne usluge</title>
        <meta name="description" content="Pretraži oglase za lokalne usluge po gradu, kategoriji i ceni." />
      </Helmet>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Oglasi za usluge</h1>
          <p className="text-gray-500">{total} pronađenih oglasa</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Filters sidebar */}
          <aside className={`lg:w-72 shrink-0 ${showFilters ? 'block' : 'hidden lg:block'}`}>
            <div className="card p-5 sticky top-24">
              <h3 className="font-semibold flex items-center gap-2 mb-4">
                <SlidersHorizontal size={18} /> Filteri
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Pretraga</label>
                  <input className="input" placeholder="Ključne reči..." value={filters.q}
                    onChange={e => setFilters(f => ({ ...f, q: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Grad</label>
                  <input className="input" placeholder="npr. Beograd" value={filters.city}
                    onChange={e => setFilters(f => ({ ...f, city: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Kategorija</label>
                  <select className="input" value={filters.categoryId}
                    onChange={e => setFilters(f => ({ ...f, categoryId: e.target.value }))}>
                    <option value="">Sve kategorije</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Tip oglasa</label>
                  <select className="input" value={filters.type}
                    onChange={e => setFilters(f => ({ ...f, type: e.target.value }))}>
                    <option value="">Svi tipovi</option>
                    <option value="offer">Ponuda usluge</option>
                    <option value="request">Zahtev za uslugu</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Cena od</label>
                    <input className="input" type="number" value={filters.minPrice}
                      onChange={e => setFilters(f => ({ ...f, minPrice: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Cena do</label>
                    <input className="input" type="number" value={filters.maxPrice}
                      onChange={e => setFilters(f => ({ ...f, maxPrice: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Min. ocena</label>
                  <select className="input" value={filters.minRating}
                    onChange={e => setFilters(f => ({ ...f, minRating: e.target.value }))}>
                    <option value="">Bilo koja</option>
                    <option value="3">3+ zvezdice</option>
                    <option value="4">4+ zvezdice</option>
                    <option value="4.5">4.5+ zvezdice</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={filters.verified}
                    onChange={e => setFilters(f => ({ ...f, verified: e.target.checked }))}
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                  <span className="text-sm">Samo verifikovani</span>
                </label>
                <button onClick={applyFilters} className="btn-primary w-full">
                  <Search size={16} /> Primeni filtere
                </button>
              </div>
            </div>
          </aside>

          {/* Results */}
          <div className="flex-1">
            <button
              className="lg:hidden btn-secondary mb-4 w-full"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter size={16} /> {showFilters ? 'Sakrij filtere' : 'Prikaži filtere'}
            </button>

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="card animate-pulse">
                    <div className="aspect-[16/10] bg-gray-200" />
                    <div className="p-4 space-y-3">
                      <div className="h-4 bg-gray-200 rounded w-3/4" />
                      <div className="h-3 bg-gray-200 rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : listings.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                {listings.map(listing => (
                  <ListingCard key={listing.id} listing={listing} />
                ))}
              </div>
            ) : (
              <div className="text-center py-16">
                <Search size={48} className="mx-auto text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Nema rezultata</h3>
                <p className="text-gray-500">Pokušajte sa drugačijim filterima</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
