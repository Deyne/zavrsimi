import { useEffect, useState, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import {
  Users, FileText, Shield, AlertTriangle, Check, X, BarChart3, Pencil, ScrollText, Trash2, ExternalLink, Ban, Clock, Headphones, MessageSquare, Star, Search
} from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { Modal } from '../components/ui/Modal';
import { RoleBadge } from '../components/ui/Badges';
import { useAuthStore } from '../store/authStore';
import { api } from '../services/api';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useToast } from '../components/ui/Toast';
import { TRADES } from '@zavrsi-mi/shared';

interface AdminStats {
  total_users: string;
  total_providers: string;
  active_listings: string;
  pending_listings: string;
  pending_verifications: string;
  sos_listings: string;
}

interface AdminUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  avatar_url?: string | null;
  is_platform_owner?: boolean;
  city?: string;
  address?: string;
  phone?: string;
  bio?: string;
  trade?: string;
  is_suspended: boolean;
}

interface SuspensionRecord {
  id: string;
  user_id: string;
  reason: string;
  evidence: string | null;
  starts_at: string;
  expires_at: string | null;
  suspended_by_role: string;
  first_name: string;
  last_name: string;
  email: string;
  suspender_first_name: string;
  suspender_last_name: string;
}

interface SupportHistoryItem {
  id: string;
  status: 'waiting' | 'active' | 'closed';
  initialMessage: string;
  conversationId: string | null;
  createdAt: string;
  claimedAt: string | null;
  closedAt: string | null;
  closedReason?: string | null;
  rating?: number | null;
  ratingComment?: string | null;
  ratedAt?: string | null;
  messageCount: number;
  user: { firstName: string; lastName: string; email?: string };
  agent?: { firstName: string; lastName: string; role?: string };
}

interface SupportHistoryMessage {
  id: string;
  sender_id: string;
  content: string;
  type: string;
  created_at: string;
  first_name: string;
  last_name: string;
  sender_role: string;
  image_url?: string | null;
}

const ROLES = [
  { value: 'user', label: 'Korisnik' },
  { value: 'provider', label: 'Pru\u017ealac usluga' },
  { value: 'moderator', label: 'Moderator' },
  { value: 'podrska', label: 'Podr\u0161ka' },
  { value: 'admin', label: 'Admin' },
];

const DURATION_PRESETS = [
  { value: '7', label: '7 dana' },
  { value: '14', label: '14 dana' },
  { value: '30', label: '30 dana' },
  { value: '90', label: '90 dana' },
  { value: 'permanent', label: 'Trajno' },
];

const LOG_ACTION_FILTERS = [
  { value: '', label: 'Sve aktivnosti' },
  { value: 'user_login', label: 'Prijava na nalog' },
  { value: 'user_suspended,user_unsuspended,suspension_updated', label: 'Suspenzije' },
  { value: 'listing_rejected', label: 'Upozorenje / odbijen oglas' },
  { value: 'listing_created', label: 'Postavljanje oglasa' },
  { value: 'listing_updated', label: 'Izmena oglasa' },
  { value: 'listing_deleted', label: 'Brisanje oglasa' },
  { value: 'listing_active,listing_pending', label: 'Odobravanje oglasa' },
  { value: 'user_updated,user_trade_updated', label: 'Izmena korisnika' },
  { value: 'forum_topic_created,forum_reply_created', label: 'Forum aktivnost' },
];

const LOG_ROLE_FILTERS = [
  { value: '', label: 'Sve uloge' },
  { value: 'user', label: 'Korisnik' },
  { value: 'provider', label: 'Pružalac' },
  { value: 'moderator', label: 'Moderator' },
  { value: 'podrska', label: 'Podr\u0161ka' },
  { value: 'admin', label: 'Admin' },
];

function formatSuspensionEnd(expiresAt: string | null) {
  if (!expiresAt) return 'Trajno';
  return new Date(expiresAt).toLocaleString('sr-RS');
}

