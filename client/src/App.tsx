import { useCallback, useEffect, useRef, useState } from 'react';
import { Routes, Route, useNavigate, Link } from 'react-router-dom';
import { Headphones, ChevronUp, ChevronDown, Loader2, X, Send, Star } from 'lucide-react';
import clsx from 'clsx';
import { format } from 'date-fns';
import { useAuthStore } from './store/authStore';
import { api } from './services/api';
import { getSocket } from './services/socket';
import { ToastContainer, useToast } from './components/ui/Toast';
import { RoleBadge } from './components/ui/Badges';
import HomePage from './pages/HomePage';
import ListingsPage from './pages/ListingsPage';
import ListingDetailPage from './pages/ListingDetailPage';
import CreateListingPage from './pages/CreateListingPage';
import EditListingPage from './pages/EditListingPage';
import LoginPage, { RegisterPage, AuthCallbackPage, ForgotPasswordPage, ResetPasswordPage } from './pages/AuthPages';
import MessagesPage from './pages/MessagesPage';
import ForumPage, { ForumTopicPage, NewForumTopicPage } from './pages/ForumPage';
import MapPage from './pages/MapPage';
import SOSPage from './pages/SOSPage';
import ProfilePage from './pages/ProfilePage';
import UserProfilePage from './pages/UserProfilePage';
import AdminPage from './pages/AdminPage';
import { RequireAuth } from './components/auth/RequireAuth';
import { AboutPage, TermsPage, PrivacyPage, ContactPage } from './pages/StaticPages';

interface SupportRequest {
  id: string;
  status: 'waiting' | 'active' | 'closed';
  initialMessage: string;
  conversationId: string | null;
  agent?: { firstName: string; lastName: string; role?: string };
}

interface SupportChatMessage {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  first_name?: string;
  sender_role?: string;
}

interface SupportQueueItem {
  id: string;
  userId: string;
  initialMessage: string;
  createdAt: string;
  user?: { firstName: string; lastName: string };
}

const SUPPORT_STAFF_ROLES = ['admin', 'moderator', 'podrska'];

function normalizeSupportMessage(m: Record<string, unknown>): SupportChatMessage {
  return {
    id: String(m.id),
    sender_id: String(m.sender_id || m.senderId || ''),
    content: String(m.content || ''),
    created_at: String(m.created_at || m.createdAt || ''),
    first_name: m.first_name as string | undefined,
    sender_role: (m.sender_role || m.senderRole) as string | undefined,
  };
}

function isSupportStaffRole(role?: string | null) {
  return Boolean(role && SUPPORT_STAFF_ROLES.includes(role));
}

function StarPicker({
  value,
  onChange,
  size = 28,
}: {
  value: number;
  onChange: (n: number) => void;
  size?: number;
}) {
  return (
    <div className="flex items-center justify-center gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className="p-0.5 transition-transform hover:scale-110"
          aria-label={`${n} zvezdica`}
        >
          <Star
            size={size}
            className={n <= value ? 'fill-amber-400 text-amber-400' : 'text-gray-300 dark:text-gray-600'}
          />
        </button>
      ))}
    </div>
  );
}

