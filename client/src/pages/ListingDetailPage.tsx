import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { MapPin, Phone, Clock, MessageCircle, Send, AlertTriangle, Check, Star, Pencil, Trash2, ShieldCheck } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { StarRating } from '../components/ui/Badges';
import { ConfirmDialog, Modal } from '../components/ui/Modal';
import { ReviewModal } from '../components/ui/ReviewModal';
import { useToast } from '../components/ui/Toast';
import { useAuthStore } from '../store/authStore';
import { api } from '../services/api';
import { Listing, listingAcceptsBids, userTradeMatchesCategory } from '@zavrsi-mi/shared';
import { formatDistanceToNow } from 'date-fns';
import { sr } from 'date-fns/locale';
import { formatListingPrice } from '../utils/listingPrice';

interface BidWithProvider {
  id: string;
  listingId: string;
  providerId: string;
  price: number;
  description: string;
  estimatedTime?: string;
  status: string;
  createdAt: string;
  provider?: {
    id: string;
    firstName: string;
    lastName: string;
    avatarUrl?: string;
    averageRating: number;
    completedJobs: number;
  };
}

export default function ListingDetailPage() {
  const { id } = useParams();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const toast = useToast();
  const [listing, setListing] = useState<Listing | null>(null);
  const [bids, setBids] = useState<BidWithProvider[]>([]);
  const [showBidForm, setShowBidForm] = useState(false);
  const [bidForm, setBidForm] = useState({ price: '', description: '', estimatedTime: '' });
  const [activeImage, setActiveImage] = useState(0);
  const [acceptBidId, setAcceptBidId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [acceptLoading, setAcceptLoading] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<{ id: string; name: string } | null>(null);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [rejectModal, setRejectModal] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [moderating, setModerating] = useState(false);

  const loadBids = () => {
    if (id) api.get<BidWithProvider[]>(`/listings/${id}/bids`).then(setBids).catch(() => {});
  };

  useEffect(() => {
    if (id) {
      api.get<Listing>(`/listings/${id}`).then(setListing).catch(() => navigate('/oglasi'));
    }
  }, [id, navigate]);

  useEffect(() => {
    if (id && listing && listingAcceptsBids(listing.type, listing.isSos)) {
      loadBids();
    }
  }, [id, listing?.type, listing?.isSos]);

  useEffect(() => {
    if (!id || !user || !listing || listing.status !== 'completed' || listing.userId !== user.id) return;
    api.get<{ reviewed: boolean }>(`/reviews/listing/${id}/mine`)
      .then(r => setReviewSubmitted(r.reviewed))
      .catch(() => {});
  }, [id, user, listing?.status, listing?.userId]);

  const handleBid = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post(`/listings/${id}/bids`, {
        price: parseFloat(bidForm.price),
        description: bidForm.description,
        estimatedTime: bidForm.estimatedTime,
      });
      setShowBidForm(false);
      setBidForm({ price: '', description: '', estimatedTime: '' });
      loadBids();
      toast.show('Ponuda uspešno poslata!', 'success');
    } catch (err) {
      toast.show((err as Error).message, 'error');
    }
  };

  const handleAcceptBid = async () => {
    if (!acceptBidId) return;
    setAcceptLoading(true);
    try {
      const result = await api.post<{ providerId: string }>(`/listings/bids/${acceptBidId}/accept`, {});
      setAcceptBidId(null);
      loadBids();
      if (listing) {
        setListing({ ...listing, status: 'completed' });
      }
      toast.show('Ponuda prihvaćena!', 'success');
      const acceptedBid = bids.find(b => b.id === acceptBidId);
      if (acceptedBid?.provider && !reviewSubmitted) {
        setReviewTarget({
          id: result.providerId || acceptedBid.providerId,
          name: `${acceptedBid.provider.firstName} ${acceptedBid.provider.lastName}`,
        });
      }
    } catch (err) {
      toast.show((err as Error).message, 'error');
    } finally {
      setAcceptLoading(false);
    }
  };

  const startChat = async () => {
    if (!user || !listing) return;
    const result = await api.post<{ conversationId: string }>('/messages/start', {
      recipientId: listing.userId,
      listingId: listing.id,
    });
    navigate(`/poruke/${result.conversationId}`);
  };

  const approveListing = async () => {
    if (!listing) return;
    setModerating(true);
    try {
      await api.put(`/admin/listings/${listing.id}/status`, { status: 'active' });
      setListing({ ...listing, status: 'active' });
      toast.show('Oglas odobren', 'success');
    } catch (err) {
      toast.show((err as Error).message, 'error');
    } finally {
      setModerating(false);
    }
  };

  const rejectListing = async () => {
    if (!listing || !rejectNote.trim()) return;
    setModerating(true);
    try {
      await api.put(`/admin/listings/${listing.id}/status`, { status: 'rejected', note: rejectNote });
      setListing({ ...listing, status: 'rejected', moderationNote: rejectNote });
      setRejectModal(false);
      setRejectNote('');
      toast.show('Oglas odbijen', 'success');
    } catch (err) {
      toast.show((err as Error).message, 'error');
    } finally {
      setModerating(false);
    }
  };

  const isOwner = user?.id === listing?.userId;
  const isStaff = user?.role === 'admin' || user?.role === 'moderator';
  const canManage = isOwner || isStaff;
  const acceptedBid = bids.find(b => b.status === 'accepted');
  const acceptsBids = listing ? listingAcceptsBids(listing.type, listing.isSos) : false;
  const tradeMatches = user ? userTradeMatchesCategory(user.trade, listing?.categoryId ?? 0) : false;
  const alreadyBid = user ? bids.some(b => b.providerId === user.id) : false;
  const canBid = !!user
    && !isOwner
    && acceptsBids
    && listing?.status === 'active'
    && (user.role === 'provider' || user.role === 'user')
    && tradeMatches
    && !alreadyBid;

  if (!listing) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto px-4 py-16 text-center">
          <div className="animate-spin w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full mx-auto" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Helmet>
        <title>{listing.title}</title>
        <meta name="description" content={listing.description.slice(0, 160)} />
        <meta property="og:title" content={listing.title} />
        <meta property="og:description" content={listing.description.slice(0, 160)} />
        {listing.images[0] && <meta property="og:image" content={listing.images[0].url} />}
      </Helmet>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {listing.status === 'pending' && canManage && (
          <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl text-yellow-800 dark:text-yellow-200 text-sm">
            Ovaj oglas čeka odobrenje administratora.
          </div>
        )}
        {listing.status === 'rejected' && canManage && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-800 dark:text-red-200 text-sm">
            <strong>Oglas odbijen.</strong>
            {listing.moderationNote && <p className="mt-1">Razlog: {listing.moderationNote}</p>}
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="card overflow-hidden">
              <div className="aspect-[16/10] bg-gray-100">
                <img
                  src={listing.images[activeImage]?.url || 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=800'}
                  alt={listing.title}
                  className="w-full h-full object-cover"
                />
              </div>
              {listing.images.length > 1 && (
                <div className="flex gap-2 p-3 overflow-x-auto">
                  {listing.images.map((img, i) => (
                    <button key={img.id} onClick={() => setActiveImage(i)}
                      className={`w-20 h-14 rounded-lg overflow-hidden shrink-0 border-2 ${i === activeImage ? 'border-brand-500' : 'border-transparent'}`}>
                      <img src={img.url} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="card p-6">
              <div className="flex items-start gap-3 mb-4">
                {listing.isSos && <span className="badge-sos"><AlertTriangle size={12} /> HITNO</span>}
                <span className="badge bg-brand-50 text-brand-700">{listing.category?.name}</span>
                {listing.status === 'completed' && (
                  <span className="badge bg-gray-100 text-gray-600">Završeno</span>
                )}
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-heading mb-4">{listing.title}</h1>
              <div className="flex flex-wrap gap-4 text-sm text-muted mb-6">
                <span className="flex items-center gap-1"><MapPin size={16} /> {listing.city}{listing.address && `, ${listing.address}`}</span>
                <span className="flex items-center gap-1"><Clock size={16} /> {formatDistanceToNow(new Date(listing.createdAt), { addSuffix: true, locale: sr })}</span>
              </div>
              <div className="prose-content whitespace-pre-wrap">{listing.description}</div>
            </div>

            {acceptsBids && (
              <div className="card p-6">
                <h2 className="text-xl font-bold mb-4">
                  {listing.type === 'sos' || listing.isSos ? '🚨 Ponude majstora' : 'Ponude majstora'} ({bids.length})
                </h2>

                {canBid && (
                  <button onClick={() => setShowBidForm(!showBidForm)} className="btn-primary mb-4">
                    <Send size={16} /> {showBidForm ? 'Otkaži' : 'Pošalji ponudu'}
                  </button>
                )}

                {user && !isOwner && acceptsBids && listing.status === 'active' && !tradeMatches && (user.role === 'provider' || user.role === 'user') && (
                  <p className="text-sm text-muted mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    Vaše zanimanje ne odgovara ovoj kategoriji oglasa. Ažurirajte profil ako nudite ovu uslugu.
                  </p>
                )}

                {user && !isOwner && acceptsBids && alreadyBid && (
                  <p className="text-sm text-green-700 dark:text-green-400 mb-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-xl">
                    Već ste poslali ponudu za ovaj oglas.
                  </p>
                )}

                {!user && listing.status === 'active' && (
                  <p className="text-sm text-muted mb-4">
                    <Link to="/prijava" className="text-brand-600 hover:underline">Prijavite se</Link> da pošaljete ponudu.
                  </p>
                )}

                {showBidForm && (
                  <form onSubmit={handleBid} className="space-y-3 mb-6 p-4 bg-gray-50 rounded-xl">
                    <input className="input" type="number" placeholder="Cena (RSD)" value={bidForm.price}
                      onChange={e => setBidForm(f => ({ ...f, price: e.target.value }))} required />
                    <input className="input" placeholder="Procenjeno vreme (npr. 2 dana)" value={bidForm.estimatedTime}
                      onChange={e => setBidForm(f => ({ ...f, estimatedTime: e.target.value }))} />
                    <textarea className="input min-h-[100px]" placeholder="Opis ponude..." value={bidForm.description}
                      onChange={e => setBidForm(f => ({ ...f, description: e.target.value }))} required />
                    <button type="submit" className="btn-primary">Pošalji ponudu</button>
                  </form>
                )}

                {bids.length === 0 ? (
                  <p className="text-gray-500">Još nema ponuda. Budite prvi majstor!</p>
                ) : (
                  <div className="space-y-4">
                    {bids.map(bid => (
                      <div key={bid.id} className={`p-4 rounded-xl border ${bid.status === 'accepted' ? 'border-green-300 bg-green-50' : bid.status === 'rejected' ? 'border-gray-200 bg-gray-50 opacity-60' : 'border-gray-200'}`}>
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <Link to={`/korisnik/${bid.providerId}`} className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-medium text-sm shrink-0">
                              {bid.provider?.firstName?.[0]}{bid.provider?.lastName?.[0]}
                            </Link>
                            <div>
                              <Link to={`/korisnik/${bid.providerId}`} className="font-medium hover:text-brand-600">
                                {bid.provider?.firstName} {bid.provider?.lastName}
                              </Link>
                              {bid.provider && bid.provider.averageRating > 0 && (
                                <StarRating rating={bid.provider.averageRating} size={12} />
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-lg font-bold text-brand-700">{bid.price.toLocaleString('sr-RS')} RSD</div>
                            {bid.estimatedTime && <div className="text-xs text-gray-500">{bid.estimatedTime}</div>}
                          </div>
                        </div>
                        <p className="text-sm text-gray-700 mt-3">{bid.description}</p>
                        {bid.status === 'accepted' && (
                          <span className="inline-flex items-center gap-1 text-xs text-green-700 font-medium mt-2">
                            <Check size={14} /> Prihvaćena ponuda
                          </span>
                        )}
                        {isOwner && bid.status === 'pending' && listing.status !== 'completed' && (
                          <button onClick={() => setAcceptBidId(bid.id)} className="btn-primary text-sm mt-3">
                            Prihvati ponudu
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {listing.status === 'completed' && isOwner && acceptedBid?.provider && !reviewSubmitted && (
              <div className="card p-6 bg-brand-50 border-brand-200">
                <h3 className="font-bold mb-2">Posao završen!</h3>
                <p className="text-sm text-gray-600 mb-4">Ocenite majstora {acceptedBid.provider.firstName} {acceptedBid.provider.lastName}</p>
                <button
                  onClick={() => setReviewTarget({ id: acceptedBid.providerId, name: `${acceptedBid.provider!.firstName} ${acceptedBid.provider!.lastName}` })}
                  className="btn-primary text-sm"
                >
                  <Star size={16} /> Ostavi ocenu
                </button>
              </div>
            )}

            {listing.status === 'completed' && isOwner && reviewSubmitted && (
              <div className="card p-6 bg-green-50 border-green-200">
                <h3 className="font-bold mb-1 text-green-800">Hvala na oceni!</h3>
                <p className="text-sm text-green-700">Već ste ocenili majstora za ovaj posao.</p>
              </div>
            )}
          </div>

          <div className="space-y-6">
            {isStaff && listing.status === 'pending' && (
              <div className="card p-6 border-2 border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20">
                <h3 className="font-bold flex items-center gap-2 mb-3 dark:text-white">
                  <ShieldCheck size={18} /> Moderacija oglasa
                </h3>
                <p className="text-sm text-muted mb-4">Oglas čeka odobrenje. Možete odmah odobriti ili odbiti.</p>
                <div className="flex flex-col gap-2">
                  <button onClick={approveListing} disabled={moderating} className="btn-primary w-full">
                    <Check size={16} /> Odobri oglas
                  </button>
                  <button onClick={() => setRejectModal(true)} disabled={moderating} className="btn-danger w-full">
                    Odbij oglas
                  </button>
                </div>
              </div>
            )}
            <div className="card p-6 sticky top-24">
              {canManage && (
                <div className="flex gap-2 mb-4">
                  <Link to={`/oglas/${listing.id}/izmeni`} className="btn-secondary flex-1 text-sm">
                    <Pencil size={16} /> Izmeni oglas
                  </Link>
                  <button onClick={() => setDeleteConfirm(true)} className="btn-danger px-3">
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
              {(listing.price !== undefined || listing.priceType || listing.priceNegotiable) && (
                <div className="text-3xl font-bold text-brand-600 dark:text-brand-400 mb-1">
                  {formatListingPrice(listing)}
                </div>
              )}

              <div className="space-y-3 mb-6">
                {listing.phone && (
                  <a href={`tel:${listing.phone}`} className="btn-secondary w-full">
                    <Phone size={16} /> {listing.phone}
                  </a>
                )}
                {user && listing.userId !== user.id && (
                  <>
                    {canBid && (
                      <button onClick={() => setShowBidForm(true)} className="btn-primary w-full mb-3">
                        <Send size={16} /> Pošalji ponudu
                      </button>
                    )}
                    <button onClick={startChat} className="btn-primary w-full">
                      <MessageCircle size={16} /> Pošalji poruku
                    </button>
                  </>
                )}
              </div>

              {listing.user && (
                <Link to={`/korisnik/${listing.userId}`} className="block pt-6 border-t border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold">
                      {listing.user.firstName?.[0]}{listing.user.lastName?.[0]}
                    </div>
                    <div>
                      <div className="font-semibold">{listing.user.firstName} {listing.user.lastName}</div>
                      {listing.user.averageRating > 0 && (
                        <StarRating rating={listing.user.averageRating} size={14} />
                      )}
                    </div>
                  </div>
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={deleteConfirm}
        onClose={() => setDeleteConfirm(false)}
        onConfirm={async () => {
          await api.delete(`/listings/${listing.id}`);
          toast.show('Oglas obrisan', 'success');
          navigate(isStaff ? '/admin' : '/profil');
        }}
        title="Obriši oglas"
        message="Da li ste sigurni da želite da obrišete ovaj oglas? Ova akcija se ne može poništiti."
        confirmLabel="Obriši"
        danger
      />

      <ConfirmDialog
        open={!!acceptBidId}
        onClose={() => setAcceptBidId(null)}
        onConfirm={handleAcceptBid}
        title="Prihvati ponudu"
        message="Da li ste sigurni da želite da prihvatite ovu ponudu? Ostale ponude će biti odbijene."
        confirmLabel="Prihvati"
        danger={false}
        loading={acceptLoading}
      />

      {reviewTarget && (
        <ReviewModal
          open={!!reviewTarget}
          onClose={() => setReviewTarget(null)}
          revieweeId={reviewTarget.id}
          revieweeName={reviewTarget.name}
          listingId={listing.id}
          onSubmitted={() => setReviewSubmitted(true)}
        />
      )}

      <Modal open={rejectModal} onClose={() => { setRejectModal(false); setRejectNote(''); }} title="Odbij oglas">
        <div className="space-y-4">
          <p className="text-sm text-body">Unesite razlog odbijanja oglasa.</p>
          <textarea className="input min-h-[100px]" placeholder="Razlog odbijanja..."
            value={rejectNote} onChange={e => setRejectNote(e.target.value)} />
          <div className="flex gap-3">
            <button onClick={rejectListing} disabled={!rejectNote.trim() || moderating} className="btn-danger flex-1">
              Odbij
            </button>
            <button onClick={() => { setRejectModal(false); setRejectNote(''); }} className="btn-secondary flex-1">Otkaži</button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
}