export default function AdminPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [pendingListings, setPendingListings] = useState<{ id: string; title: string; first_name: string; last_name: string }[]>([]);
  const [pendingVerifications, setPendingVerifications] = useState<{ id: string; type: string; first_name: string; last_name: string }[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [suspensions, setSuspensions] = useState<SuspensionRecord[]>([]);
  const [tab, setTab] = useState('dashboard');
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState({
    firstName: '', lastName: '', email: '', role: 'user', trade: '', city: '', address: '', phone: '', bio: '', newPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [moderateListing, setModerateListing] = useState<{ id: string; title: string; status: string } | null>(null);
  const [moderationNote, setModerationNote] = useState('');
  const [logs, setLogs] = useState<{ id: string; action: string; action_label?: string; user_role: string; first_name: string; last_name: string; description?: string; created_at: string }[]>([]);
  const [logFilters, setLogFilters] = useState({ action: '', role: '', search: '', dateFrom: '', dateTo: '' });
  const [logPage, setLogPage] = useState(1);
  const [logTotalPages, setLogTotalPages] = useState(1);
  const [suspendTarget, setSuspendTarget] = useState<AdminUser | null>(null);
  const [suspendForm, setSuspendForm] = useState({ reason: '', evidence: '', duration: '7' });
  const [editSuspension, setEditSuspension] = useState<SuspensionRecord | null>(null);
  const [editSuspensionForm, setEditSuspensionForm] = useState({ reason: '', evidence: '', duration: '7' });
  const [supportHistory, setSupportHistory] = useState<SupportHistoryItem[]>([]);
  const [selectedSupportId, setSelectedSupportId] = useState<string | null>(null);
  const [supportMessages, setSupportMessages] = useState<SupportHistoryMessage[]>([]);
  const [supportDetail, setSupportDetail] = useState<SupportHistoryItem | null>(null);
  const [loadingSupportDetail, setLoadingSupportDetail] = useState(false);
  const [supportSearch, setSupportSearch] = useState('');
  const supportMessagesRef = useRef<HTMLDivElement>(null);

  const isAdmin = user?.role === 'admin';
  const isOwner = Boolean(user?.isPlatformOwner);
  const canManageUsers = isAdmin || user?.role === 'moderator';

  useEffect(() => {
    if (tab === 'support' && isAdmin) {
      loadSupportHistory();
    }
  }, [tab, isAdmin]);

  const loadSupportHistory = async () => {
    try {
      const res = await api.get<{ history: SupportHistoryItem[] }>('/support/history');
      setSupportHistory(res.history || []);
    } catch (err) {
      toast.show((err as Error).message, 'error');
    }
  };

  const loadSupportDetail = async (id: string) => {
    setSelectedSupportId(id);
    setLoadingSupportDetail(true);
    try {
      const res = await api.get<{ request: SupportHistoryItem; messages: SupportHistoryMessage[] }>(`/support/history/${id}`);
      setSupportDetail(res.request);
      setSupportMessages(res.messages || []);
    } catch (err) {
      toast.show((err as Error).message, 'error');
      setSupportDetail(null);
      setSupportMessages([]);
    } finally {
      setLoadingSupportDetail(false);
    }
  };

  const supportStatusLabel = (status: SupportHistoryItem['status']) => {
    if (status === 'waiting') return 'Na čekanju';
    if (status === 'active') return 'Aktivan';
    return 'Završen';
  };

  const isStaffRole = (role?: string) => role === 'admin' || role === 'moderator' || role === 'podrska';

  const filteredSupportHistory = supportHistory.filter(item => {
    if (!supportSearch.trim()) return true;
    const q = supportSearch.trim().toLowerCase();
    const userName = `${item.user.firstName} ${item.user.lastName}`.toLowerCase();
    const agentName = item.agent ? `${item.agent.firstName} ${item.agent.lastName}`.toLowerCase() : '';
    const email = (item.user.email || '').toLowerCase();
    return userName.includes(q) || agentName.includes(q) || email.includes(q);
  });

  useEffect(() => {
    if (!supportMessages.length) return;
    supportMessagesRef.current?.scrollTo({ top: supportMessagesRef.current.scrollHeight, behavior: 'smooth' });
  }, [supportMessages, selectedSupportId]);

  const renderSupportRating = (value?: number | null, size = 14) => {
    if (!value) return <span className="text-xs text-muted">Bez ocene</span>;
    return (
      <span className="inline-flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map(n => (
          <Star
            key={n}
            size={size}
            className={n <= value ? 'fill-amber-400 text-amber-400' : 'text-gray-300 dark:text-gray-600'}
          />
        ))}
        <span className="text-xs text-muted ml-1">({value}/5)</span>
      </span>
    );
  };

  useEffect(() => {
    if (user?.role !== 'admin' && user?.role !== 'moderator') { navigate('/'); return; }
    loadData();
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, [user, navigate]);

  useEffect(() => {
    const state = location.state as { editUserId?: string; tab?: string } | null;
    if (!state?.editUserId && !state?.tab) return;
    if (state.tab) setTab(state.tab);
    if (state.editUserId && (user?.role === 'admin' || user?.role === 'moderator')) {
      void openEditUser(state.editUserId);
    }
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, user?.role, navigate]);

  const loadData = async () => {
    try {
      const requests: Promise<unknown>[] = [
        api.get<AdminStats>('/admin/stats'),
        api.get<{ listings: typeof pendingListings }>('/admin/listings/pending'),
        api.get<typeof pendingVerifications>('/admin/verifications/pending'),
        api.get<AdminUser[]>('/admin/users'),
        api.get<{ suspensions: SuspensionRecord[] }>('/admin/suspensions'),
      ];
      const results = await Promise.all(requests);
      setStats(results[0] as AdminStats);
      setPendingListings((results[1] as { listings: typeof pendingListings }).listings || []);
      setPendingVerifications(results[2] as typeof pendingVerifications);
      setUsers(results[3] as AdminUser[]);
      setSuspensions((results[4] as { suspensions: SuspensionRecord[] }).suspensions || []);
      if (isAdmin) await loadLogs(1);
    } catch (err) {
      toast.show((err as Error).message || 'Greška pri učitavanju admin podataka', 'error');
    }
  };

  const loadLogs = async (page = logPage) => {
    const params = new URLSearchParams({ page: String(page) });
    if (logFilters.action) params.set('action', logFilters.action);
    if (logFilters.role) params.set('role', logFilters.role);
    if (logFilters.search.trim()) params.set('search', logFilters.search.trim());
    if (logFilters.dateFrom) params.set('dateFrom', logFilters.dateFrom);
    if (logFilters.dateTo) params.set('dateTo', logFilters.dateTo);
    const result = await api.get<{ logs: typeof logs; totalPages: number }>(`/admin/logs?${params}`);
    setLogs(result.logs || []);
    setLogPage(page);
    setLogTotalPages(result.totalPages || 1);
    return result;
  };

  const applyLogFilters = async () => {
    try {
      await loadLogs(1);
    } catch (err) {
      toast.show((err as Error).message, 'error');
    }
  };

  const resetLogFilters = async () => {
    const cleared = { action: '', role: '', search: '', dateFrom: '', dateTo: '' };
    setLogFilters(cleared);
    try {
      const params = new URLSearchParams({ page: '1' });
      const result = await api.get<{ logs: typeof logs; totalPages: number }>(`/admin/logs?${params}`);
      setLogs(result.logs || []);
      setLogPage(1);
      setLogTotalPages(result.totalPages || 1);
    } catch (err) {
      toast.show((err as Error).message, 'error');
    }
  };

  const approveListing = async (id: string, title: string) => {
    try {
      await api.put(`/admin/listings/${id}/status`, { status: 'active' });
      toast.show(`Oglas "${title}" odobren`, 'success');
      loadData();
    } catch (err) {
      toast.show((err as Error).message, 'error');
    }
  };

  const submitModeration = async () => {
    if (!moderateListing) return;
    if (moderateListing.status === 'active') {
      await approveListing(moderateListing.id, moderateListing.title);
      setModerateListing(null);
      return;
    }
    try {
      await api.put(`/admin/listings/${moderateListing.id}/status`, {
        status: moderateListing.status,
        note: moderationNote,
      });
      toast.show(moderateListing.status === 'active' ? 'Oglas odobren' : 'Oglas odbijen', 'success');
      setModerateListing(null);
      setModerationNote('');
      loadData();
    } catch (err) {
      toast.show((err as Error).message, 'error');
    }
  };

  const deleteListing = async (id: string) => {
    try {
      await api.delete(`/admin/listings/${id}`);
      toast.show('Oglas obrisan', 'success');
      loadData();
    } catch (err) {
      toast.show((err as Error).message, 'error');
    }
  };

  const reviewVerification = async (id: string, status: string) => {
    await api.put(`/admin/verifications/${id}`, { status });
    loadData();
  };

  const openSuspendModal = (u: AdminUser) => {
    setSuspendTarget(u);
    setSuspendForm({ reason: '', evidence: '', duration: '7' });
  };

  const submitSuspend = async () => {
    if (!suspendTarget || !suspendForm.reason.trim()) {
      toast.show('Razlog suspenzije je obavezan', 'error');
      return;
    }
    try {
      await api.post(`/admin/users/${suspendTarget.id}/suspend`, {
        reason: suspendForm.reason,
        evidence: suspendForm.evidence || undefined,
        durationDays: suspendForm.duration === 'permanent' ? undefined : parseInt(suspendForm.duration, 10),
        expiresAt: suspendForm.duration === 'permanent' ? null : undefined,
      });
      toast.show('Korisnik suspendovan', 'success');
      setSuspendTarget(null);
      loadData();
    } catch (err) {
      toast.show((err as Error).message, 'error');
    }
  };

  const liftSuspension = async (suspensionId: string) => {
    try {
      await api.post(`/admin/suspensions/${suspensionId}/lift`);
      toast.show('Suspenzija uklonjena', 'success');
      loadData();
    } catch (err) {
      toast.show((err as Error).message, 'error');
    }
  };

  const openEditSuspension = (s: SuspensionRecord) => {
    setEditSuspension(s);
    setEditSuspensionForm({
      reason: s.reason,
      evidence: s.evidence || '',
      duration: s.expires_at ? '30' : 'permanent',
    });
  };

  const saveSuspensionEdit = async () => {
    if (!editSuspension) return;
    try {
      await api.put(`/admin/suspensions/${editSuspension.id}`, {
        reason: editSuspensionForm.reason,
        evidence: editSuspensionForm.evidence || undefined,
        durationDays: editSuspensionForm.duration === 'permanent' ? undefined : parseInt(editSuspensionForm.duration, 10),
        expiresAt: editSuspensionForm.duration === 'permanent' ? null : undefined,
      });
      toast.show('Suspenzija ažurirana', 'success');
      setEditSuspension(null);
      loadData();
    } catch (err) {
      toast.show((err as Error).message, 'error');
    }
  };

  const openEditUser = async (userId: string) => {
    setLoading(true);
    try {
      const u = await api.get<AdminUser>(`/admin/users/${userId}`);
      setEditUser(u);
      setEditForm({
        firstName: u.first_name,
        lastName: u.last_name,
        email: u.email,
        role: u.role,
        trade: u.trade || '',
        city: u.city || '',
        address: u.address || '',
        phone: u.phone || '',
        bio: u.bio || '',
        newPassword: '',
      });
    } catch (err) {
      toast.show((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const saveUser = async () => {
    if (!editUser) return;
    try {
      const payload = isAdmin
        ? editForm
        : { trade: editForm.trade };
      await api.put(`/admin/users/${editUser.id}`, payload);
      toast.show('Korisnik ažuriran', 'success');
      setEditUser(null);
      loadData();
    } catch (err) {
      toast.show((err as Error).message, 'error');
    }
  };

  if (user?.role !== 'admin' && user?.role !== 'moderator') return null;

  const statCards = stats ? [
    { label: 'Korisnici', value: stats.total_users, icon: Users, color: 'bg-blue-50 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300' },
    { label: 'Majstori', value: stats.total_providers, icon: Shield, color: 'bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300' },
    { label: 'Aktivni oglasi', value: stats.active_listings, icon: FileText, color: 'bg-green-50 text-green-600 dark:bg-green-900/40 dark:text-green-300' },
    { label: 'Na čekanju', value: stats.pending_listings, icon: BarChart3, color: 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/40 dark:text-yellow-300' },
    { label: 'Verifikacije', value: stats.pending_verifications, icon: Shield, color: 'bg-purple-50 text-purple-600 dark:bg-purple-900/40 dark:text-purple-300' },
    { label: 'SOS oglasi', value: stats.sos_listings, icon: AlertTriangle, color: 'bg-red-50 text-red-600 dark:bg-red-900/40 dark:text-red-300' },
  ] : [];

  const tabLabels: Record<string, string> = {
    dashboard: 'Pregled',
    listings: 'Oglasi',
    verifications: 'Verifikacije',
    users: 'Korisnici',
    suspensions: 'Suspendovani',
    support: 'Live podrška',
    logs: 'Logovi',
  };

  const tabs = ['dashboard', 'listings', 'verifications', 'users', 'suspensions', ...(isAdmin ? ['support', 'logs'] : [])];

  return (
    <Layout>
      <Helmet><title>Admin panel</title></Helmet>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-3xl font-bold mb-2 dark:text-white">Admin panel</h1>
        {isOwner && (
          <p className="text-sm text-brand-600 font-medium mb-8">
            Vlasnik platforme — možete menjati uloge svih korisnika uključujući administratore
          </p>
        )}
        {!isOwner && <div className="mb-8" />}

        <div className="flex gap-2 mb-8 overflow-x-auto">
          {tabs.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap ${tab === t ? 'bg-brand-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>
              {tabLabels[t] || t}
              {t === 'suspensions' && suspensions.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-xs">{suspensions.length}</span>
              )}
            </button>
          ))}
        </div>

        {tab === 'dashboard' && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {statCards.map(s => (
              <div key={s.label} className="card p-4">
                <div className={`w-10 h-10 rounded-xl ${s.color} flex items-center justify-center mb-3`}>
                  <s.icon size={20} />
                </div>
                <div className="text-2xl font-bold dark:text-white">{s.value}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {tab === 'listings' && (
          <div className="card divide-y dark:divide-gray-800">
            <div className="p-4 font-semibold dark:text-white">Oglasi na čekanju ({pendingListings.length})</div>
            {pendingListings.length === 0 ? (
              <div className="p-8 text-center text-gray-500">Nema oglasa na čekanju</div>
            ) : pendingListings.map(l => (
              <div key={l.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="font-medium dark:text-white">{l.title}</div>
                  <div className="text-sm text-gray-500">{l.first_name} {l.last_name}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link to={`/oglas/${l.id}`} className="btn-secondary text-sm py-1.5"><ExternalLink size={14} /> Pogledaj</Link>
                  <Link to={`/oglas/${l.id}/izmeni`} className="btn-secondary text-sm py-1.5"><Pencil size={14} /> Izmeni</Link>
                  <button onClick={() => approveListing(l.id, l.title)} className="p-2 bg-green-50 dark:bg-green-900/30 text-green-600 rounded-lg hover:bg-green-100" title="Odobri"><Check size={18} /></button>
                  <button onClick={() => setModerateListing({ id: l.id, title: l.title, status: 'rejected' })} className="p-2 bg-red-50 dark:bg-red-900/30 text-red-600 rounded-lg hover:bg-red-100" title="Odbij"><X size={18} /></button>
                  <button onClick={() => deleteListing(l.id)} className="p-2 bg-gray-100 dark:bg-gray-800 text-red-600 rounded-lg" title="Obriši"><Trash2 size={18} /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'verifications' && (
          <div className="card divide-y dark:divide-gray-800">
            {pendingVerifications.length === 0 ? (
              <div className="p-8 text-center text-gray-500">Nema verifikacija na čekanju</div>
            ) : pendingVerifications.map(v => (
              <div key={v.id} className="p-4 flex items-center justify-between">
                <div>
                  <div className="font-medium dark:text-white">{v.first_name} {v.last_name}</div>
                  <div className="text-sm text-gray-500">Tip: {v.type}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => reviewVerification(v.id, 'approved')} className="btn-primary text-sm py-1.5">Odobri</button>
                  <button onClick={() => reviewVerification(v.id, 'rejected')} className="btn-secondary text-sm py-1.5">Odbij</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'users' && (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="text-left p-4 dark:text-gray-300">Ime</th>
                  <th className="text-left p-4 dark:text-gray-300">Email</th>
                  <th className="text-left p-4 dark:text-gray-300">Uloga</th>
                  <th className="text-left p-4 dark:text-gray-300">Status</th>
                  <th className="text-left p-4 dark:text-gray-300">Akcije</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-800">
                {users.map(u => (
                  <tr key={u.id}>
                    <td className="p-4">
                      <Link
                        to={`/korisnik/${u.id}`}
                        className="flex items-center gap-3 group"
                      >
                        <div className="w-9 h-9 rounded-full bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center text-xs font-semibold text-brand-700 dark:text-brand-300 shrink-0 overflow-hidden">
                          {u.avatar_url
                            ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                            : `${u.first_name[0]}${u.last_name[0]}`}
                        </div>
                        <span className="font-medium text-brand-600 dark:text-brand-400 group-hover:underline">
                          {u.first_name} {u.last_name}
                        </span>
                      </Link>
                    </td>
                    <td className="p-4 dark:text-gray-300">{u.email}</td>
                    <td className="p-4">
                      <span className="badge bg-gray-100 dark:bg-gray-800 dark:text-gray-300">
                        {u.role}{u.trade ? ` · ${TRADES.find(t => t.value === u.trade)?.label || u.trade}` : ''}
                      </span>
                    </td>
                    <td className="p-4">
                      {u.is_suspended
                        ? <span className="text-red-600">Suspendovan</span>
                        : <span className="text-green-600">Aktivan</span>}
                    </td>
                    <td className="p-4">
                      {u.is_platform_owner ? (
                        <span className="text-xs text-brand-600 font-medium">
                          Vlasnik platforme{u.id === user?.id ? ' (vi)' : ''}
                        </span>
                      ) : canManageUsers && (u.role !== 'admin' || isOwner) ? (
                        <div className="flex items-center gap-3 flex-wrap">
                          <button onClick={() => openEditUser(u.id)} className="text-brand-600 hover:underline flex items-center gap-1">
                            <Pencil size={14} /> {u.role === 'admin' && isOwner ? 'Izmeni ulogu' : isAdmin ? 'Izmeni' : 'Zanimanje'}
                          </button>
                          {u.role !== 'admin' && !u.is_suspended && (
                            <button onClick={() => openSuspendModal(u)} className="text-red-600 hover:underline flex items-center gap-1">
                              <Ban size={14} /> Suspenduj
                            </button>
                          )}
                          {u.is_suspended && (
                            <button onClick={() => setTab('suspensions')} className="text-amber-600 hover:underline text-sm">
                              Pogledaj suspenziju
                            </button>
                          )}
                        </div>
                      ) : u.role === 'admin' ? (
                        <span className="text-muted text-xs">Admin nalog</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'suspensions' && (
          <div className="card overflow-x-auto">
            <div className="p-4 font-semibold dark:text-white flex items-center gap-2">
              <Ban size={18} /> Aktivne suspenzije ({suspensions.length})
            </div>
            {suspensions.length === 0 ? (
              <div className="p-8 text-center text-gray-500">Nema aktivnih suspenzija</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="text-left p-4 dark:text-gray-300">Korisnik</th>
                    <th className="text-left p-4 dark:text-gray-300">Razlog</th>
                    <th className="text-left p-4 dark:text-gray-300">Dokaz</th>
                    <th className="text-left p-4 dark:text-gray-300">Suspendovao</th>
                    <th className="text-left p-4 dark:text-gray-300">Početak</th>
                    <th className="text-left p-4 dark:text-gray-300">Ističe</th>
                    <th className="text-left p-4 dark:text-gray-300">Akcije</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-800">
                  {suspensions.map(s => (
                    <tr key={s.id}>
                      <td className="p-4 dark:text-white">
                        <div>{s.first_name} {s.last_name}</div>
                        <div className="text-xs text-muted">{s.email}</div>
                      </td>
                      <td className="p-4 dark:text-gray-300 max-w-[200px]">{s.reason}</td>
                      <td className="p-4 text-muted text-xs max-w-[150px] truncate">{s.evidence || '—'}</td>
                      <td className="p-4 dark:text-gray-300">
                        {s.suspender_first_name} {s.suspender_last_name}
                        <div className="text-xs text-muted">{s.suspended_by_role}</div>
                      </td>
                      <td className="p-4 text-muted whitespace-nowrap">{new Date(s.starts_at).toLocaleString('sr-RS')}</td>
                      <td className="p-4 text-muted whitespace-nowrap">
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          {formatSuspensionEnd(s.expires_at)}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex gap-2 flex-wrap">
                          <button onClick={() => openEditSuspension(s)} className="text-brand-600 hover:underline text-sm">Izmeni</button>
                          <button onClick={() => liftSuspension(s.id)} className="text-green-600 hover:underline text-sm">Ukloni</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'support' && isAdmin && (
          <div className="card flex flex-col lg:flex-row h-[min(720px,calc(100vh-220px))] min-h-[480px] overflow-hidden">
            <div className="w-full lg:w-80 xl:w-96 flex flex-col border-b lg:border-b-0 lg:border-r dark:border-gray-800 shrink-0 min-h-0 max-h-[40vh] lg:max-h-full">
              <div className="p-4 border-b dark:border-gray-800 shrink-0 bg-white dark:bg-gray-900 space-y-3">
                <div className="font-semibold dark:text-white flex items-center gap-2">
                  <Headphones size={18} />
                  Support razgovori ({filteredSupportHistory.length}{supportSearch.trim() ? ` / ${supportHistory.length}` : ''})
                </div>
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    type="search"
                    className="input text-sm pl-9 w-full"
                    placeholder="Pretraži po imenu ili emailu..."
                    value={supportSearch}
                    onChange={e => setSupportSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
              {supportHistory.length === 0 ? (
                <div className="p-8 text-center text-muted text-sm">Nema support razgovora</div>
              ) : filteredSupportHistory.length === 0 ? (
                <div className="p-8 text-center text-muted text-sm">Nema rezultata za &ldquo;{supportSearch}&rdquo;</div>
              ) : filteredSupportHistory.map(item => {
                const label = item.agent
                  ? `${item.user.firstName} ↔ ${item.agent.firstName}`
                  : item.user.firstName;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => loadSupportDetail(item.id)}
                    className={`w-full p-4 text-left border-b dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
                      selectedSupportId === item.id ? 'bg-brand-50 dark:bg-brand-900/30' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm dark:text-white truncate">{label}</p>
                        <p className="text-xs text-muted truncate mt-0.5">{item.initialMessage}</p>
                        <p className="text-[11px] text-muted mt-1">
                          {new Date(item.createdAt).toLocaleString('sr-RS')}
                        </p>
                      </div>
                      <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        item.status === 'closed'
                          ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                          : item.status === 'active'
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                            : 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200'
                      }`}>
                        {supportStatusLabel(item.status)}
                      </span>
                    </div>
                    {item.messageCount > 0 && (
                      <p className="text-[11px] text-brand-600 dark:text-brand-400 mt-2 flex items-center gap-1">
                        <MessageSquare size={12} /> {item.messageCount} poruka
                      </p>
                    )}
                    {item.status === 'closed' && (
                      <div className="mt-2">{renderSupportRating(item.rating, 12)}</div>
                    )}
                  </button>
                );
              })}
              </div>
            </div>

            <div className="flex-1 flex flex-col min-h-0 min-w-0">
              {!selectedSupportId ? (
                <div className="flex-1 flex items-center justify-center text-muted text-sm p-8 text-center">
                  Izaberite razgovor sa liste da vidite celu prepisku
                </div>
              ) : loadingSupportDetail ? (
                <div className="flex-1 flex items-center justify-center text-muted text-sm">Učitavanje...</div>
              ) : supportDetail ? (
                <>
                  <div className="shrink-0 p-4 border-b dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/50 max-h-[40%] overflow-y-auto overscroll-contain">
                    <p className="font-semibold dark:text-white">
                      {supportDetail.user.firstName} {supportDetail.user.lastName}
                      {supportDetail.agent && (
                        <span className="text-muted font-normal">
                          {' '}↔ {supportDetail.agent.firstName} {supportDetail.agent.lastName}
                        </span>
                      )}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-muted">
                      <span>Status: {supportStatusLabel(supportDetail.status)}</span>
                      {supportDetail.agent?.role && <RoleBadge role={supportDetail.agent.role} size="sm" />}
                      {supportDetail.claimedAt && (
                        <span>Preuzeto: {new Date(supportDetail.claimedAt).toLocaleString('sr-RS')}</span>
                      )}
                      {supportDetail.closedAt && (
                        <span>Zatvoreno: {new Date(supportDetail.closedAt).toLocaleString('sr-RS')}</span>
                      )}
                    </div>
                    {supportDetail.status === 'closed' && (
                      <div className="mt-3 p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                        <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Ocena korisnika</p>
                        {renderSupportRating(supportDetail.rating, 18)}
                        {supportDetail.ratingComment ? (
                          <p className="text-sm text-body mt-2 italic">&ldquo;{supportDetail.ratingComment}&rdquo;</p>
                        ) : supportDetail.rating ? (
                          <p className="text-xs text-muted mt-2">Korisnik nije ostavio komentar</p>
                        ) : (
                          <p className="text-xs text-muted mt-2">Korisnik nije ostavio ocenu</p>
                        )}
                        {supportDetail.ratedAt && (
                          <p className="text-[11px] text-muted mt-2">
                            Ocenjeno: {new Date(supportDetail.ratedAt).toLocaleString('sr-RS')}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <div
                    ref={supportMessagesRef}
                    className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-4 bg-gray-50/50 dark:bg-gray-950/30"
                  >
                    {supportMessages.length === 0 ? (
                      <p className="text-center text-muted text-sm">Nema poruka</p>
                    ) : supportMessages.map(msg => {
                      const fromStaff = isStaffRole(msg.sender_role);
                      return (
                        <div key={msg.id} className={`flex ${fromStaff ? 'justify-end' : 'justify-start'}`}>
                          <div className={`flex w-fit max-w-[85%] flex-col gap-1 ${fromStaff ? 'items-end' : 'items-start'}`}>
                            <div className="inline-flex items-center gap-1.5">
                              <span className="text-[11px] font-bold text-gray-800 dark:text-white">
                                {msg.first_name}
                              </span>
                              {fromStaff && <RoleBadge role={msg.sender_role} size="sm" />}
                            </div>
                            <div className={`px-3 py-2 rounded-2xl text-sm ${
                              fromStaff
                                ? 'bg-brand-600 text-white'
                                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 dark:text-gray-100'
                            }`}>
                              {msg.type === 'image' && msg.image_url ? (
                                <img src={msg.image_url} alt="" className="max-w-full rounded-lg max-h-48 object-cover mb-1" />
                              ) : null}
                              {msg.content && <p>{msg.content}</p>}
                              <p className={`text-[10px] mt-1 ${fromStaff ? 'text-brand-200' : 'text-muted'}`}>
                                {new Date(msg.created_at).toLocaleString('sr-RS')}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        )}

        {tab === 'logs' && isAdmin && (
          <div className="card overflow-x-auto">
            <div className="p-4 font-semibold dark:text-white flex items-center gap-2 border-b dark:border-gray-800">
              <ScrollText size={18} /> Aktivnost korisnika
            </div>
            <div className="p-4 border-b dark:border-gray-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              <div>
                <label className="text-xs font-medium text-muted mb-1 block">Tip aktivnosti</label>
                <select className="input text-sm" value={logFilters.action}
                  onChange={e => setLogFilters(f => ({ ...f, action: e.target.value }))}>
                  {LOG_ACTION_FILTERS.map(f => <option key={f.value || 'all'} value={f.value}>{f.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted mb-1 block">Uloga korisnika</label>
                <select className="input text-sm" value={logFilters.role}
                  onChange={e => setLogFilters(f => ({ ...f, role: e.target.value }))}>
                  {LOG_ROLE_FILTERS.map(f => <option key={f.value || 'all'} value={f.value}>{f.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted mb-1 block">Ime / email</label>
                <input className="input text-sm" placeholder="Pretraži po imenu..."
                  value={logFilters.search} onChange={e => setLogFilters(f => ({ ...f, search: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted mb-1 block">Od datuma</label>
                <input type="date" className="input text-sm" value={logFilters.dateFrom}
                  onChange={e => setLogFilters(f => ({ ...f, dateFrom: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted mb-1 block">Do datuma</label>
                <input type="date" className="input text-sm" value={logFilters.dateTo}
                  onChange={e => setLogFilters(f => ({ ...f, dateTo: e.target.value }))} />
              </div>
              <div className="flex items-end gap-2">
                <button onClick={applyLogFilters} className="btn-primary text-sm flex-1">Filtriraj</button>
                <button onClick={resetLogFilters} className="btn-secondary text-sm flex-1">Reset</button>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="text-left p-4 dark:text-gray-300">Vreme</th>
                  <th className="text-left p-4 dark:text-gray-300">Korisnik</th>
                  <th className="text-left p-4 dark:text-gray-300">Uloga</th>
                  <th className="text-left p-4 dark:text-gray-300">Tip</th>
                  <th className="text-left p-4 dark:text-gray-300">Opis</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-800">
                {logs.map(log => (
                  <tr key={log.id}>
                    <td className="p-4 text-muted whitespace-nowrap">{new Date(log.created_at).toLocaleString('sr-RS')}</td>
                    <td className="p-4 dark:text-white">{log.first_name} {log.last_name}</td>
                    <td className="p-4"><span className="badge bg-gray-100 dark:bg-gray-800">{log.user_role}</span></td>
                    <td className="p-4 dark:text-gray-300 whitespace-nowrap">{log.action_label || log.action}</td>
                    <td className="p-4 text-body text-sm max-w-xl">{log.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {logs.length === 0 && <div className="p-8 text-center text-muted">Nema logova za izabrane filtere</div>}
            {logTotalPages > 1 && (
              <div className="p-4 flex items-center justify-center gap-3 border-t dark:border-gray-800">
                <button disabled={logPage <= 1} onClick={() => loadLogs(logPage - 1)}
                  className="btn-secondary text-sm disabled:opacity-50">Prethodna</button>
                <span className="text-sm text-muted">Strana {logPage} / {logTotalPages}</span>
                <button disabled={logPage >= logTotalPages} onClick={() => loadLogs(logPage + 1)}
                  className="btn-secondary text-sm disabled:opacity-50">Sledeća</button>
              </div>
            )}
          </div>
        )}
      </div>

      <Modal open={!!moderateListing} onClose={() => { setModerateListing(null); setModerationNote(''); }}
        title="Odbij oglas">
        <div className="space-y-4">
          <p className="text-body text-sm">{moderateListing?.title}</p>
          <div>
            <label className="text-sm font-medium text-body mb-1 block">Obrazloženje odbijanja *</label>
            <textarea className="input min-h-[100px]" placeholder="Unesite razlog odbijanja..."
              value={moderationNote} onChange={e => setModerationNote(e.target.value)} required />
          </div>
          <div className="flex gap-3">
            <button onClick={submitModeration} disabled={!moderationNote.trim()} className="btn-danger flex-1">
              Odbij
            </button>
            <button onClick={() => { setModerateListing(null); setModerationNote(''); }} className="btn-secondary flex-1">Otkaži</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!suspendTarget} onClose={() => setSuspendTarget(null)} title="Suspenduj nalog">
        {suspendTarget && (
          <div className="space-y-4">
            <p className="text-sm text-body">
              Suspendujete: <strong>{suspendTarget.first_name} {suspendTarget.last_name}</strong> ({suspendTarget.email})
            </p>
            <div>
              <label className="text-sm font-medium text-body mb-1 block">Razlog suspenzije *</label>
              <textarea className="input min-h-[80px]" placeholder="Opišite razlog..."
                value={suspendForm.reason} onChange={e => setSuspendForm(f => ({ ...f, reason: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium text-body mb-1 block">Trajanje</label>
              <select className="input" value={suspendForm.duration} onChange={e => setSuspendForm(f => ({ ...f, duration: e.target.value }))}>
                {DURATION_PRESETS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-body mb-1 block">Dokaz / napomena</label>
              <textarea className="input min-h-[60px]" placeholder="Link, screenshot opis, reference..."
                value={suspendForm.evidence} onChange={e => setSuspendForm(f => ({ ...f, evidence: e.target.value }))} />
            </div>
            <div className="flex gap-3">
              <button onClick={submitSuspend} disabled={!suspendForm.reason.trim()} className="btn-danger flex-1">Suspenduj</button>
              <button onClick={() => setSuspendTarget(null)} className="btn-secondary flex-1">Otkaži</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!editSuspension} onClose={() => setEditSuspension(null)} title="Izmena suspenzije">
        {editSuspension && (
          <div className="space-y-4">
            <p className="text-sm text-body">
              {editSuspension.first_name} {editSuspension.last_name} — suspendovao {editSuspension.suspender_first_name} {editSuspension.suspender_last_name}
            </p>
            <div>
              <label className="text-sm font-medium text-body mb-1 block">Razlog</label>
              <textarea className="input min-h-[80px]" value={editSuspensionForm.reason}
                onChange={e => setEditSuspensionForm(f => ({ ...f, reason: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium text-body mb-1 block">Produži / promeni trajanje</label>
              <select className="input" value={editSuspensionForm.duration}
                onChange={e => setEditSuspensionForm(f => ({ ...f, duration: e.target.value }))}>
                {DURATION_PRESETS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
              <p className="text-xs text-muted mt-1">Novo trajanje se računa od danas.</p>
            </div>
            <div>
              <label className="text-sm font-medium text-body mb-1 block">Dokaz</label>
              <textarea className="input min-h-[60px]" value={editSuspensionForm.evidence}
                onChange={e => setEditSuspensionForm(f => ({ ...f, evidence: e.target.value }))} />
            </div>
            <div className="flex gap-3">
              <button onClick={saveSuspensionEdit} className="btn-primary flex-1">Sačuvaj</button>
              <button onClick={() => liftSuspension(editSuspension.id)} className="btn-secondary flex-1 text-green-600">Ukloni suspenziju</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!editUser} onClose={() => setEditUser(null)} title={isAdmin ? 'Izmena korisnika' : 'Promena zanimanja'}>
        {loading ? (
          <div className="py-8 text-center text-gray-500">Učitavanje...</div>
        ) : (
          <div className="space-y-4">
            {isAdmin ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Ime</label>
                    <input className="input" value={editForm.firstName} onChange={e => setEditForm(f => ({ ...f, firstName: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Prezime</label>
                    <input className="input" value={editForm.lastName} onChange={e => setEditForm(f => ({ ...f, lastName: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Email</label>
                  <input type="email" className="input" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Nova lozinka</label>
                  <input type="password" className="input" placeholder="Ostavite prazno ako ne menjate"
                    value={editForm.newPassword} onChange={e => setEditForm(f => ({ ...f, newPassword: e.target.value }))} />
                </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Uloga</label>
              <select className="input" value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}
                disabled={editUser?.is_platform_owner}>
                {ROLES.filter(r => r.value !== 'admin' || isOwner).map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              {editUser?.is_platform_owner && (
                <p className="text-xs text-muted mt-1">Uloga vlasnika platforme se ne može menjati.</p>
              )}
              {!isOwner && !editUser?.is_platform_owner && (
                <p className="text-xs text-muted mt-1">Samo vlasnik platforme može dodeliti ili ukloniti admin ulogu.</p>
              )}
            </div>
              </>
            ) : (
              <p className="text-sm text-muted">
                Korisnik: <strong>{editUser?.first_name} {editUser?.last_name}</strong>
              </p>
            )}
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Zanimanje / struka</label>
              <select className="input" value={editForm.trade} onChange={e => setEditForm(f => ({ ...f, trade: e.target.value }))}>
                <option value="">— Nije dodeljeno —</option>
                {TRADES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {isAdmin && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Grad</label>
                    <input className="input" value={editForm.city} onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Telefon</label>
                    <input className="input" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Adresa</label>
                  <input className="input" value={editForm.address} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Bio</label>
                  <textarea className="input min-h-[80px]" value={editForm.bio} onChange={e => setEditForm(f => ({ ...f, bio: e.target.value }))} />
                </div>
              </>
            )}
            <div className="flex gap-3 pt-2">
              <button onClick={saveUser} className="btn-primary flex-1">Sačuvaj</button>
              <button onClick={() => setEditUser(null)} className="btn-secondary flex-1">Otkaži</button>
            </div>
          </div>
        )}
      </Modal>
    </Layout>
  );
}

