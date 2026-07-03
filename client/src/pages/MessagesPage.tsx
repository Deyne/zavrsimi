import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Send, Image, ArrowLeft, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { useAuthStore } from '../store/authStore';
import { api } from '../services/api';
import { getSocket } from '../services/socket';
import { useToast } from '../components/ui/Toast';
import { format } from 'date-fns';

interface Conversation {
  id: string;
  participants: { id: string; firstName: string; lastName: string; avatarUrl?: string; isOnline?: boolean }[];
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
  };
}

function parseListingAlert(content: string, imageUrl?: string) {
  try {
    const data = JSON.parse(content) as { listingId: string; title: string; city: string; preview?: string };
    return { ...data, imageUrl };
  } catch {
    return null;
  }
}

function MessageBubble({ msg, isOwn }: { msg: Message; isOwn: boolean }) {
  const alert = msg.type === 'listing_alert' ? parseListingAlert(msg.content, msg.image_url) : null;

  if (alert) {
    return (
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
    );
  }

  return (
    <div className={`max-w-[70%] px-4 py-2 rounded-2xl text-sm ${
      isOwn ? 'bg-brand-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
    }`}>
      {msg.type === 'image' && msg.image_url ? (
        <img src={msg.image_url} alt="" className="max-w-full rounded-lg mb-1 max-h-48 object-cover" />
      ) : null}
      {msg.content && msg.type !== 'image' && msg.type !== 'listing_alert' && <span>{msg.content}</span>}
      {msg.type === 'image' && !msg.image_url && <span>📷 Slika</span>}
      <div className={`text-xs mt-1 ${isOwn ? 'text-brand-200' : 'text-gray-400'}`}>
        {format(new Date(msg.created_at), 'HH:mm')}
      </div>
    </div>
  );
}

export default function MessagesPage() {
  const { conversationId } = useParams();
  const { user } = useAuthStore();
  const toast = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [activeConv, setActiveConv] = useState(conversationId || '');
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const loadConversations = useCallback(() => {
    if (!user) return;
    api.get<Conversation[]>('/messages').then(setConversations).catch(() => {});
  }, [user]);

  const loadMessages = useCallback((convId: string) => {
    api.get<Record<string, unknown>[]>(`/messages/${convId}/messages`)
      .then(data => setMessages(data.map(normalizeMessage)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    loadConversations();
    const socket = getSocket();

    const onNewMessage = (msg: Record<string, unknown>) => {
      const convId = String(msg.conversation_id || msg.conversationId || '');
      const normalized = normalizeMessage(msg);
      if (convId === activeConv) {
        setMessages(prev => {
          if (prev.some(m => m.id === normalized.id)) return prev;
          return [...prev, normalized];
        });
      }
      loadConversations();
    };

    socket.on('message:new', onNewMessage);
    socket.on('notification:message', () => loadConversations());

    return () => {
      socket.off('message:new', onNewMessage);
      socket.off('notification:message');
    };
  }, [user, activeConv, loadConversations]);

  useEffect(() => {
    if (conversationId) setActiveConv(conversationId);
  }, [conversationId]);

  useEffect(() => {
    if (activeConv) {
      loadMessages(activeConv);
      getSocket().emit('conversation:join', activeConv);
    } else {
      setMessages([]);
    }
  }, [activeConv, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (content: string, type = 'text', imageUrl?: string) => {
    if (!activeConv || sending || (!content.trim() && !imageUrl)) return;
    setSending(true);
    try {
      const saved = await api.post<Record<string, unknown>>(`/messages/${activeConv}/messages`, {
        content: content.trim() || (imageUrl ? 'Slika' : ''),
        type,
        imageUrl,
      });
      const normalized = normalizeMessage(saved);
      setMessages(prev => {
        if (prev.some(m => m.id === normalized.id)) return prev;
        return [...prev, normalized];
      });
      setNewMessage('');
      loadConversations();
    } catch (err) {
      toast.show((err as Error).message, 'error');
    } finally {
      setSending(false);
    }
  };

  const uploadImage = async (file: File) => {
    if (!activeConv) return;
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

  const activeConversation = conversations.find(c => c.id === activeConv);
  const otherUser = activeConversation?.participants?.[0];
  const isSystemChat = isSystemParticipant(otherUser);

  return (
    <Layout>
      <Helmet><title>Poruke</title></Helmet>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-bold mb-6 dark:text-white">Poruke</h1>
        <div className="card flex h-[calc(100vh-280px)] min-h-[400px]">
          <div className={`w-full sm:w-80 border-r border-gray-100 dark:border-gray-800 overflow-y-auto ${activeConv ? 'hidden sm:block' : ''}`}>
            {conversations.length === 0 ? (
              <div className="p-6 text-center text-gray-500 text-sm">Nemate poruka</div>
            ) : conversations.map(conv => {
              const other = conv.participants?.[0];
              return (
                <button key={conv.id} onClick={() => setActiveConv(conv.id)}
                  className={`w-full p-4 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left ${activeConv === conv.id ? 'bg-brand-50 dark:bg-brand-900/30' : ''}`}>
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-brand-100 dark:bg-brand-900 flex items-center justify-center text-brand-700 dark:text-brand-300 font-medium text-sm overflow-hidden">
                      {other?.avatarUrl
                        ? <img src={other.avatarUrl} alt="" className="w-full h-full object-cover" />
                        : <>{other?.firstName?.[0]}{other?.lastName?.[0]}</>}
                    </div>
                    {other?.isOnline && <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-gray-900" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate dark:text-white">{displayParticipant(other)}</div>
                    <div className="text-xs text-gray-500 truncate">{formatLastMessagePreview(conv.last_message)}</div>
                  </div>
                  {conv.unread_count > 0 && (
                    <span className="min-w-[20px] h-5 px-1.5 bg-accent-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                      {conv.unread_count > 99 ? '99+' : conv.unread_count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className={`flex-1 flex flex-col ${!activeConv ? 'hidden sm:flex' : ''}`}>
            {activeConv && otherUser ? (
              <>
                <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
                  <button className="sm:hidden dark:text-white" onClick={() => setActiveConv('')}>
                    <ArrowLeft size={20} />
                  </button>
                  <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900 flex items-center justify-center text-brand-700 font-medium text-sm overflow-hidden">
                    {otherUser.avatarUrl
                      ? <img src={otherUser.avatarUrl} alt="" className="w-full h-full object-cover" />
                      : <>{otherUser.firstName?.[0]}{otherUser.lastName?.[0]}</>}
                  </div>
                  <div>
                    <div className="font-medium text-sm dark:text-white">{displayParticipant(otherUser)}</div>
                    <div className="text-xs text-gray-500">
                      {isSystemChat ? 'Obaveštenja platforme' : otherUser.isOnline ? 'Online' : 'Offline'}
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50 dark:bg-gray-900/30">
                  {isSystemChat && (
                    <div className="text-center">
                      <span className="inline-block text-xs text-muted bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full px-3 py-1">
                        Sistemska obaveštenja o hitnim oglasima i novostima
                      </span>
                    </div>
                  )}
                  {messages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}>
                      <MessageBubble msg={msg} isOwn={msg.sender_id === user?.id} />
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                {isSystemChat ? (
                  <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40 text-center text-xs text-muted">
                    Na sistemska obaveštenja nije moguće odgovoriti.
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
                      onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage(newMessage)} />
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
