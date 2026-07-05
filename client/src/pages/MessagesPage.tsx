import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Send, Image, ArrowLeft, ExternalLink, Users, Trash2, Headphones, ChevronDown } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { RoleBadge } from '../components/ui/Badges';
import { useAuthStore } from '../store/authStore';
import { api } from '../services/api';
import { getSocket } from '../services/socket';
import { useToast } from '../components/ui/Toast';
import { format } from 'date-fns';

interface Conversation {
  id: string;
  is_staff_room?: boolean;
  other_participant_count?: number;
  participants: { id: string; firstName: string; lastName: string; avatarUrl?: string; isOnline?: boolean; role?: string }[];
  last_message?: { content: string; created_at: string; type?: string };
  unread_count: number;
}

interface Message {
  id: string;
  sender_id: string;
  content: string;
  type: string;
  image_url?: string;
  created_at: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
  sender_role?: string;
}

interface StaffMember {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
  is_online: boolean;
  avatar_url?: string | null;
}

interface ActiveSupportChat {
  id: string;
  conversationId: string | null;
  user?: { firstName: string; lastName: string; avatarUrl?: string | null };
  lastMessage?: { content: string; type?: string };
  unreadCount: number;
}

interface SupportRequestMeta {
  id: string;
  status: 'waiting' | 'active' | 'closed';
  claimedAt: string | null;
  agentId: string | null;
}

function isStaffRoomConv(conv: { is_staff_room?: boolean | string | null }) {
  return conv.is_staff_room === true || conv.is_staff_room === 'true';
}

function isMemberOnline(member: StaffMember, currentUserId?: string) {
  if (currentUserId && member.id === currentUserId) return true;
  return member.is_online === true || (member.is_online as unknown) === 'true';
}

function isSystemParticipant(p?: { firstName?: string; lastName?: string }) {
  return p?.firstName === 'Završi Mi' && p?.lastName === 'Sistem';
}

function displayParticipant(p?: { firstName?: string; lastName?: string }) {
  if (!p) return 'Korisnik';
  if (isSystemParticipant(p)) return 'Završi Mi — sistem';
  return `${p.firstName} ${p.lastName}`;
}

function formatLastMessagePreview(lastMessage?: { content: string; type?: string }) {
  if (!lastMessage?.content) return 'Nema poruka';

  if (lastMessage.type === 'listing_alert') {
    try {
      const data = JSON.parse(lastMessage.content) as { preview?: string; title?: string; city?: string };
      if (data.preview) return data.preview;
      if (data.title) return `🚨 HITAN OGLAS: ${data.title}${data.city ? ` — ${data.city}` : ''}`;
    } catch {
      /* fallback */
    }
    return '🚨 HITAN OGLAS';
  }

  if (lastMessage.type === 'image') return '📷 Slika';

  return lastMessage.content;
}

function normalizeMessage(raw: Record<string, unknown>): Message {
  return {
    id: String(raw.id),
    sender_id: String(raw.sender_id || raw.senderId || ''),
    content: String(raw.content || ''),
    type: String(raw.type || 'text'),
    image_url: (raw.image_url || raw.imageUrl) as string | undefined,
    created_at: String(raw.created_at || raw.createdAt || new Date().toISOString()),
    first_name: raw.first_name as string | undefined,
    last_name: raw.last_name as string | undefined,
    avatar_url: (raw.avatar_url || raw.avatarUrl) as string | undefined,
    sender_role: (raw.sender_role || raw.senderRole) as string | undefined,
  };
}

function ChatAvatar({
  avatarUrl,
  firstName,
  lastName,
  size = 'md',
}: {
  avatarUrl?: string | null;
  firstName?: string;
  lastName?: string;
  size?: 'sm' | 'md';
}) {
  const dim = size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-8 h-8 text-xs';
  return (
    <div className={`${dim} rounded-full bg-brand-100 dark:bg-brand-900 flex items-center justify-center text-brand-700 dark:text-brand-300 font-medium overflow-hidden shrink-0`}>
      {avatarUrl
        ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
        : <>{firstName?.[0]}{lastName?.[0]}</>}
    </div>
  );
}

function parseListingAlert(content: string, imageUrl?: string) {
  try {
    const data = JSON.parse(content) as { listingId: string; title: string; city: string; preview?: string };
    return { ...data, imageUrl };
  } catch {
    return null;
  }
}

