import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { MapPin, MessageCircle } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { api } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { REPUTATION_LABELS, UserReputation, TRADES, TRADE_LABELS } from '@zavrsi-mi/shared';
import { StarRating } from '../components/ui/Badges';

interface ProviderListing {
  id: string;
  title: string;
  price: number | null;
  price_type: string;
  city: string;
  image_url: string | null;
  created_at: string;
}

interface DirectoryProvider {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  city: string;
  trade: string;
  average_rating: number;
  completed_jobs: number;
  reputation: UserReputation;
  bio: string | null;
  listings: ProviderListing[];
}

function ProviderCard({
  provider,
  onMessage,
}: {
  provider: DirectoryProvider;
  onMessage: (id: string) => void;
}) {
  return (
    <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/60 hover:bg-brand-50/70 dark:hover:bg-brand-900/20 transition-colors flex gap-4">
      <Link to={`/korisnik/${provider.id}`} className="flex gap-4 flex-1 min-w-0">
        <div className="w-14 h-14 rounded-full bg-brand-100 dark:bg-brand-900 flex items-center justify-center overflow-hidden shrink-0 text-brand-700 font-semibold text-lg">
          {provider.avatar_url
            ? <img src={provider.avatar_url} alt="" className="w-full h-full object-cover" />
            : <>{provider.first_name[0]}{provider.last_name[0]}</>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold dark:text-white">{provider.first_name} {provider.last_name}</div>
          <div className="text-sm text-muted flex items-center gap-1 mt-0.5">
            <MapPin size={13} /> {provider.city}
          </div>
          <div className="text-xs text-brand-600 mt-1">{REPUTATION_LABELS[provider.reputation]}</div>
          {provider.average_rating > 0 && (
            <div className="flex items-center gap-2 text-sm mt-2">
              <StarRating rating={Number(provider.average_rating)} size={14} />
              <span className="text-muted">{parseFloat(String(provider.average_rating)).toFixed(1)} · {provider.completed_jobs} poslova</span>
            </div>
          )}
          {provider.bio && (
            <p className="text-sm text-body mt-2 line-clamp-2">{provider.bio}</p>
          )}
          {provider.listings.length > 0 && (
            <p className="text-xs text-muted mt-2">{provider.listings.length} aktivnih oglasa</p>
          )}
        </div>
      </Link>
      <button onClick={() => onMessage(provider.id)} className="btn-primary text-sm self-start shrink-0">
        <MessageCircle size={14} /> Poruka
      </button>
    </div>
  );
}

export default function MapPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [city, setCity] = useState('');
  const [trade, setTrade] = useState('');
  const [providers, setProviders] = useState<DirectoryProvider[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!trade) {
      setProviders([]);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams({ trade });
    if (city) params.set('city', city);
    api.get<DirectoryProvider[]>(`/forum/providers?${params}`)
      .then(setProviders)
      .catch(() => setProviders([]))
      .finally(() => setLoading(false));
  }, [trade, city]);

  const startChat = async (providerId: string) => {
    if (!user) { navigate('/prijava'); return; }
    const result = await api.post<{ conversationId: string }>('/messages/start', { recipientId: providerId });
    navigate(`/poruke/${result.conversationId}`);
  };

  return (
    <Layout>
      <Helmet>
        <title>Pronađi majstora</title>
        <meta name="description" content="Pretraži majstore po zanimanju, ocenama i oglasima." />
      </Helmet>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-heading">Pronađi majstora</h1>
          <p className="text-muted mt-1">Izaberite zanimanje i pregledajte majstore, ocene i njihove oglase</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <aside className="lg:col-span-4 space-y-4">
            <div className="card p-5">
              <label className="text-sm font-medium text-body mb-2 block">Zanimanje *</label>
              <div className="flex flex-wrap gap-2">
                {TRADES.map(t => (
                  <button key={t.value} type="button"
                    onClick={() => setTrade(t.value)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${trade === t.value ? 'bg-brand-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="card p-5">
              <label className="text-sm font-medium text-body mb-2 block">Grad (opciono)</label>
              <div className="flex items-center gap-2">
                <MapPin size={16} className="text-gray-400 shrink-0" />
                <input className="input" placeholder="npr. Beograd" value={city}
                  onChange={e => setCity(e.target.value)} disabled={!trade} />
              </div>
            </div>
          </aside>

          <section className="lg:col-span-8 space-y-6">
            {!trade ? (
              <div className="card p-8 text-center text-muted text-sm">Izaberite zanimanje da vidite majstore</div>
            ) : loading ? (
              <div className="card p-8 text-center text-muted text-sm">Učitavanje...</div>
            ) : (
              <div className="card p-5">
                <div className="text-sm font-medium text-body mb-4">
                  {providers.length} majstora — {TRADE_LABELS[trade] || trade}
                </div>
                <div className="space-y-3">
                  {providers.map(p => (
                    <ProviderCard key={p.id} provider={p} onMessage={startChat} />
                  ))}
                  {providers.length === 0 && (
                    <p className="text-sm text-muted text-center py-8">Nema majstora za izabrane filtere</p>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </Layout>
  );
}
