import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  Search, MapPin, Star, Shield, Users,
  Wrench, Droplets, Zap, Paintbrush, Truck, Sparkles, ArrowRight,
  Grid3X3, TreePine, Baby, PawPrint, Monitor, BookOpen, MoreHorizontal, Home
} from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { ListingCard } from '../components/ui/ListingCard';
import { api } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { Listing, Category } from '@zavrsi-mi/shared';

const categoryIcons: Record<string, React.ReactNode> = {
  'kuca-i-stan': <Home size={24} />,
  'vodoinstalateri': <Droplets size={24} />,
  'elektricari': <Zap size={24} />,
  'moleri': <Paintbrush size={24} />,
  'keramicari': <Grid3X3 size={24} />,
  'dvoriste-i-basta': <TreePine size={24} />,
  'selidbe-i-prevoz': <Truck size={24} />,
  'ciscenje': <Sparkles size={24} />,
  'cuvanje-dece': <Baby size={24} />,
  'cuvanje-ljubimaca': <PawPrint size={24} />,
  'it-usluge': <Monitor size={24} />,
  'privatni-casovi': <BookOpen size={24} />,
  'ostalo': <MoreHorizontal size={24} />,
};

export default function HomePage() {
  const { user } = useAuthStore();
  const [listings, setListings] = useState<Listing[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCity, setSearchCity] = useState('');

  useEffect(() => {
    api.get<{ listings: Listing[] }>('/listings/search?limit=8').then(r => setListings(r.listings)).catch(() => {});
    api.get<Category[]>('/listings/categories').then(setCategories).catch(() => {});
  }, []);

  return (
    <Layout>
      <Helmet>
        <title>Završi Mi - Pronađi lokalne majstore i usluge</title>
        <meta name="description" content="Platforma za lokalne usluge. Pronađi pouzdane majstore, objavi oglas ili zatraži uslugu u tvom gradu." />
        <meta property="og:title" content="Završi Mi - Lokalne usluge" />
        <meta property="og:description" content="Pronađi pouzdane majstore u tvom gradu" />
      </Helmet>

      {/* Hero */}
      <section className="relative text-white overflow-hidden min-h-[520px] flex items-center">
        <div
          className="absolute inset-0 bg-cover bg-center scale-110"
          style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=1920&q=80)' }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-brand-800/90 via-brand-700/85 to-slate-900/90 backdrop-blur-[2px]" />
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-20 left-10 w-72 h-72 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-brand-300 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-20 md:py-28 w-full">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold leading-tight mb-6 drop-shadow-sm">
              Majstori, čuvanje dece, petsiteri i lokalne usluge — sve na jednom mestu
            </h1>
            <p className="text-lg md:text-xl text-brand-100 mb-8 leading-relaxed">
              Od vodoinstalatera i moleraja do čuvanja psa, dece ili IT pomoći u tvom gradu.
              Objavi oglas, pronađi pouzdanog čoveka ili zatraži pomoć hitno.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                window.location.href = `/oglasi?q=${searchQuery}&city=${searchCity}`;
              }}
              className="bg-white rounded-2xl p-3 shadow-2xl flex flex-col sm:flex-row gap-2"
            >
              <div className="flex-1 flex items-center gap-2 px-3">
                <Search size={20} className="text-gray-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Šta tražite? npr. vodoinstalater, moler..."
                  className="w-full py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2 px-3 sm:border-l border-gray-200">
                <MapPin size={20} className="text-gray-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Grad"
                  className="w-full sm:w-36 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none"
                  value={searchCity}
                  onChange={e => setSearchCity(e.target.value)}
                />
              </div>
              <button type="submit" className="btn-primary px-8 py-3 rounded-xl">
                Pretraži
              </button>
            </form>

            <div className="flex flex-wrap gap-4 mt-8 text-sm text-brand-100">
              <span className="flex items-center gap-1.5"><Shield size={16} /> Verifikovani majstori</span>
              <span className="flex items-center gap-1.5"><Star size={16} /> Sistem ocenjivanja</span>
              <span className="flex items-center gap-1.5"><Users size={16} /> Lokalna zajednica</span>
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">Popularne kategorije</h2>
          <p className="text-gray-500 dark:text-gray-400">Pronađi majstora za svaku potrebu</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {categories.slice(0, 12).map(cat => (
            <Link
              key={cat.id}
              to={`/oglasi?categoryId=${cat.id}`}
              className="card p-4 text-center hover:shadow-card-hover hover:border-brand-200 transition-all group"
            >
              <div className="w-12 h-12 mx-auto mb-3 bg-brand-50 rounded-xl flex items-center justify-center text-brand-600 group-hover:bg-brand-100 transition-colors">
                {categoryIcons[cat.slug] || <Wrench size={24} />}
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-brand-700 dark:group-hover:text-brand-400">{cat.name}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Latest listings */}
      <section className="bg-white dark:bg-gray-900 border-y border-gray-100 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Najnoviji oglasi</h2>
              <p className="text-gray-500 dark:text-gray-400 mt-1">Sveže objavljene usluge u tvom gradu</p>
            </div>
            <Link to="/oglasi" className="btn-secondary hidden sm:inline-flex">
              Svi oglasi <ArrowRight size={16} />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {listings.map(listing => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
          {listings.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <p>Još nema oglasa. Budite prvi koji će objaviti!</p>
              <Link to="/objavi" className="btn-primary mt-4 inline-flex">Objavi oglas</Link>
            </div>
          )}
        </div>
      </section>

      {/* CTA — samo za neprijavljene */}
      {!user && (
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
        <div className="bg-gradient-to-r from-brand-600 to-brand-700 rounded-3xl p-8 md:p-12 text-white text-center">
          <h2 className="text-3xl font-bold mb-4">Imate veštinu? Postanite majstor!</h2>
          <p className="text-brand-100 mb-8 max-w-xl mx-auto">
            Registrujte se kao pružalac usluga, gradite reputaciju i pronađite klijente u vašem gradu.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/registracija?role=provider" className="btn bg-white text-brand-700 hover:bg-brand-50">
              Postani majstor
            </Link>
            <Link to="/objavi" className="btn border-2 border-white/30 text-white hover:bg-white/10">
              Objavi oglas
            </Link>
          </div>
        </div>
      </section>
      )}
    </Layout>
  );
}
