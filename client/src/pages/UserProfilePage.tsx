import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { MapPin, MessageCircle, Briefcase, Calendar } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { UserBadges, StarRating } from '../components/ui/Badges';
import { ListingCard } from '../components/ui/ListingCard';
import { AvailabilityCalendar } from '../components/ui/AvailabilityCalendar';
import { useAuthStore } from '../store/authStore';
import { api } from '../services/api';
import { User, Listing, REPUTATION_LABELS, UserReputation } from '@zavrsi-mi/shared';
import { useNavigate } from 'react-router-dom';

export default function UserProfilePage() {
  const { id } = useParams();
  const { user: currentUser } = useAuthStore();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<User | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [reviews, setReviews] = useState<{ rating: number; comment: string; reviewer: { firstName: string; lastName: string }; createdAt: string }[]>([]);

  useEffect(() => {
    if (id) {
      api.get<{ user: User; listings: Listing[]; reviews: typeof reviews }>(`/auth/users/${id}`)
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

  return (
    <Layout>
      <Helmet>
        <title>{profile.firstName} {profile.lastName}</title>
        <meta name="description" content={`Profil korisnika ${profile.firstName} ${profile.lastName} na Završi Mi`} />
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
              {profile.bio && <p className="text-gray-600 mt-3 text-sm">{profile.bio}</p>}
              <div className="mt-3">
                <UserBadges
                  emailVerified={profile.emailVerified}
                  phoneVerified={profile.phoneVerified}
                  verifications={profile.verifications}
                  reputation={profile.reputation}
                  averageRating={profile.averageRating}
                  completedJobs={profile.completedJobs}
                  size="md"
                />
              </div>
              {profile.reputation && (
                <p className="text-sm text-brand-600 font-medium mt-2">
                  {REPUTATION_LABELS[profile.reputation as UserReputation]}
                </p>
              )}
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
              ) : currentUser && (
                <button onClick={startChat} className="btn-primary text-sm">
                  <MessageCircle size={16} /> Pošalji poruku
                </button>
              )}
              {profile.phone && profile.phoneVerified && (
                <a href={`tel:${profile.phone}`} className="btn-secondary text-sm text-center">
                  {profile.phone}
                </a>
              )}
            </div>
          </div>
        </div>

        {(profile.role === 'provider' || listings.length > 0) && (
          <div className="card p-6 mb-6">
            <h2 className="font-bold flex items-center gap-2 mb-4">
              <Calendar size={18} /> Dostupnost
            </h2>
            <AvailabilityCalendar userId={profile.id} editable={isOwn} />
          </div>
        )}

        {listings.length > 0 && (
          <div className="mb-6">
            <h2 className="font-bold flex items-center gap-2 mb-4">
              <Briefcase size={18} /> Aktivni oglasi ({listings.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {listings.map(l => <ListingCard key={l.id} listing={l} />)}
            </div>
          </div>
        )}

        {reviews.length > 0 && (
          <div className="card p-6">
            <h2 className="font-bold mb-4">Ocene i komentari</h2>
            <div className="space-y-4">
              {reviews.map((r, i) => (
                <div key={i} className="pb-4 border-b border-gray-100 last:border-0">
                  <StarRating rating={r.rating} size={14} />
                  {r.comment && <p className="text-sm mt-2 text-gray-700">{r.comment}</p>}
                  <p className="text-xs text-gray-500 mt-1">
                    {r.reviewer.firstName} {r.reviewer.lastName}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
