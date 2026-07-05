import { useEffect, useState, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { User as UserIcon, Camera, MapPin, Shield, Star, Calendar, Mail, Phone, Lock, Briefcase } from 'lucide-react';
import { User, Listing } from '@zavrsi-mi/shared';
import { Layout } from '../components/layout/Layout';
import { UserBadges, StarRating } from '../components/ui/Badges';
import { ListingCard } from '../components/ui/ListingCard';
import { AvailabilityCalendar } from '../components/ui/AvailabilityCalendar';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import { useAuthStore } from '../store/authStore';
import { api } from '../services/api';
import clsx from 'clsx';

type ProfileTab = 'profil' | 'verifikacija' | 'dostupnost' | 'oglasi' | 'ocene' | 'bezbednost';

interface ProfileReview {
  id: string;
  rating: number;
  comment: string;
  listing: { id: string; title: string } | null;
  reviewer: { firstName: string; lastName: string };
}

export default function ProfilePage() {
  const { user, fetchUser, updateUser } = useAuthStore();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', bio: '', city: '', address: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
  const [reviews, setReviews] = useState<ProfileReview[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [verifyModal, setVerifyModal] = useState<'email' | 'phone' | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [devCode, setDevCode] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [activeTab, setActiveTab] = useState<ProfileTab>('profil');

  useEffect(() => {
    if (!user) fetchUser();
  }, [user, fetchUser]);

  useEffect(() => {
    if (!user) return;
    setForm({
      firstName: user.firstName, lastName: user.lastName,
      phone: user.phone || '', bio: user.bio || '',
      city: user.city || '', address: user.address || '',
    });
    setPhoneInput(user.phone || '');
    api.get<ProfileReview[]>(`/reviews/user/${user.id}`).then(setReviews).catch(() => {});
    api.get<{ listings: Listing[] }>('/listings/my').then(r => setListings(r.listings)).catch(() => {});
  }, [user]);

  const saveProfile = async () => {
    try {
      const updated = await api.put<User>('/auth/profile', form);
      updateUser(updated);
      setEditing(false);
      toast.show('Profil sačuvan', 'success');
    } catch (err) {
      toast.show((err as Error).message, 'error');
    }
  };

  const changePassword = async () => {
    try {
      await api.put('/auth/password', passwordForm);
      setPasswordForm({ currentPassword: '', newPassword: '' });
      toast.show('Lozinka promenjena', 'success');
    } catch (err) {
      toast.show((err as Error).message, 'error');
    }
  };

  const uploadAvatar = async (file: File) => {
    const fd = new FormData();
    fd.append('avatar', file);
    try {
      const updated = await api.upload<User>('/auth/avatar', fd);
      updateUser(updated);
      toast.show('Profilna slika ažurirana', 'success');
    } catch (err) {
      toast.show((err as Error).message, 'error');
    }
  };

  const requestVerification = async (type: string) => {
    if (type === 'email') {
      setVerifyModal('email');
      try {
        const res = await api.post<{ devCode?: string }>('/auth/verify/email/send');
        if (res.devCode) setDevCode(res.devCode);
        toast.show('Verifikacioni kod poslat', 'success');
      } catch (err) {
        toast.show((err as Error).message, 'error');
      }
    } else if (type === 'phone') {
      setVerifyModal('phone');
    } else {
      await api.post('/reviews/verify', { type });
      toast.show('Zahtev za verifikaciju poslat administratoru', 'success');
    }
  };

  const sendPhoneCode = async () => {
    try {
      const res = await api.post<{ devCode?: string }>('/auth/verify/phone/send', { phone: phoneInput });
      if (res.devCode) setDevCode(res.devCode);
      toast.show('SMS kod poslat', 'success');
    } catch (err) {
      toast.show((err as Error).message, 'error');
    }
  };

  const confirmVerification = async () => {
    try {
      const endpoint = verifyModal === 'email' ? '/auth/verify/email/confirm' : '/auth/verify/phone/confirm';
      const updated = await api.post<User>(endpoint, { code: verifyCode });
      updateUser(updated);
      setVerifyModal(null);
      setVerifyCode('');
      setDevCode('');
      toast.show('Verifikacija uspešna!', 'success');
    } catch (err) {
      toast.show((err as Error).message, 'error');
    }
  };

  if (!user) return <Layout><div className="p-16 text-center">Učitavanje...</div></Layout>;

  const tabs: { id: ProfileTab; label: string; icon: typeof UserIcon; count?: number }[] = [
    { id: 'profil', label: 'Profil', icon: UserIcon },
    { id: 'verifikacija', label: 'Verifikacija', icon: Shield },
    { id: 'dostupnost', label: 'Dostupnost', icon: Calendar },
    { id: 'oglasi', label: 'Aktivni oglasi', icon: Briefcase, count: listings.length },
    { id: 'ocene', label: 'Ocene', icon: Star, count: reviews.length },
    { id: 'bezbednost', label: 'Bezbednost', icon: Lock },
  ];

  return (
    <Layout>
      <Helmet><title>Moj profil</title></Helmet>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="card p-6 mb-6">
          <div className="flex flex-col sm:flex-row items-start gap-6">
            <div className="relative">
              <div className="w-24 h-24 rounded-2xl bg-brand-100 flex items-center justify-center text-brand-700 text-3xl font-bold overflow-hidden">
                {user.avatarUrl
                  ? <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
                  : `${user.firstName[0]}${user.lastName[0]}`}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-2 -right-2 p-1.5 bg-white rounded-lg shadow border border-gray-200 hover:bg-gray-50"
              >
                <Camera size={16} className="text-gray-600" />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                onChange={e => e.target.files?.[0] && uploadAvatar(e.target.files[0])} />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold">{user.firstName} {user.lastName}</h1>
              <p className="text-gray-500">{user.email}</p>
              <div className="mt-3">
                <UserBadges
                  emailVerified={user.emailVerified}
                  phoneVerified={user.phoneVerified}
                  verifications={user.verifications}
                  reputation={user.reputation}
                  role={user.role}
                  averageRating={user.averageRating}
                  completedJobs={user.completedJobs}
                  size="md"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (!editing) setActiveTab('profil');
                  setEditing(!editing);
                }}
                className="btn-secondary text-sm"
              >
                {editing ? 'Otkaži' : 'Izmeni'}
              </button>
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
            <h2 className="font-bold flex items-center gap-2 mb-4"><UserIcon size={18} /> Lični podaci</h2>
            {editing ? (
              <div className="space-y-3">
                <input className="input" value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} placeholder="Ime" />
                <input className="input" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} placeholder="Prezime" />
                <input className="input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="Telefon" />
                <input className="input" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="Grad" />
                <input className="input" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Adresa" />
                <textarea className="input" value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} placeholder="O meni" />
                <button onClick={saveProfile} className="btn-primary w-full">Sačuvaj</button>
              </div>
            ) : (
              <dl className="space-y-3 text-sm">
                <div><dt className="text-gray-500">Telefon</dt><dd>{user.phone || '—'}</dd></div>
                <div><dt className="text-gray-500">Grad</dt><dd className="flex items-center gap-1"><MapPin size={14} /> {user.city || '—'}</dd></div>
                <div><dt className="text-gray-500">Adresa</dt><dd>{user.address || '—'}</dd></div>
                <div><dt className="text-gray-500">O meni</dt><dd>{user.bio || '—'}</dd></div>
              </dl>
            )}
          </div>
        )}

        {activeTab === 'verifikacija' && (
          <div className="card p-6 animate-slide-up">
            <h2 className="font-bold flex items-center gap-2 mb-4"><Shield size={18} /> Verifikacija</h2>
            <div className="space-y-2">
              {[
                { type: 'email', label: 'Potvrdi email', icon: Mail, done: user.emailVerified },
                { type: 'phone', label: 'Potvrdi telefon', icon: Phone, done: user.phoneVerified },
                { type: 'user', label: 'Verifikuj identitet', done: user.verifications?.some(v => v.type === 'user' && v.status === 'approved') },
                { type: 'provider', label: 'Verifikuj majstora', done: user.verifications?.some(v => v.type === 'provider' && v.status === 'approved') },
              ].map(v => (
                <div key={v.type} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-transparent dark:border-gray-700">
                  <span className="text-sm flex items-center gap-2 dark:text-gray-200">
                    {'icon' in v && v.icon && <v.icon size={14} className="text-gray-400 dark:text-gray-500" />}
                    {v.label}
                  </span>
                  {v.done ? (
                    <span className="text-xs text-green-600 font-medium">Verifikovano</span>
                  ) : (
                    <button onClick={() => requestVerification(v.type)} className="text-xs text-brand-600 font-medium hover:underline">
                      {v.type === 'email' || v.type === 'phone' ? 'Verifikuj' : 'Zatraži'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'dostupnost' && (
          <div className="card p-6 animate-slide-up">
            <h2 className="font-bold flex items-center gap-2 mb-4"><Calendar size={18} /> Kalendar dostupnosti</h2>
            <p className="text-sm text-gray-500 mb-4 text-center">Označite dane kada ste slobodni, zauzeti ili na godišnjem odmoru.</p>
            <AvailabilityCalendar userId={user.id} editable compact />
          </div>
        )}

        {activeTab === 'oglasi' && (
          <div className="animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold flex items-center gap-2"><Briefcase size={18} /> Aktivni oglasi ({listings.length})</h2>
              <Link to="/objavi" className="btn-primary text-sm">Novi oglas</Link>
            </div>
            {listings.length === 0 ? (
              <div className="card p-8 text-center">
                <p className="text-sm text-gray-500 mb-4">Nemate aktivnih oglasa</p>
                <Link to="/objavi" className="btn-primary text-sm">Objavi oglas</Link>
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
                {r.comment && <p className="text-sm mt-1">{r.comment}</p>}
                <p className="text-xs text-gray-500 mt-1">{r.reviewer.firstName} {r.reviewer.lastName}</p>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'bezbednost' && (
          <div className="card p-6 animate-slide-up">
            <h2 className="font-bold flex items-center gap-2 mb-4"><Lock size={18} /> Promena lozinke</h2>
            <div className="space-y-3 max-w-md">
              <input type="password" className="input" placeholder="Trenutna lozinka" value={passwordForm.currentPassword}
                onChange={e => setPasswordForm(f => ({ ...f, currentPassword: e.target.value }))} />
              <input type="password" className="input" placeholder="Nova lozinka" value={passwordForm.newPassword}
                onChange={e => setPasswordForm(f => ({ ...f, newPassword: e.target.value }))} />
              <button onClick={changePassword} className="btn-secondary w-full sm:w-auto">Promeni lozinku</button>
            </div>
          </div>
        )}
      </div>

      <Modal
        open={!!verifyModal}
        onClose={() => { setVerifyModal(null); setVerifyCode(''); setDevCode(''); }}
        title={verifyModal === 'email' ? 'Potvrda email-a' : 'Potvrda telefona'}
      >
        <div className="space-y-4">
          {verifyModal === 'phone' && (
            <div>
              <label className="text-sm font-medium mb-1 block">Broj telefona</label>
              <div className="flex gap-2">
                <input className="input flex-1" value={phoneInput} onChange={e => setPhoneInput(e.target.value)} placeholder="+381..." />
                <button onClick={sendPhoneCode} className="btn-secondary shrink-0">Pošalji kod</button>
              </div>
            </div>
          )}
          {devCode && (
            <div className="p-3 bg-yellow-50 text-yellow-800 rounded-xl text-sm">
              Dev kod: <strong>{devCode}</strong>
            </div>
          )}
          <div>
            <label className="text-sm font-medium mb-1 block">Verifikacioni kod (6 cifara)</label>
            <input className="input" value={verifyCode} onChange={e => setVerifyCode(e.target.value)} placeholder="123456" maxLength={6} />
          </div>
          <button onClick={confirmVerification} className="btn-primary w-full">Potvrdi</button>
        </div>
      </Modal>
    </Layout>
  );
}