function MessageBubble({
  msg,
  isOwn,
  isStaffRoom,
  canDelete,
  onDelete,
  avatarUrl,
  firstName,
  lastName,
  senderRole,
}: {
  msg: Message;
  isOwn: boolean;
  isStaffRoom?: boolean;
  canDelete?: boolean;
  onDelete?: () => void;
  avatarUrl?: string | null;
  firstName?: string;
  lastName?: string;
  senderRole?: string | null;
}) {
  const alert = msg.type === 'listing_alert' ? parseListingAlert(msg.content, msg.image_url) : null;
  const displayName = firstName || msg.first_name || 'Korisnik';
  const role = senderRole || msg.sender_role;
  const isStaffSender = role === 'admin' || role === 'moderator' || role === 'podrska';
  const showStaffHeader = Boolean((isStaffRoom || isStaffSender) && (role || displayName));

  if (alert) {
    return (
      <div className={`flex items-end gap-2 max-w-full ${isOwn ? 'flex-row-reverse' : ''}`}>
        <ChatAvatar avatarUrl={avatarUrl} firstName={firstName} lastName={lastName} />
        <div className={`max-w-[85%] sm:max-w-[340px] rounded-2xl overflow-hidden border shadow-sm ${
          isOwn ? 'border-brand-400 bg-brand-600 text-white' : 'border-red-200 dark:border-red-900/50 bg-white dark:bg-gray-800'
        }`}>
        {alert.imageUrl && (
          <img src={alert.imageUrl} alt="" className="w-full h-40 object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        )}
        <div className="p-4">
          <div className={`inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide mb-2 px-2 py-1 rounded-md ${
            isOwn ? 'bg-red-500/30 text-red-100' : 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300'
          }`}>
            🚨 HITAN OGLAS
          </div>
          <div className={`font-semibold text-base mb-1 ${isOwn ? 'text-white' : 'dark:text-white'}`}>{alert.title}</div>
          <div className={`text-sm mb-4 flex items-center gap-1 ${isOwn ? 'text-brand-100' : 'text-muted'}`}>
            📍 {alert.city}
          </div>
          <Link to={`/oglas/${alert.listingId}`}
            className={`inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg transition-opacity hover:opacity-90 ${
              isOwn ? 'bg-white text-brand-700' : 'bg-brand-600 text-white'
            }`}>
            <ExternalLink size={14} /> Pogledaj oglas
          </Link>
          <div className={`text-xs mt-3 ${isOwn ? 'text-brand-200' : 'text-gray-400'}`}>
            {format(new Date(msg.created_at), 'HH:mm')}
          </div>
        </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex gap-2.5 max-w-[85%] ${isOwn ? 'flex-row-reverse ml-auto' : ''} ${showStaffHeader ? 'items-start' : 'items-end'}`}>
      <ChatAvatar
        avatarUrl={avatarUrl}
        firstName={firstName || msg.first_name}
        lastName={lastName || msg.last_name}
      />
      <div className={`flex w-fit max-w-full flex-col gap-1 ${isOwn ? 'items-end' : 'items-start'}`}>
        {showStaffHeader && (
          <div className="inline-flex items-center gap-1.5">
            <span className="text-[11px] font-bold leading-none text-gray-800 dark:text-white whitespace-nowrap">
              {displayName}
            </span>
            <RoleBadge role={role} size="sm" />
          </div>
        )}
        <div className={`relative group max-w-[min(100%,280px)] sm:max-w-[320px] px-4 py-2 rounded-2xl text-sm ${
          isOwn ? 'bg-brand-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
        }`}>
      {canDelete && !isOwn && onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="absolute -top-2 -right-2 p-1 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
          title={'Obriši poruku'}
        >
          <Trash2 size={12} />
        </button>
      )}
      {msg.type === 'image' && msg.image_url ? (
        <img src={msg.image_url} alt="" className="max-w-full rounded-lg mb-1 max-h-48 object-cover" />
      ) : null}
      {msg.content && msg.type !== 'image' && msg.type !== 'listing_alert' && <span>{msg.content}</span>}
      {msg.type === 'image' && !msg.image_url && <span>📷 Slika</span>}
      <div className={`text-xs mt-1 ${isOwn ? 'text-brand-200' : 'text-gray-400'}`}>
        {format(new Date(msg.created_at), 'HH:mm')}
      </div>
      </div>
      </div>
    </div>
  );
}

export default function MessagesPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const toast = useToast();
  const selectedConvId = conversationId || '';
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [showStaffMembers, setShowStaffMembers] = useState(false);
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [staffRoomId, setStaffRoomId] = useState<string | null>(null);
  const [isSupportConversation, setIsSupportConversation] = useState(false);
  const [supportPeer, setSupportPeer] = useState<Conversation['participants'][0] | null>(null);
  const [activeSupportChats, setActiveSupportChats] = useState<ActiveSupportChat[]>([]);
  const [supportMenuOpen, setSupportMenuOpen] = useState(false);
  const [supportRequestMeta, setSupportRequestMeta] = useState<SupportRequestMeta | null>(null);
  const [closingSupport, setClosingSupport] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const staffPanelRef = useRef<HTMLDivElement>(null);
  const scrollOnSendRef = useRef(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const loadSeqRef = useRef(0);

  const openConversation = useCallback((convId: string) => {
    navigate(convId ? `/poruke/${convId}` : '/poruke');
  }, [navigate]);

  const openSupportConversation = useCallback((convId: string) => {
    openConversation(convId);
    setSupportMenuOpen(false);
  }, [openConversation]);

  const loadConversations = useCallback(() => {
    if (!user) return;
    api.get<Conversation[]>('/messages').then(setConversations).catch(() => {});
  }, [user]);

  const loadStaffRoomId = useCallback(async () => {
    try {
      const res = await api.get<{ id: string }>('/messages/staff-room');
      setStaffRoomId(res.id);
    } catch {
      setStaffRoomId(null);
    }
  }, []);

  const loadActiveSupportChats = useCallback(async () => {
    if (!user || !(user.role === 'admin' || user.role === 'moderator' || user.role === 'podrska')) {
      setActiveSupportChats([]);
      return;
    }
    try {
      const res = await api.get<{ chats: ActiveSupportChat[] }>('/support/active');
      setActiveSupportChats(res.chats.filter(c => c.conversationId));
    } catch {
      setActiveSupportChats([]);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    loadConversations();
    loadStaffRoomId();
    loadActiveSupportChats();
  }, [user, loadConversations, loadStaffRoomId, loadActiveSupportChats]);

  const isStaffUser = user?.role === 'admin' || user?.role === 'moderator' || user?.role === 'podrska';

  const refreshSupportContext = useCallback(() => {
    if (!selectedConvId) return;
    api.get<{
      isSupportConversation: boolean;
      supportRequest?: SupportRequestMeta | null;
      participants?: Conversation['participants'];
    }>(`/messages/${selectedConvId}/context`)
      .then(ctx => {
        setIsSupportConversation(ctx.isSupportConversation);
        setSupportRequestMeta(ctx.supportRequest ?? null);
        setSupportPeer(ctx.isSupportConversation ? (ctx.participants?.[0] ?? null) : null);
      })
      .catch(() => {
        setSupportRequestMeta(null);
      });
  }, [selectedConvId]);

  useEffect(() => {
    if (!selectedConvId) {
      setIsSupportConversation(false);
      setSupportPeer(null);
      setSupportRequestMeta(null);
      return;
    }
    api.get<{
      isSupportConversation: boolean;
      supportRequest?: SupportRequestMeta | null;
      participants?: Conversation['participants'];
    }>(`/messages/${selectedConvId}/context`)
      .then(ctx => {
        setIsSupportConversation(ctx.isSupportConversation);
        setSupportRequestMeta(ctx.supportRequest ?? null);
        setSupportPeer(ctx.isSupportConversation ? (ctx.participants?.[0] ?? null) : null);
        if (ctx.isSupportConversation && !isStaffUser) {
          openConversation('');
        }
      })
      .catch(() => {
        setIsSupportConversation(false);
        setSupportPeer(null);
        setSupportRequestMeta(null);
      });
  }, [selectedConvId, isStaffUser, openConversation]);

  useEffect(() => {
    if (!user) return;
    const socket = getSocket();

    const onNewMessage = (msg: Record<string, unknown>) => {
      const convId = String(msg.conversation_id || msg.conversationId || '');
      const normalized = normalizeMessage(msg);
      if (convId === selectedConvId) {
        setMessages(prev => {
          if (prev.some(m => m.id === normalized.id)) return prev;
          return [...prev, normalized];
        });
      }
      loadConversations();
      loadActiveSupportChats();
    };

    socket.on('message:new', onNewMessage);
    socket.on('notification:message', () => {
      loadConversations();
      loadActiveSupportChats();
    });

    const onSupportClaimed = () => loadActiveSupportChats();
    socket.on('support:request_claimed', onSupportClaimed);
    socket.on('support:claimed', onSupportClaimed);

    const onSupportClosed = (data?: { conversationId?: string }) => {
      loadActiveSupportChats();
      if (data?.conversationId && data.conversationId === selectedConvId) {
        refreshSupportContext();
        api.get<Record<string, unknown>[]>(`/messages/${selectedConvId}/messages`)
          .then(msgs => setMessages(msgs.map(normalizeMessage)))
          .catch(() => {});
      }
    };
    socket.on('support:request_closed', onSupportClosed);
    socket.on('support:closed', onSupportClosed);

    const onMessageDeleted = (data: { conversationId: string; messageId: string }) => {
      if (data.conversationId === selectedConvId) {
        setMessages(prev => prev.filter(m => m.id !== data.messageId));
      }
      loadConversations();
    };
    socket.on('message:deleted', onMessageDeleted);

    return () => {
      socket.off('message:new', onNewMessage);
      socket.off('notification:message');
      socket.off('support:request_claimed', onSupportClaimed);
      socket.off('support:claimed', onSupportClaimed);
      socket.off('support:request_closed', onSupportClosed);
      socket.off('support:closed', onSupportClosed);
      socket.off('message:deleted', onMessageDeleted);
    };
  }, [user, selectedConvId, loadConversations, loadActiveSupportChats, refreshSupportContext]);

  useEffect(() => {
    if (!selectedConvId || (isSupportConversation && !isStaffUser)) {
      setMessages([]);
      return;
    }

    scrollOnSendRef.current = false;
    const seq = ++loadSeqRef.current;

    api.get<Record<string, unknown>[]>(`/messages/${selectedConvId}/messages`)
      .then(data => {
        if (seq !== loadSeqRef.current) return;
        setMessages(data.map(normalizeMessage));
        if (isSupportConversation && isStaffUser) loadActiveSupportChats();
      })
      .catch(() => {});

    getSocket().emit('conversation:join', selectedConvId);
  }, [selectedConvId, isSupportConversation, isStaffUser, loadActiveSupportChats]);

  useEffect(() => {
    if (!scrollOnSendRef.current || !messagesContainerRef.current) return;
    scrollOnSendRef.current = false;
    messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
  }, [messages]);

  const activeConversation = conversations.find(c => c.id === selectedConvId);
  const isStaffRoom = Boolean(staffRoomId && selectedConvId === staffRoomId);
  const staffConversation = staffRoomId
    ? conversations.find(c => c.id === staffRoomId)
    : conversations.find(c => isStaffRoomConv(c));
  const privateConversations = conversations.filter(c => !isStaffRoomConv(c) && c.id !== staffRoomId);
  const otherUser = isStaffRoom
    ? undefined
    : (isSupportConversation ? supportPeer : activeConversation?.participants?.[0]) ?? undefined;
  const isSystemChat = isSystemParticipant(otherUser);
  const staffMemberCount = isStaffRoom
    ? (staffConversation?.other_participant_count ?? Math.max(0, staffMembers.length - 1)) + 1
    : 0;
  const isAdmin = user?.role === 'admin';
  const onlineStaff = staffMembers.filter(m => isMemberOnline(m, user?.id));
  const offlineStaff = staffMembers.filter(m => !isMemberOnline(m, user?.id));
  const supportUnreadTotal = activeSupportChats.reduce((sum, chat) => sum + (chat.unreadCount || 0), 0);
  const selectedSupportChat = activeSupportChats.find(chat => chat.conversationId === selectedConvId);
  const isSupportClosed = isSupportConversation && supportRequestMeta?.status === 'closed';
  const canCloseSupport = isSupportConversation && isStaffUser && supportRequestMeta?.status === 'active';

  const closeSupportChat = async () => {
    const requestId = supportRequestMeta?.id || selectedSupportChat?.id;
    if (!requestId || closingSupport) return;
    if (!window.confirm('Da li ste sigurni da želite da završite ovaj support razgovor? Korisnik će biti obavešten i moći će da ostavi ocenu.')) {
      return;
    }
    setClosingSupport(true);
    try {
      await api.post(`/support/${requestId}/close`, {});
      toast.show('Support razgovor završen', 'success');
      setSupportRequestMeta(prev => (prev ? { ...prev, status: 'closed' } : prev));
      loadActiveSupportChats();
      if (selectedConvId) {
        const msgs = await api.get<Record<string, unknown>[]>(`/messages/${selectedConvId}/messages`);
        setMessages(msgs.map(normalizeMessage));
      }
    } catch (err) {
      toast.show((err as Error).message, 'error');
    } finally {
      setClosingSupport(false);
    }
  };

  const loadStaffMembers = useCallback(async () => {
    try {
      const res = await api.get<{ members: StaffMember[] }>('/messages/staff-room/members');
      setStaffMembers(res.members.map(m => ({
        ...m,
        is_online: isMemberOnline(m, user?.id),
      })));
    } catch {
      /* ignore */
    }
  }, [user?.id]);

  const sendMessage = async (content: string, type = 'text', imageUrl?: string) => {
    const targetConvId = staffRoomId && selectedConvId === staffRoomId ? staffRoomId : selectedConvId;
    if (!targetConvId || sending || (!content.trim() && !imageUrl)) return;
    setSending(true);
    try {
      const saved = await api.post<Record<string, unknown>>(`/messages/${targetConvId}/messages`, {
        content: content.trim() || (imageUrl ? 'Slika' : ''),
        type,
        imageUrl,
      });
      const normalized = normalizeMessage(saved);
      setMessages(prev => {
        if (prev.some(m => m.id === normalized.id)) return prev;
        return [...prev, normalized];
      });
      scrollOnSendRef.current = true;
      setNewMessage('');
      loadConversations();
      loadStaffRoomId();
      if (isSupportConversation) loadActiveSupportChats();
    } catch (err) {
      toast.show((err as Error).message, 'error');
    } finally {
      setSending(false);
    }
  };

  const uploadImage = async (file: File) => {
    if (!selectedConvId) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const res = await api.upload<{ url: string }>('/messages/upload', fd);
      await sendMessage('', 'image', res.url);
    } catch (err) {
      toast.show((err as Error).message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const deleteMessage = async (messageId: string) => {
    if (!selectedConvId || user?.role !== 'admin') return;
    const targetConvId = staffRoomId && selectedConvId === staffRoomId ? staffRoomId : selectedConvId;
    try {
      await api.delete(`/messages/${targetConvId}/messages/${messageId}`);
      setMessages(prev => prev.filter(m => m.id !== messageId));
      loadConversations();
      toast.show('Poruka obrisana', 'success');
    } catch (err) {
      toast.show((err as Error).message, 'error');
    }
  };

  useEffect(() => {
    if (!isStaffRoom || !selectedConvId) {
      setShowStaffMembers(false);
      return;
    }
    loadStaffMembers();
  }, [isStaffRoom, selectedConvId, loadStaffMembers]);

  useEffect(() => {
    if (showStaffMembers && isStaffRoom) {
      loadStaffMembers();
    }
  }, [showStaffMembers, isStaffRoom, loadStaffMembers]);

  useEffect(() => {
    if (!showStaffMembers) return;
    const onClickOutside = (e: MouseEvent) => {
      if (staffPanelRef.current && !staffPanelRef.current.contains(e.target as Node)) {
        setShowStaffMembers(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showStaffMembers]);

  useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    const refreshStaff = (data?: { userId?: string; isOnline?: boolean }) => {
      if (data?.userId) {
        setStaffMembers(prev => prev.map(m =>
          m.id === data.userId ? { ...m, is_online: Boolean(data.isOnline) } : m
        ));
      }
      if (isStaffRoom) loadStaffMembers();
    };
    socket.on('user:online', refreshStaff);
    return () => { socket.off('user:online', refreshStaff); };
  }, [user, isStaffRoom, loadStaffMembers]);

  return (
    <Layout>
      <Helmet><title>Poruke</title></Helmet>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-bold mb-6 dark:text-white">Poruke</h1>
        <div className="card flex h-[calc(100vh-280px)] min-h-[400px]">
          <div className={`w-full sm:w-80 border-r border-gray-100 dark:border-gray-800 overflow-y-auto ${selectedConvId ? 'hidden sm:block' : ''}`}>
            {!staffRoomId && privateConversations.length === 0 && (!isStaffUser || activeSupportChats.length === 0) ? (
              <div className="p-6 text-center text-gray-500 text-sm">Nemate poruka</div>
            ) : (
              <>
                {staffRoomId && (
                  <button
                    type="button"
                    onClick={() => openConversation(staffRoomId)}
                    className={`w-full p-4 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left ${selectedConvId === staffRoomId ? 'bg-brand-50 dark:bg-brand-900/30' : ''}`}
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-600 to-purple-600 flex items-center justify-center text-white shrink-0">
                      <Users size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate dark:text-white">Tim administracije</div>
                      <div className="text-xs text-gray-500 truncate">
                        {`Grupni čet · ${(staffConversation?.other_participant_count ?? Math.max(0, staffMembers.length - 1)) + 1} članova`}
                      </div>
                    </div>
                    {(staffConversation?.unread_count ?? 0) > 0 && (
                      <span className="min-w-[20px] h-5 px-1.5 bg-accent-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                        {(staffConversation!.unread_count) > 99 ? '99+' : staffConversation!.unread_count}
                      </span>
                    )}
                  </button>
                )}
                {isStaffUser && (
                  <div className="border-b border-gray-100 dark:border-gray-800">
                    <button
                      type="button"
                      onClick={() => {
                        setSupportMenuOpen(open => {
                          if (!open) void loadActiveSupportChats();
                          return !open;
                        });
                      }}
                      className={`w-full p-4 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left ${
                        isSupportConversation ? 'bg-amber-50 dark:bg-amber-900/20' : ''
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center text-amber-950 shrink-0">
                        <Headphones size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate dark:text-white">Live podrška</div>
                        <div className="text-xs text-gray-500 truncate">
                          {supportMenuOpen
                            ? `${activeSupportChats.length} aktivnih razgovora`
                            : selectedSupportChat?.user
                              ? `${selectedSupportChat.user.firstName} ${selectedSupportChat.user.lastName}`
                              : activeSupportChats.length > 0
                                ? `${activeSupportChats.length} aktivnih razgovora`
                                : 'Nema aktivnih razgovora'}
                        </div>
                      </div>
                      {supportUnreadTotal > 0 && (
                        <span className="min-w-[20px] h-5 px-1.5 bg-accent-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                          {supportUnreadTotal > 99 ? '99+' : supportUnreadTotal}
                        </span>
                      )}
                      <ChevronDown
                        size={18}
                        className={`shrink-0 text-gray-400 transition-transform ${supportMenuOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {supportMenuOpen && (
                      <div className="bg-gray-50/80 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-800">
                        {activeSupportChats.length === 0 ? (
                          <p className="px-4 py-3 text-xs text-gray-500 text-center">Nema preuzetih razgovora</p>
                        ) : (
                          activeSupportChats.map(chat => (
                            <button
                              key={chat.id}
                              type="button"
                              onClick={() => chat.conversationId && openSupportConversation(chat.conversationId)}
                              className={`w-full px-4 py-3 pl-8 flex items-center gap-3 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left ${
                                selectedConvId === chat.conversationId ? 'bg-brand-50 dark:bg-brand-900/30' : ''
                              }`}
                            >
                              <div className="w-9 h-9 rounded-full bg-brand-100 dark:bg-brand-900 flex items-center justify-center text-brand-700 dark:text-brand-300 font-medium text-xs overflow-hidden shrink-0">
                                {chat.user?.avatarUrl
                                  ? <img src={chat.user.avatarUrl} alt="" className="w-full h-full object-cover" />
                                  : <>{chat.user?.firstName?.[0]}{chat.user?.lastName?.[0]}</>}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm truncate dark:text-white">
                                  {chat.user ? `${chat.user.firstName} ${chat.user.lastName}` : 'Korisnik'}
                                </div>
                                <div className="text-xs text-gray-500 truncate">
                                  {formatLastMessagePreview(chat.lastMessage)}
                                </div>
                              </div>
                              {chat.unreadCount > 0 && (
                                <span className="min-w-[20px] h-5 px-1.5 bg-accent-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                                  {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                                </span>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
                {privateConversations.map(conv => {
              const other = conv.participants?.[0];
              return (
                <button key={conv.id} type="button" onClick={() => openConversation(conv.id)}
                  className={`w-full p-4 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left ${selectedConvId === conv.id ? 'bg-brand-50 dark:bg-brand-900/30' : ''}`}>
                  <div className="relative">
                      <div className="w-10 h-10 rounded-full bg-brand-100 dark:bg-brand-900 flex items-center justify-center text-brand-700 dark:text-brand-300 font-medium text-sm overflow-hidden">
                        {other?.avatarUrl
                          ? <img src={other.avatarUrl} alt="" className="w-full h-full object-cover" />
                          : <>{other?.firstName?.[0]}{other?.lastName?.[0]}</>}
                      </div>
                    {other?.isOnline && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-gray-900" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium text-sm truncate dark:text-white">
                        {displayParticipant(other)}
                      </span>
                      <RoleBadge role={other?.role} size="sm" />
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {formatLastMessagePreview(conv.last_message)}
                    </div>
                  </div>
                  {conv.unread_count > 0 && (
                    <span className="min-w-[20px] h-5 px-1.5 bg-accent-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                      {conv.unread_count > 99 ? '99+' : conv.unread_count}
                    </span>
                  )}
                </button>
              );
            })}
              </>
            )}
          </div>

          <div className={`flex-1 flex flex-col ${!selectedConvId ? 'hidden sm:flex' : ''}`}>
            {selectedConvId ? (
              <>
                <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3 relative">
                  <button className="sm:hidden dark:text-white" onClick={() => openConversation('')}>
                    <ArrowLeft size={20} />
                  </button>
                  {isStaffRoom ? (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-600 to-purple-600 flex items-center justify-center text-white">
                      <Users size={16} />
                    </div>
                  ) : isSupportConversation ? (
                    <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-amber-950">
                      <Headphones size={16} />
                    </div>
                  ) : otherUser ? (
                    <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900 flex items-center justify-center text-brand-700 font-medium text-sm overflow-hidden">
                      {otherUser.avatarUrl
                        ? <img src={otherUser.avatarUrl} alt="" className="w-full h-full object-cover" />
                        : <>{otherUser.firstName?.[0]}{otherUser.lastName?.[0]}</>}
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium text-sm dark:text-white">
                        {isStaffRoom
                          ? 'Tim administracije'
                          : isSupportConversation
                            ? 'Live podrška'
                            : otherUser
                              ? displayParticipant(otherUser)
                              : 'Razgovor'}
                      </span>
                      {!isStaffRoom && !isSupportConversation && otherUser && <RoleBadge role={otherUser.role} size="sm" />}
                      {isSupportConversation && otherUser && <RoleBadge role={otherUser.role} size="sm" />}
                    </div>
                    <div className="text-xs text-gray-500">
                      {isStaffRoom
                        ? `Grupni čet · ${staffMemberCount} članova (admin, moderator, podrška)`
                        : isSupportConversation
                          ? otherUser
                            ? `${displayParticipant(otherUser)} · razgovor putem live supporta${supportRequestMeta?.claimedAt ? ` · od ${format(new Date(supportRequestMeta.claimedAt), 'dd.MM. HH:mm')}` : ''}`
                            : 'Razgovor putem live supporta'
                          : otherUser
                            ? (isSystemChat ? 'Obaveštenja platforme' : otherUser.isOnline ? 'Online' : 'Offline')
                            : 'Učitavanje...'}
                    </div>
                  </div>
                  {isStaffRoom && (
                    <div className="relative shrink-0" ref={staffPanelRef}>
                      <button
                        type="button"
                        onClick={() => {
                          setShowStaffMembers(v => !v);
                          if (!showStaffMembers) loadStaffMembers();
                        }}
                        className={`p-2 rounded-lg transition-colors ${
                          showStaffMembers
                            ? 'bg-brand-100 dark:bg-brand-900/50 text-brand-700 dark:text-brand-300'
                            : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 dark:text-gray-400'
                        }`}
                        title="Članovi tima"
                      >
                        <Users size={20} />
                      </button>
                      {showStaffMembers && (
                        <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden">
                          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                            <p className="text-sm font-semibold dark:text-white">Tim administracije</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {onlineStaff.length} online · {staffMembers.length} ukupno
                            </p>
                          </div>
                          <div className="max-h-64 overflow-y-auto py-2">
                            {onlineStaff.length > 0 && (
                              <div className="px-3 pb-1">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-green-600 dark:text-green-400 px-1 mb-1">
                                  Online
                                </p>
                                {onlineStaff.map(m => (
                                  <div key={m.id} className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                    <div className="relative shrink-0">
                                      <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900 flex items-center justify-center text-brand-700 dark:text-brand-300 text-xs font-medium overflow-hidden">
                                        {m.avatar_url
                                          ? <img src={m.avatar_url} alt="" className="w-full h-full object-cover" />
                                          : <>{m.first_name?.[0]}{m.last_name?.[0]}</>}
                                      </div>
                                      <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white dark:border-gray-800 shadow-[0_0_6px_rgba(34,197,94,0.8)]" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-semibold truncate text-gray-900 dark:text-white">
                                        {m.first_name} {m.last_name}
                                      </p>
                                      <RoleBadge role={m.role} size="sm" />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                            {offlineStaff.length > 0 && (
                              <div className="px-3 pt-1">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 px-1 mb-1">
                                  Offline
                                </p>
                                {offlineStaff.map(m => (
                                  <div key={m.id} className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                    <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400 text-xs font-medium overflow-hidden shrink-0">
                                      {m.avatar_url
                                        ? <img src={m.avatar_url} alt="" className="w-full h-full object-cover opacity-80" />
                                        : <>{m.first_name?.[0]}{m.last_name?.[0]}</>}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium truncate text-gray-700 dark:text-gray-200">
                                        {m.first_name} {m.last_name}
                                      </p>
                                      <RoleBadge role={m.role} size="sm" />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                            {staffMembers.length === 0 && (
                              <p className="text-sm text-gray-500 text-center py-4">Nema članova</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {isSupportConversation && isStaffUser && (
                    <div className="flex items-center gap-1 shrink-0">
                      {otherUser?.id && (
                        <Link
                          to={`/korisnik/${otherUser.id}`}
                          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 dark:text-gray-400"
                          title="Profil korisnika"
                        >
                          <ExternalLink size={18} />
                        </Link>
                      )}
                      {canCloseSupport && (
                        <button
                          type="button"
                          onClick={closeSupportChat}
                          disabled={closingSupport}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 disabled:opacity-50 transition-colors"
                        >
                          {closingSupport ? 'Zatvaranje...' : 'Završi razgovor'}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50 dark:bg-gray-900/30">
                  {isSupportConversation && (
                    <div className="text-center py-2">
                      <span className={`inline-flex items-center gap-2 text-xs rounded-full px-4 py-1.5 ${
                        isSupportClosed
                          ? 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'
                          : 'text-amber-800 dark:text-amber-200 bg-amber-50/80 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-800/40'
                      }`}>
                        <Headphones size={12} className="shrink-0" />
                        {isSupportClosed
                          ? 'Razgovor je završen — istorija je dostupna samo za pregled'
                          : 'Live support razgovor — korisnik vidi poruke u svom widgetu za podršku'}
                      </span>
                    </div>
                  )}
                  {isStaffRoom && (
                    <div className="text-center py-2">
                      <span className="inline-flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 bg-gradient-to-r from-brand-50 to-purple-50 dark:from-brand-900/30 dark:to-purple-900/20 border border-brand-200/60 dark:border-brand-700/40 rounded-full px-4 py-1.5 shadow-sm">
                        <Users size={12} className="text-brand-600 dark:text-brand-400 shrink-0" />
                        {'Interni grupni čet za admin, moderator i podršku'}
                      </span>
                    </div>
                  )}
                  {isSystemChat && (
                    <div className="text-center">
                      <span className="inline-block text-xs text-muted bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full px-3 py-1">
                        Sistemska obaveštenja o hitnim oglasima i novostima
                      </span>
                    </div>
                  )}
                  {messages.map(msg => {
                    const isOwn = msg.sender_id === user?.id;
                    return (
                      <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                        <MessageBubble
                          msg={msg}
                          isOwn={isOwn}
                          isStaffRoom={isStaffRoom}
                          canDelete={isAdmin}
                          onDelete={() => deleteMessage(msg.id)}
                          avatarUrl={isOwn ? user?.avatarUrl : msg.avatar_url}
                          firstName={isOwn ? user?.firstName : msg.first_name}
                          lastName={isOwn ? user?.lastName : msg.last_name}
                          senderRole={isOwn ? user?.role : msg.sender_role}
                        />
                      </div>
                    );
                  })}
                </div>

                {isSystemChat ? (
                  <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40 text-center text-xs text-muted">
                    Na sistemska obaveštenja nije moguće odgovoriti.
                  </div>
                ) : isSupportClosed ? (
                  <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-amber-50/50 dark:bg-amber-900/10 text-center text-xs text-amber-700 dark:text-amber-300">
                    Ovaj support razgovor je završen. Slanje novih poruka nije moguće.
                  </div>
                ) : (
                  <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2">
                    <input ref={imageInputRef} type="file" accept="image/*" className="hidden"
                      onChange={e => e.target.files?.[0] && uploadImage(e.target.files[0])} />
                    <button
                      onClick={() => imageInputRef.current?.click()}
                      disabled={uploading || sending}
                      className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
                    >
                      <Image size={20} />
                    </button>
                    <input className="input flex-1" placeholder="Napišite poruku..." value={newMessage}
                      disabled={sending}
                      onChange={e => setNewMessage(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          sendMessage(newMessage);
                        }
                      }} />
                    <button onClick={() => sendMessage(newMessage)} disabled={sending} className="btn-primary p-2.5">
                      <Send size={18} />
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                Izaberite razgovor
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
