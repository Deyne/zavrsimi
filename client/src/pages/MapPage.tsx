import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { MapPin, Star, MessageCircle, ExternalLink, Briefcase, ChevronLeft } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { api } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { REPUTATION_LABELS, UserReputation, TRADES, TRADE_LABELS } from '@zavrsi-mi/shared';
import { StarRating } from '../components/ui/Badges';
import { formatListingPrice } from '../utils/listingPrice';

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

export default function MapPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [city, setCity] = useState('');
  const [trade, setTrade] = useState('');
  const [providers, setProviders] = useState<DirectoryProvider[]>([]);
  const [selected, setSelected] = useState<DirectoryProvider | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!trade) {
      setProviders([]);
      setSelected(null);
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
                    onClick={() => { setTrade(t.value); setSelected(null); }}
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

            {!trade ? (
              <div className="card p-6 text-center text-muted text-sm">Izaberite zanimanje da vidite majstore</div>
            ) : loading ? (
              <div className="card p-6 text-center text-muted text-sm">Učitavanje...</div>
            ) : (
              <div className="card p-4">
                <div className="text-sm font-medium text-body mb-3">
                  {providers.length} majstora — {TRADE_LABELS[trade] || trade}
                </div>
                <div className="space-y-2 max-h-[520px] overflow-y-auto">
                  {providers.map(p => (
                    <button key={p.id} type="button"
                      onClick={() => setSelected(p)}
                      className={`w-full text-left p-3 rounded-xl transition-colors flex gap-3 ${selected?.id === p.id ? 'bg-brand-50 dark:bg-brand-900/30 ring-2 ring-brand-400' : 'bg-gray-50 dark:bg-gray-800/60 hover:bg-brand-50/70 dark:hover:bg-brand-900/20'}`}
                    >
                      <div className="w-11 h-11 rounded-full bg-brand-100 dark:bg-brand-900 flex items-center justify-center overflow-hidden shrink-0 text-brand-700 font-semibold">
                        {p.avatar_url
                          ? <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                          : <>{p.first_name[0]}{p.last_name[0]}</>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm dark:text-white truncate">{p.first_name} {p.last_name}</div>
                        <div className="text-xs text-muted">{p.city}</div>
                        {p.average_rating > 0 && (
                          <div className="flex items-center gap-1 text-xs mt-1">
                            <Star size={12} className="fill-yellow-400 text-yellow-400" />
                            {parseFloat(String(p.average_rating)).toFixed(1)} · {p.completed_jobs} poslova
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                  {providers.length === 0 && (
                    <p className="text-sm text-muted text-center py-6">Nema majstora za izabrane filtere</p>
                  )}
                </div>
              </div>
            )}
          </aside>

          <section className="lg:col-span-8">
            {!selected ? (
              <div className="card p-12 text-center text-muted min-h-[420px] flex flex-col items-center justify-center">
                <Briefcase size={48} className="mb-4 opacity-40" />
                <p>Izaberite majstora sa liste da vidite profil, ocene i oglase</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="card p-6">
                  <button onClick={() => setSelected(null)} className="text-sm text-brand-600 hover:underline flex items-center gap-1 mb-4 lg:hidden">
                    <ChevronLeft size={16} /> Nazad na listu
                  </button>
                  <div className="flex flex-col sm:flex-row gap-5">
                    <div className="w-24 h-24 rounded-2xl bg-brand-100 dark:bg-brand-900 flex items-center justify-center overflow-hidden shrink-0 text-2xl text-brand-700 font-bold">
                      {selected.avatar_url
                        ? <img src={selected.avatar_url} alt="" className="w-full h-full object-cover" />
                        : <>{selected.first_name[0]}{selected.last_name[0]}</>}
                    </div>
                    <div className="flex-1">
                      <h2 className="text-2xl font-bold dark:text-white">{selected.first_name} {selected.last_name}</h2>
                      <p className="text-brand-600 font-medium">{TRADE_LABELS[selected.trade] || selected.trade}</p>
                      <p className="text-muted text-sm mt-1 flex items-center gap-1"><MapPin size={14} /> {selected.city}</p>
                      <p className="text-xs text-brand-600 mt-1">{REPUTATION_LABELS[selected.reputation]}</p>
                      {selected.average_rating > 0 && (
                        <div className="mt-3 flex items-center gap-3">
                          <StarRating rating={Number(selected.average_rating)} size={16} />
                          <span className="text-sm text-muted">{selected.completed_jobs} završenih poslova</span>
                        </div>
                      )}
                      {selected.bio && <p className="text-sm text-body mt-4 whitespace-pre-wrap">{selected.bio}</p>}
                      <div className="flex flex-wrap gap-2 mt-5">
                        <Link to={`/korisnik/${selected.id}`} className="btn-secondary text-sm">
                          <ExternalLink size={14} /> Pogledaj profil
                        </Link>
                        <button onClick={() => startChat(selected.id)} className="btn-primary text-sm">
                          <MessageCircle size={14} /> Pošalji poruku
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="card p-6">
                  <h3 className="font-bold text-lg dark:text-white mb-4">Aktivni oglasi ({selected.listings.length})</h3>
                  {selected.listings.length === 0 ? (
                    <p className="text-muted text-sm">Ovaj majstor trenutno nema aktivnih oglasa.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {selected.listings.map(l => (
                        <Link key={l.id} to={`/oglas/${l.id}`}
                          className="flex gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-800 hover:border-brand-300 dark:hover:border-brand-700 transition-colors"
                        >
                          <div className="w-20 h-16 rounded-lg bg-gray-100 dark:bg-gray-800 overflow-hidden shrink-0">
                            {l.image_url
                              ? <img src={l.image_url} alt="" className="w-full h-full object-cover" />
                              : <div className="w-full h-full flex items-center justify-center text-xs text-muted">Nema slike</div>}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-sm dark:text-white line-clamp-2">{l.title}</div>
                            <div className="text-xs text-muted mt-1">{l.city}</div>
                            <div className="text-sm font-semibold text-brand-600 mt-1">
                              {formatListingPrice({ price: l.price ?? undefined, priceType: l.price_type })}
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
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
