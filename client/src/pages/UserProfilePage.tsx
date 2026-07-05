import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  MapPin, MessageCircle, Briefcase, Calendar, User as UserIcon,
  Shield, Star, Mail, Phone, CheckCircle, XCircle, Pencil,
} from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { UserBadges, StarRating } from '../components/ui/Badges';
import { ListingCard } from '../components/ui/ListingCard';
import { AvailabilityCalendar } from '../components/ui/AvailabilityCalendar';
import { useAuthStore } from '../store/authStore';
import { api } from '../services/api';
import { User, Listing } from '@zavrsi-mi/shared';
import clsx from 'clsx';

type PublicProfileTab = 'profil' | 'verifikacija' | 'dostupnost' | 'oglasi' | 'ocene';

interface PublicReview {
  id: string;
  rating: number;
  comment: string;
  listing: { id: string; title: string } | null;
  reviewer: { firstName: string; lastName: string };
  createdAt: string;
}

export default function UserProfilePage() {
  const { id } = useParams();
  const { user: currentUser } = useAuthStore();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<User | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [activeTab, setActiveTab] = useState<PublicProfileTab>('profil');

  useEffect(() => {
    if (id) {
      api.get<{ user: User; listings: Listing[]; reviews: PublicReview[] }>(`/auth/users/${id}`)
        .then(data => {
          setProfile(data.user);
          setListings(data.listings);
          setReviews(data.reviews);
        })
        .catch(() => navigate('/oglasi'));
    }
  }, [id, navigate]);

  const startChat = async () => {
    if (!currentUser || !profile) return;
    const result = await api.post<{ conversationId: string }>('/messages/start', { recipientId: profile.id });
    navigate(`/poruke/${result.conversationId}`);
  };

  if (!profile) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <div className="animate-spin w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full mx-auto" />
        </div>
      </Layout>
    );
  }

  const isOwn = currentUser?.id === profile.id;
  const canStaffEdit = !isOwn && (currentUser?.role === 'admin' || currentUser?.role === 'moderator');

  const tabs: { id: PublicProfileTab; label: string; icon: typeof UserIcon; count?: number }[] = [
    { id: 'profil', label: 'Profil', icon: UserIcon },
    { id: 'verifikacija', label: 'Verifikacija', icon: Shield },
    { id: 'dostupnost', label: 'Dostupnost', icon: Calendar },
    { id: 'oglasi', label: 'Aktivni oglasi', icon: Briefcase, count: listings.length },
    { id: 'ocene', label: 'Ocene', icon: Star, count: reviews.length },
  ];

  const verificationItems = [
    { label: 'Email', icon: Mail, done: profile.emailVerified },
    { label: 'Telefon', icon: Phone, done: profile.phoneVerified },
    { label: 'Identitet', done: profile.verifications?.some(v => v.type === 'user' && v.status === 'approved') },
    { label: 'Majstor', done: profile.verifications?.some(v => v.type === 'provider' && v.status === 'approved') },
  ];

  return (
    <Layout>
      <Helmet>
        <title>{profile.firstName} {profile.lastName}</title>
        <meta name="description" content={`Profil korisnika ${profile.firstName} ${profile.lastName} na Zavrsi Mi`} />
      </Helmet>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="card p-6 mb-6">
          <div className="flex flex-col sm:flex-row items-start gap-6">
            <div className="w-24 h-24 rounded-2xl bg-brand-100 flex items-center justify-center text-brand-700 text-3xl font-bold shrink-0 overflow-hidden">
              {profile.avatarUrl
                ? <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover" />
                : `${profile.firstName[0]}${profile.lastName[0]}`}
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold">{profile.firstName} {profile.lastName}</h1>
              {profile.city && (
                <p className="text-gray-500 flex items-center gap-1 mt-1">
                  <MapPin size={14} /> {profile.city}
                </p>
              )}
              <div className="mt-3">
                <UserBadges
                  emailVerified={profile.emailVerified}
                  phoneVerified={profile.phoneVerified}
                  verifications={profile.verifications}
                  reputation={profile.reputation}
                  role={profile.role}
                  averageRating={profile.averageRating}
                  completedJobs={profile.completedJobs}
                  size="md"
                />
              </div>
              {profile.averageRating > 0 && (
                <div className="flex items-center gap-2 mt-2">
                  <StarRating rating={profile.averageRating} size={18} />
                  <span className="text-sm text-gray-500">({profile.completedJobs} završenih poslova)</span>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              {isOwn ? (
                <Link to="/profil" className="btn-secondary text-sm">Izmeni profil</Link>
              ) : (
                <>
                  {canStaffEdit && (
                    <button
                      onClick={() => navigate('/admin', { state: { editUserId: profile.id, tab: 'users' } })}
                      className="btn-secondary text-sm flex items-center justify-center gap-1.5"
                    >
                      <Pencil size={16} /> Izmeni profil
                    </button>
                  )}
                  {currentUser && (
                    <button onClick={startChat} className="btn-primary text-sm">
                      <MessageCircle size={16} /> Pošalji poruku
                    </button>
                  )}
                </>
              )}
              {profile.phone && profile.phoneVerified && (
                <a href={`tel:${profile.phone}`} className="btn-secondary text-sm text-center">
                  {profile.phone}
                </a>
              )}
            </div>
          </div>
        </div>

        <nav className="flex flex-wrap gap-1.5 mb-6 p-1.5 bg-gray-100/80 dark:bg-gray-800/50 rounded-2xl border border-gray-200 dark:border-gray-700">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'nav-link flex-1 sm:flex-none justify-center min-w-[calc(50%-0.375rem)] sm:min-w-0',
                activeTab === tab.id ? 'nav-link-active' : 'nav-link-idle'
              )}
            >
              <tab.icon size={16} />
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className={clsx(
                  'ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold',
                  activeTab === tab.id
                    ? 'bg-brand-200/60 text-brand-800 dark:bg-brand-800/60 dark:text-brand-200'
                    : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                )}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </nav>

        {activeTab === 'profil' && (
          <div className="card p-6 animate-slide-up">
            <h2 className="font-bold flex items-center gap-2 mb-4"><UserIcon size={18} /> Profil</h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-gray-500">Grad</dt>
                <dd className="flex items-center gap-1"><MapPin size={14} /> {profile.city || '—'}</dd>
              </div>
              {profile.phone && profile.phoneVerified && (
                <div>
                  <dt className="text-gray-500">Telefon</dt>
                  <dd>{profile.phone}</dd>
                </div>
              )}
              <div>
                <dt className="text-gray-500">O meni</dt>
                <dd>{profile.bio || '—'}</dd>
              </div>
              {profile.completedJobs > 0 && (
                <div>
                  <dt className="text-gray-500">Završeni poslovi</dt>
                  <dd>{profile.completedJobs}</dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {activeTab === 'verifikacija' && (
          <div className="card p-6 animate-slide-up">
            <h2 className="font-bold flex items-center gap-2 mb-4"><Shield size={18} /> Verifikacija</h2>
            <div className="space-y-2">
              {verificationItems.map(v => (
                <div
                  key={v.label}
                  className={clsx(
                    'flex items-center justify-between p-3 rounded-xl border',
                    v.done
                      ? 'bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-800/40'
                      : 'bg-gray-50 dark:bg-gray-800/60 border-transparent dark:border-gray-700'
                  )}
                >
                  <span className="text-sm flex items-center gap-2 dark:text-gray-200">
                    {'icon' in v && v.icon && <v.icon size={14} className="text-gray-400 dark:text-gray-500" />}
                    {v.label}
                  </span>
                  {v.done ? (
                    <span className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
                      <CheckCircle size={14} /> Verifikovano
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <XCircle size={14} /> Nije verifikovano
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'dostupnost' && (
          <div className="card p-6 animate-slide-up">
            <h2 className="font-bold flex items-center gap-2 mb-4"><Calendar size={18} /> Dostupnost</h2>
            <p className="text-sm text-gray-500 mb-4 text-center">
              {isOwn
                ? 'Označite dane kada ste slobodni, zauzeti ili na godišnjem odmoru.'
                : 'Kalendar dostupnosti korisnika.'}
            </p>
            <AvailabilityCalendar userId={profile.id} editable={isOwn} compact />
          </div>
        )}

        {activeTab === 'oglasi' && (
          <div className="animate-slide-up">
            <h2 className="font-bold flex items-center gap-2 mb-4">
              <Briefcase size={18} /> Aktivni oglasi ({listings.length})
            </h2>
            {listings.length === 0 ? (
              <div className="card p-8 text-center">
                <p className="text-sm text-gray-500">Nema aktivnih oglasa</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {listings.map(l => <ListingCard key={l.id} listing={l} />)}
              </div>
            )}
          </div>
        )}

        {activeTab === 'ocene' && (
          <div className="card p-6 animate-slide-up">
            <h2 className="font-bold flex items-center gap-2 mb-4"><Star size={18} /> Ocene ({reviews.length})</h2>
            {reviews.length === 0 ? (
              <p className="text-sm text-gray-500">Još nema ocena</p>
            ) : reviews.map(r => (
              <div key={r.id} className="py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
                <StarRating rating={r.rating} size={14} />
                {r.listing && (
                  <p className="text-xs text-brand-600 dark:text-brand-400 mt-1.5">
                    Posao:{' '}
                    <Link to={`/oglas/${r.listing.id}`} className="font-medium hover:underline">
                      {r.listing.title}
                    </Link>
                  </p>
                )}
                {r.comment && <p className="text-sm mt-1 text-gray-700 dark:text-gray-300">{r.comment}</p>}
                <p className="text-xs text-gray-500 mt-1">{r.reviewer.firstName} {r.reviewer.lastName}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