function SupportChatWidget() {
  const { user } = useAuthStore();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState<SupportRequest | null>(null);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<SupportChatMessage[]>([]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ratingTargetId, setRatingTargetId] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const activeConversationIdRef = useRef<string | null>(null);

  const appendMessage = useCallback((raw: Record<string, unknown>) => {
    const convId = String(raw.conversation_id || raw.conversationId || activeConversationIdRef.current || '');
    if (activeConversationIdRef.current && convId !== activeConversationIdRef.current) return;
    const normalized = normalizeSupportMessage(raw);
    setMessages(prev => (prev.some(m => m.id === normalized.id) ? prev : [...prev, normalized]));
  }, []);

  const loadMine = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.get<{ request: SupportRequest | null }>('/support/mine');
      setRequest(res.request);
      if (res.request?.status === 'active' && res.request.conversationId) {
        activeConversationIdRef.current = res.request.conversationId;
        const msgs = await api.get<Record<string, unknown>[]>(`/messages/${res.request.conversationId}/messages`);
        setMessages(msgs.map(normalizeSupportMessage));
        getSocket().emit('conversation:join', res.request.conversationId);
      } else {
        activeConversationIdRef.current = null;
      }
    } catch {
      /* ignore */
    }
  }, [user]);

  useEffect(() => { loadMine(); }, [loadMine]);

  useEffect(() => {
    if (!user) {
      setRequest(null);
      setMessages([]);
      setRatingTargetId(null);
      setRating(0);
      setRatingComment('');
      activeConversationIdRef.current = null;
    }
  }, [user]);

  useEffect(() => {
    activeConversationIdRef.current = request?.conversationId ?? null;
    if (request?.conversationId && request.status === 'active') {
      getSocket().emit('conversation:join', request.conversationId);
    }
  }, [request?.conversationId, request?.status]);

  useEffect(() => {
    if (!user) return;
    const socket = getSocket();

    const onClaimed = (data: { conversationId: string; agentName: string; agentRole?: string }) => {
      setRequest(prev => prev ? {
        ...prev,
        status: 'active',
        conversationId: data.conversationId,
        agent: {
          firstName: data.agentName.split(' ')[0] || data.agentName,
          lastName: data.agentName.split(' ').slice(1).join(' ') || '',
          role: data.agentRole,
        },
      } : prev);
      if (data.conversationId) {
        activeConversationIdRef.current = data.conversationId;
        socket.emit('conversation:join', data.conversationId);
        api.get<Record<string, unknown>[]>(`/messages/${data.conversationId}/messages`)
          .then(msgs => setMessages(msgs.map(normalizeSupportMessage)))
          .catch(() => {});
      }
    };

    const onMessage = (msg: Record<string, unknown>) => {
      appendMessage(msg);
    };

    const onClosed = (data: { requestId?: string; askRating?: boolean }) => {
      setRequest(prev => {
        if (!prev) return prev;
        if (data.requestId && data.requestId !== prev.id) return prev;
        if (data.askRating && prev.status === 'active') {
          setRatingTargetId(prev.id);
          setRating(0);
          setRatingComment('');
          setOpen(true);
        }
        return null;
      });
      setMessages([]);
      setReply('');
      activeConversationIdRef.current = null;
    };

    socket.on('support:claimed', onClaimed);
    socket.on('message:new', onMessage);
    socket.on('support:closed', onClosed);
    return () => {
      socket.off('support:claimed', onClaimed);
      socket.off('message:new', onMessage);
      socket.off('support:closed', onClosed);
    };
  }, [user, appendMessage]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const submitRequest = async () => {
    if (!user || draft.trim().length < 3) return;
    setLoading(true);
    try {
      const res = await api.post<{ request: SupportRequest }>('/support/request', { message: draft.trim() });
      setRequest(res.request);
      setDraft('');
    } catch (err) {
      toast.show((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const sendReply = async () => {
    if (!user || !request?.conversationId || !reply.trim()) return;
    const content = reply.trim();
    setSending(true);
    try {
      const saved = await api.post<Record<string, unknown>>(`/messages/${request.conversationId}/messages`, { content });
      appendMessage({
        ...saved,
        conversation_id: request.conversationId,
        sender_id: saved.sender_id || user.id,
        first_name: saved.first_name || user.firstName,
        sender_role: saved.sender_role || user.role,
      });
      setReply('');
    } catch (err) {
      toast.show((err as Error).message, 'error');
    } finally {
      setSending(false);
    }
  };

  const closeChat = async () => {
    if (!request) return;
    const id = request.id;
    const wasActive = request.status === 'active';
    try {
      const res = await api.post<{ askRating?: boolean }>(`/support/${id}/close`, {});
      setMessages([]);
      setReply('');
      if (res.askRating && wasActive) {
        setRatingTargetId(id);
        setRequest(null);
        setRating(0);
        setRatingComment('');
      } else {
        setRequest(null);
        setRatingTargetId(null);
        setOpen(false);
      }
    } catch {
      setRequest(null);
      setRatingTargetId(null);
      setOpen(false);
    }
  };

  const submitRating = async () => {
    if (!ratingTargetId || rating < 1) {
      toast.show('Izaberite broj zvezdica', 'error');
      return;
    }
    setSubmittingRating(true);
    try {
      await api.post(`/support/${ratingTargetId}/rate`, {
        rating,
        comment: ratingComment.trim() || undefined,
      });
      toast.show('Hvala na povratnoj informaciji!', 'success');
      setRatingTargetId(null);
      setRating(0);
      setRatingComment('');
      setOpen(false);
    } catch (err) {
      toast.show((err as Error).message, 'error');
    } finally {
      setSubmittingRating(false);
    }
  };

  const skipRating = () => {
    setRatingTargetId(null);
    setRating(0);
    setRatingComment('');
    setOpen(false);
  };

  const agentName = request?.agent
    ? `${request.agent.firstName} ${request.agent.lastName}`.trim()
    : null;

  if (user && SUPPORT_STAFF_ROLES.includes(user.role)) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="w-[min(100vw-2rem,380px)] h-[min(70vh,520px)] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden animate-slide-up">
          {ratingTargetId ? (
            <>
              <div className="flex items-center justify-between px-4 py-3 bg-brand-600 text-white">
                <div className="flex items-center gap-2">
                  <Headphones size={18} />
                  <p className="font-semibold text-sm">Ocenite uslugu</p>
                </div>
                <button type="button" onClick={skipRating} className="p-1 hover:bg-brand-500 rounded-lg">
                  <X size={18} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center text-center gap-5">
                <div>
                  <p className="font-semibold text-base dark:text-white mb-1">Koliko ste zadovoljni podrškom?</p>
                  <p className="text-sm text-muted">Vaša ocena nam pomaže da budemo bolji</p>
                </div>
                <StarPicker value={rating} onChange={setRating} />
                <textarea
                  className="input min-h-[100px] resize-none text-sm w-full"
                  placeholder="Opcioni komentar..."
                  value={ratingComment}
                  onChange={e => setRatingComment(e.target.value)}
                />
                <div className="flex flex-col gap-2 w-full">
                  <button
                    type="button"
                    onClick={submitRating}
                    disabled={submittingRating || rating < 1}
                    className="btn-primary w-full text-sm"
                  >
                    {submittingRating ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Pošalji ocenu'}
                  </button>
                  <button type="button" onClick={skipRating} className="text-xs text-muted hover:text-body">
                    Preskoči
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
          <div className="flex items-center justify-between px-4 py-3 bg-brand-600 text-white">
            <div className="flex items-center gap-2">
              <Headphones size={18} />
              <div>
                <p className="font-semibold text-sm">{'Live podr\u0161ka'}</p>
                {request?.status === 'active' && agentName && (
                  <p className="text-xs text-brand-100 flex items-center gap-1.5 flex-wrap">
                    <span>Agent: {request.agent?.firstName || agentName}</span>
                    {request.agent?.role && <RoleBadge role={request.agent.role} size="sm" />}
                  </p>
                )}
              </div>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="p-1 hover:bg-brand-500 rounded-lg">
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 bg-gray-50 dark:bg-gray-950/50">
            {!user ? (
              <div className="text-center text-sm text-muted py-8">
                <p className="mb-4">{'Prijavite se da biste kontaktirali podr\u0161ku.'}</p>
                <Link to="/prijava" className="btn-primary text-sm">Prijava</Link>
              </div>
            ) : !request ? (
              <div className="space-y-3">
                <p className="text-sm text-muted">Opisite problem i agent ce vam uskoro odgovoriti.</p>
                <textarea
                  className="input min-h-[120px] resize-none text-sm"
                  placeholder="Na primer: Imam problem sa oglasom..."
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                />
                <button
                  type="button"
                  onClick={submitRequest}
                  disabled={loading || draft.trim().length < 3}
                  className="btn-primary w-full text-sm"
                >
                  {loading ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Po\u0161alji zahtev'}
                </button>
              </div>
            ) : request.status === 'waiting' ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Loader2 size={32} className="animate-spin text-brand-600 mb-4" />
                <p className="font-medium text-sm">{'\u010cekamo slobodnog agenta...'}</p>
                <p className="text-xs text-muted mt-2 max-w-[240px]">{'Va\u0161a poruka: ' + request.initialMessage}</p>
                <button
                  type="button"
                  onClick={closeChat}
                  className="mt-6 text-xs text-muted hover:text-body underline"
                >
                  Otkaži zahtev
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map(msg => {
                  const isOwn = user && msg.sender_id === user.id;
                  const isStaffMsg = !isOwn && isSupportStaffRole(msg.sender_role);
                  const staffName = msg.first_name || request?.agent?.firstName;
                  return (
                    <div key={msg.id} className={clsx('flex', isOwn ? 'justify-end' : 'justify-start')}>
                      <div className={clsx('flex w-fit max-w-[85%] flex-col gap-1', isOwn ? 'items-end' : 'items-start')}>
                        {isStaffMsg && (
                          <div className="inline-flex items-center gap-1.5">
                            <span className="text-[11px] font-bold leading-none text-gray-800 dark:text-white">
                              {staffName}
                            </span>
                            <RoleBadge role={msg.sender_role} size="sm" />
                          </div>
                        )}
                        <div className={clsx(
                          'px-3 py-2 rounded-2xl text-sm',
                          isOwn ? 'bg-brand-600 text-white' : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
                        )}>
                          <p>{msg.content}</p>
                          <p className={clsx('text-[10px] mt-1', isOwn ? 'text-brand-200' : 'text-muted')}>
                            {format(new Date(msg.created_at), 'HH:mm')}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {user && request?.status === 'active' && (
            <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
              <div className="flex gap-2">
                <input
                  className="input text-sm flex-1"
                  placeholder={'Napi\u0161i poruku...'}
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendReply())}
                />
                <button type="button" onClick={sendReply} disabled={sending || !reply.trim()} className="btn-primary px-3">
                  <Send size={16} />
                </button>
              </div>
              <button
                type="button"
                onClick={closeChat}
                className="mt-2 w-full py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/80 transition-colors"
              >
                {'Zavr\u0161i razgovor'}
              </button>
            </div>
          )}
            </>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-4 py-3 rounded-full bg-brand-600 text-white shadow-lg hover:bg-brand-500 transition-colors font-medium text-sm"
      >
        <Headphones size={20} />
        {!open && 'Podr\u0161ka'}
        {request?.status === 'waiting' && (
          <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
        )}
      </button>
    </div>
  );
}

function SupportStaffPanel() {
  const { user } = useAuthStore();
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [queue, setQueue] = useState<SupportQueueItem[]>([]);
  const [claiming, setClaiming] = useState<string | null>(null);

  const isStaff = user && SUPPORT_STAFF_ROLES.includes(user.role);

  const loadQueue = useCallback(async () => {
    if (!isStaff) return;
    try {
      const res = await api.get<{ queue: SupportQueueItem[] }>('/support/queue');
      setQueue(res.queue);
    } catch {
      /* ignore */
    }
  }, [isStaff]);

  useEffect(() => {
    loadQueue();
    if (!isStaff) return;
    const socket = getSocket();
    const refresh = () => loadQueue();
    socket.on('notification:support_request', refresh);
    socket.on('support:request_claimed', refresh);
    const interval = setInterval(loadQueue, 30000);
    return () => {
      socket.off('notification:support_request', refresh);
      socket.off('support:request_claimed', refresh);
      clearInterval(interval);
    };
  }, [isStaff, loadQueue]);

  const claim = async (id: string) => {
    setClaiming(id);
    try {
      const res = await api.post<{ request: { conversationId: string } }>(`/support/${id}/claim`, {});
      toast.show('Zahtev preuzet', 'success');
      setOpen(false);
      if (res.request.conversationId) {
        navigate(`/poruke/${res.request.conversationId}`);
      }
      loadQueue();
    } catch (err) {
      toast.show((err as Error).message, 'error');
    } finally {
      setClaiming(null);
    }
  };

  if (!isStaff) return null;

  return (
    <div className="fixed bottom-6 left-6 z-50">
      {open && (
        <div className="mb-3 w-[min(100vw-3rem,360px)] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-slide-up">
          <div className="px-4 py-3 bg-amber-500 text-amber-950 font-semibold text-sm flex items-center gap-2">
            <Headphones size={16} />
            {'Red \u010dekanja (' + queue.length + ')'}
          </div>
          <div className="max-h-72 overflow-y-auto">
            {queue.length === 0 ? (
              <p className="p-4 text-sm text-muted text-center">{'Nema zahteva na \u010dekanju'}</p>
            ) : queue.map(item => (
              <div key={item.id} className="p-4 border-b border-gray-100 dark:border-gray-800 last:border-0">
                <p className="font-medium text-sm">
                  {item.user ? `${item.user.firstName} ${item.user.lastName}` : 'Korisnik'}
                </p>
                <p className="text-xs text-muted mt-1 line-clamp-2">{item.initialMessage}</p>
                <button
                  type="button"
                  onClick={() => claim(item.id)}
                  disabled={claiming === item.id}
                  className="mt-2 btn-primary text-xs w-full"
                >
                  {claiming === item.id ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Preuzmi'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={clsx(
          'flex items-center gap-2 px-4 py-3 rounded-full shadow-lg font-medium text-sm transition-colors',
          queue.length > 0
            ? 'bg-amber-500 text-amber-950 hover:bg-amber-400 animate-pulse'
            : 'bg-gray-800 dark:bg-gray-700 text-white hover:bg-gray-700'
        )}
      >
        <Headphones size={18} />
        {'Podr\u0161ka'}
        {queue.length > 0 && (
          <span className="min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
            {queue.length}
          </span>
        )}
        {open ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
      </button>
    </div>
  );
}

function App() {
  const { fetchUser } = useAuthStore();

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  return (
    <>
      <ToastContainer />
      <SupportChatWidget />
      <SupportStaffPanel />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/oglasi" element={<ListingsPage />} />
        <Route path="/oglas/:id" element={<ListingDetailPage />} />
        <Route path="/oglas/:id/izmeni" element={<EditListingPage />} />
        <Route path="/objavi" element={<CreateListingPage />} />
        <Route path="/prijava" element={<LoginPage />} />
        <Route path="/registracija" element={<RegisterPage />} />
        <Route path="/zaboravljena-lozinka" element={<ForgotPasswordPage />} />
        <Route path="/reset-lozinke" element={<ResetPasswordPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/poruke" element={<MessagesPage />} />
        <Route path="/poruke/:conversationId" element={<MessagesPage />} />
        <Route path="/forum" element={<ForumPage />} />
        <Route path="/forum/nova-tema" element={<NewForumTopicPage />} />
        <Route path="/forum/:id" element={<ForumTopicPage />} />
        <Route path="/mapa" element={<MapPage />} />
        <Route path="/hitno" element={<RequireAuth><SOSPage /></RequireAuth>} />
        <Route path="/profil" element={<ProfilePage />} />
        <Route path="/korisnik/:id" element={<UserProfilePage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/o-nama" element={<AboutPage />} />
        <Route path="/uslovi" element={<TermsPage />} />
        <Route path="/privatnost" element={<PrivacyPage />} />
        <Route path="/kontakt" element={<ContactPage />} />
      </Routes>
    </>
  );
}

export default App;
