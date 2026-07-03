import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import {
  Users, FileText, Shield, AlertTriangle, Check, X, BarChart3, Pencil, ScrollText, Trash2, ExternalLink, Ban, Clock
} from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { Modal } from '../components/ui/Modal';
import { useAuthStore } from '../store/authStore';
import { api } from '../services/api';
import { useNavigate, Link } from 'react-router-dom';
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

const ROLES = [
  { value: 'user', label: 'Korisnik' },
  { value: 'provider', label: 'Pružalac usluga' },
  { value: 'moderator', label: 'Moderator' },
  { value: 'admin', label: 'Admin' },
];

const DURATION_PRESETS = [
  { value: '7', label: '7 dana' },
  { value: '14', label: '14 dana' },
  { value: '30', label: '30 dana' },
  { value: '90', label: '90 dana' },
  { value: 'permanent', label: 'Trajno' },
];

function formatSuspensionEnd(expiresAt: string | null) {
  if (!expiresAt) return 'Trajno';
  return new Date(expiresAt).toLocaleString('sr-RS');
}

export default function AdminPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
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
  const [suspendTarget, setSuspendTarget] = useState<AdminUser | null>(null);
  const [suspendForm, setSuspendForm] = useState({ reason: '', evidence: '', duration: '7' });
  const [editSuspension, setEditSuspension] = useState<SuspensionRecord | null>(null);
  const [editSuspensionForm, setEditSuspensionForm] = useState({ reason: '', evidence: '', duration: '7' });

  const isAdmin = user?.role === 'admin';
  const isOwner = Boolean(user?.isPlatformOwner);
  const canManageUsers = isAdmin || user?.role === 'moderator';

  useEffect(() => {
    if (user?.role !== 'admin' && user?.role !== 'moderator') { navigate('/'); return; }
    loadData();
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, [user, navigate]);

  const loadData = async () => {
    try {
      const requests: Promise<unknown>[] = [
        api.get<AdminStats>('/admin/stats'),
        api.get<{ listings: typeof pendingListings }>('/admin/listings/pending'),
        api.get<typeof pendingVerifications>('/admin/verifications/pending'),
        api.get<AdminUser[]>('/admin/users'),
        api.get<{ suspensions: SuspensionRecord[] }>('/admin/suspensions'),
      ];
      if (isAdmin) {
        requests.push(api.get<{ logs: typeof logs }>('/admin/logs'));
      }
      const results = await Promise.all(requests);
      setStats(results[0] as AdminStats);
      setPendingListings((results[1] as { listings: typeof pendingListings }).listings || []);
      setPendingVerifications(results[2] as typeof pendingVerifications);
      setUsers(results[3] as AdminUser[]);
      setSuspensions((results[4] as { suspensions: SuspensionRecord[] }).suspensions || []);
      if (isAdmin && results[5]) setLogs((results[5] as { logs: typeof logs }).logs || []);
    } catch (err) {
      toast.show((err as Error).message || 'Greška pri učitavanju admin podataka', 'error');
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
    logs: 'Logovi',
  };

  const tabs = ['dashboard', 'listings', 'verifications', 'users', 'suspensions', ...(isAdmin ? ['logs'] : [])];

  return (
    <Layout>
      <Helmet><title>Admin panel</title></Helmet>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-3xl font-bold mb-8 dark:text-white">Admin panel</h1>

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
                    <td className="p-4 dark:text-white">{u.first_name} {u.last_name}</td>
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
                      {canManageUsers && u.role !== 'admin' && !u.is_platform_owner && (
                        <div className="flex items-center gap-3 flex-wrap">
                          <button onClick={() => openEditUser(u.id)} className="text-brand-600 hover:underline flex items-center gap-1">
                            <Pencil size={14} /> {isAdmin ? 'Izmeni' : 'Zanimanje'}
                          </button>
                          {!u.is_suspended && (
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
                      )}
                      {u.is_platform_owner && <span className="text-xs text-brand-600 font-medium">Vlasnik platforme</span>}
                      {u.role === 'admin' && !u.is_platform_owner && <span className="text-muted text-xs">Admin nalog</span>}
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

        {tab === 'logs' && isAdmin && (
          <div className="card overflow-x-auto">
            <div className="p-4 font-semibold dark:text-white flex items-center gap-2">
              <ScrollText size={18} /> Aktivnost korisnika
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="text-left p-4 dark:text-gray-300">Vreme</th>
                  <th className="text-left p-4 dark:text-gray-300">Korisnik</th>
                  <th className="text-left p-4 dark:text-gray-300">Uloga</th>
                  <th className="text-left p-4 dark:text-gray-300">Opis aktivnosti</th>
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
            {logs.length === 0 && <div className="p-8 text-center text-muted">Nema logova</div>}
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
                disabled={editUser?.role === 'admin' && !isOwner && editForm.role === 'admin'}>
                {ROLES.filter(r => r.value !== 'admin' || isOwner).map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              {!isOwner && <p className="text-xs text-muted mt-1">Samo vlasnik platforme može dodeliti admin ulogu.</p>}
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

