import { useEffect, useState, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { MessageSquare, Eye, Pin, Plus, Quote, X } from 'lucide-react';
import clsx from 'clsx';
import { Layout } from '../components/layout/Layout';
import { RoleBadge } from '../components/ui/Badges';
import { api } from '../services/api';
import { FORUM_SECTION_LABELS, ForumSection, REPUTATION_LABELS, UserReputation } from '@zavrsi-mi/shared';
import { formatDistanceToNow, format } from 'date-fns';
import { sr } from 'date-fns/locale';
import { useToast } from '../components/ui/Toast';
import { useAuthStore } from '../store/authStore';

interface ForumTopic {
  id: string;
  section: ForumSection;
  title: string;
  content: string;
  is_pinned: boolean;
  view_count: number;
  reply_count: number;
  created_at: string;
  user_id: string;
  first_name: string;
  last_name: string;
  avatar_url?: string | null;
  reputation: string;
  role?: string;
}

interface ForumReply {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  first_name: string;
  last_name: string;
  avatar_url?: string | null;
  reputation: string;
  role?: string;
  quote_text?: string | null;
  quote_author_name?: string | null;
}

interface ForumQuote {
  text: string;
  authorName: string;
  replyId?: string;
}

const RANK_STYLES: Record<string, string> = {
  novi_clan: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  pouzdan_clan: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  proveren_clan: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  aktivan_clan: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  ekspert: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  elitni_majstor: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  veteran: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
};

function ForumRankBadge({ reputation }: { reputation: string }) {
  const key = reputation as UserReputation;
  const label = REPUTATION_LABELS[key] || reputation;
  return (
    <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full', RANK_STYLES[reputation] || RANK_STYLES.novi_clan)}>
      {label}
    </span>
  );
}

function ForumAvatar({ userId, name, avatarUrl, size = 'md' }: { userId: string; name: string; avatarUrl?: string | null; size?: 'md' | 'lg' }) {
  const dims = size === 'lg' ? 'w-16 h-16 text-lg' : 'w-12 h-12 text-sm';
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2);
  return (
    <Link to={`/korisnik/${userId}`} className={clsx('rounded-xl bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center text-brand-700 dark:text-brand-300 font-bold shrink-0 overflow-hidden hover:ring-2 hover:ring-brand-400 transition-shadow', dims)}>
      {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" /> : initials}
    </Link>
  );
}

function ForumPost({
  postNumber,
  userId,
  firstName,
  lastName,
  avatarUrl,
  reputation,
  role,
  createdAt,
  content,
  quoteText,
  quoteAuthorName,
  onQuote,
  isOriginal,
}: {
  postNumber: number;
  userId: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  reputation: string;
  role?: string;
  createdAt: string;
  content: string;
  quoteText?: string | null;
  quoteAuthorName?: string | null;
  onQuote?: () => void;
  isOriginal?: boolean;
}) {
  const fullName = `${firstName} ${lastName}`;

  return (
    <article className={clsx('card overflow-hidden', isOriginal && 'ring-1 ring-brand-200 dark:ring-brand-800')}>
      <div className="flex gap-0 sm:gap-0">
        <div className="hidden sm:flex flex-col items-center gap-2 w-28 shrink-0 p-4 bg-gray-50 dark:bg-gray-800/50 border-r border-gray-100 dark:border-gray-800">
          <ForumAvatar userId={userId} name={fullName} avatarUrl={avatarUrl} size="lg" />
          <Link to={`/korisnik/${userId}`} className="text-xs font-semibold text-center text-gray-900 dark:text-white hover:text-brand-600 dark:hover:text-brand-400 leading-tight">
            {fullName}
          </Link>
          <ForumRankBadge reputation={reputation} />
          <RoleBadge role={role} size="sm" />
          <span className="text-[10px] text-muted">#{postNumber}</span>
        </div>

        <div className="flex-1 min-w-0 p-4 sm:p-5">
          <div className="sm:hidden flex items-center gap-3 mb-3 pb-3 border-b border-gray-100 dark:border-gray-800">
            <ForumAvatar userId={userId} name={fullName} avatarUrl={avatarUrl} />
            <div className="min-w-0">
              <Link to={`/korisnik/${userId}`} className="font-semibold text-sm hover:text-brand-600 dark:hover:text-brand-400">{fullName}</Link>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <ForumRankBadge reputation={reputation} />
                <RoleBadge role={role} size="sm" />
                <span className="text-[10px] text-muted">#{postNumber}</span>
              </div>
            </div>
          </div>

          <div className="hidden sm:flex items-center justify-between gap-2 mb-3 pb-3 border-b border-gray-100 dark:border-gray-800">
            <div className="text-xs text-muted">
              {format(new Date(createdAt), 'd. MMM yyyy, HH:mm', { locale: sr })}
              {isOriginal && <span className="ml-2 text-brand-600 font-medium">Originalna objava</span>}
            </div>
          </div>

          <div className="sm:hidden text-[11px] text-muted mb-3">
            {formatDistanceToNow(new Date(createdAt), { addSuffix: true, locale: sr })}
          </div>

          {quoteText && (
            <div className="mb-4 pl-3 border-l-4 border-brand-300 dark:border-brand-600 bg-gray-50 dark:bg-gray-800/60 rounded-r-lg py-2.5 pr-3">
              <p className="text-xs font-semibold text-brand-600 dark:text-brand-400 mb-1">
                {quoteAuthorName || 'Korisnik'} je napisao/la:
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-300 italic line-clamp-4">{quoteText}</p>
            </div>
          )}

          <div className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed text-[15px]">{content}</div>

          {onQuote && (
            <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 flex justify-end">
              <button
                type="button"
                onClick={onQuote}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
              >
                <Quote size={14} /> Citiraj
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

const sections: ForumSection[] = ['preporuke', 'iskustva', 'pitanja', 'opste'];

export default function ForumPage() {
  const [topics, setTopics] = useState<ForumTopic[]>([]);
  const [activeSection, setActiveSection] = useState<ForumSection | ''>('');

  useEffect(() => {
    const params = activeSection ? `?section=${activeSection}` : '';
    api.get<ForumTopic[]>(`/forum${params}`).then(setTopics).catch(() => {});
  }, [activeSection]);

  return (
    <Layout>
      <Helmet>
        <title>Forum zajednice</title>
        <meta name="description" content="Preporučite majstore, podelite iskustva i postavite pitanja." />
      </Helmet>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Forum zajednice</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">Povezujte se, preporučujte i delite iskustva</p>
          </div>
          <Link to="/forum/nova-tema" className="btn-primary">
            <Plus size={16} /> Nova tema
          </Link>
        </div>

        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          <button onClick={() => setActiveSection('')}
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${!activeSection ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'}`}>
            Sve
          </button>
          {sections.map(s => (
            <button key={s} onClick={() => setActiveSection(s)}
              className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${activeSection === s ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'}`}>
              {FORUM_SECTION_LABELS[s]}
            </button>
          ))}
        </div>

        <div className="card divide-y divide-gray-100 dark:divide-gray-800">
          {topics.length === 0 ? (
            <div className="p-12 text-center text-gray-500 dark:text-gray-400">
              <MessageSquare size={48} className="mx-auto mb-4 text-gray-300 dark:text-gray-600" />
              <p>Još nema tema. Budite prvi!</p>
            </div>
          ) : topics.map(topic => (
            <Link key={topic.id} to={`/forum/${topic.id}`}
              className="flex items-center gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-800/80 transition-colors group">
              <div className="w-10 h-10 rounded-full bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center text-brand-700 dark:text-brand-300 font-medium text-sm shrink-0 overflow-hidden">
                {topic.avatar_url
                  ? <img src={topic.avatar_url} alt="" className="w-full h-full object-cover" />
                  : `${topic.first_name[0]}${topic.last_name[0]}`}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {topic.is_pinned && <Pin size={14} className="text-brand-600 dark:text-brand-400" />}
                  <span className="text-xs text-brand-600 dark:text-brand-400 font-medium">{FORUM_SECTION_LABELS[topic.section]}</span>
                  <ForumRankBadge reputation={topic.reputation} />
                </div>
                <h3 className="font-medium text-gray-900 dark:text-white truncate group-hover:text-brand-700 dark:group-hover:text-brand-300">{topic.title}</h3>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {topic.first_name} {topic.last_name} · {formatDistanceToNow(new Date(topic.created_at), { addSuffix: true, locale: sr })}
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-400 dark:text-gray-500 shrink-0">
                <span className="flex items-center gap-1"><MessageSquare size={14} /> {topic.reply_count}</span>
                <span className="flex items-center gap-1"><Eye size={14} /> {topic.view_count}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </Layout>
  );
}

export function ForumTopicPage() {
  const { id } = useParams();
  const { user } = useAuthStore();
  const toast = useToast();
  const [topic, setTopic] = useState<{ topic: ForumTopic; replies: ForumReply[] } | null>(null);
  const [reply, setReply] = useState('');
  const [quote, setQuote] = useState<ForumQuote | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const replyRef = useRef<HTMLTextAreaElement>(null);

  const loadTopic = () => {
    if (!id) return;
    api.get<{ topic: ForumTopic; replies: ForumReply[] }>(`/forum/${id}`).then(setTopic).catch(() => {});
  };

  useEffect(() => { loadTopic(); }, [id]);

  const handleQuote = (authorName: string, text: string, replyId?: string) => {
    const excerpt = text.length > 280 ? `${text.slice(0, 280)}...` : text;
    setQuote({ authorName, text: excerpt, replyId });
    replyRef.current?.focus();
  };

  const submitReply = async () => {
    if (!reply.trim() || !id) return;
    setSubmitting(true);
    try {
      await api.post(`/forum/${id}/replies`, {
        content: reply.trim(),
        quoteText: quote?.text,
        quoteAuthorName: quote?.authorName,
      });
      setReply('');
      setQuote(null);
      loadTopic();
    } catch (err) {
      toast.show((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!topic) return <Layout><div className="p-16 text-center">U\u010ditavanje...</div></Layout>;

  const t = topic.topic;

  return (
    <Layout>
      <Helmet><title>{t.title}</title></Helmet>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <Link to="/forum" className="text-sm text-brand-600 dark:text-brand-400 hover:underline">&larr; Nazad na forum</Link>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="text-xs font-medium text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/30 px-2.5 py-1 rounded-full">
              {FORUM_SECTION_LABELS[t.section]}
            </span>
            {t.is_pinned && <Pin size={14} className="text-brand-600" />}
            <span className="text-xs text-muted flex items-center gap-3">
              <span className="flex items-center gap-1"><Eye size={12} /> {t.view_count}</span>
              <span className="flex items-center gap-1"><MessageSquare size={12} /> {t.reply_count}</span>
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold mt-2 text-gray-900 dark:text-white">{t.title}</h1>
        </div>

        <div className="space-y-4 mb-8">
          <ForumPost
            postNumber={1}
            userId={t.user_id}
            firstName={t.first_name}
            lastName={t.last_name}
            avatarUrl={t.avatar_url}
            reputation={t.reputation}
            role={t.role}
            createdAt={t.created_at}
            content={t.content}
            isOriginal
            onQuote={user ? () => handleQuote(`${t.first_name} ${t.last_name}`, t.content) : undefined}
          />

          {topic.replies.map((r, idx) => (
            <ForumPost
              key={r.id}
              postNumber={idx + 2}
              userId={r.user_id}
              firstName={r.first_name}
              lastName={r.last_name}
              avatarUrl={r.avatar_url}
              reputation={r.reputation}
              role={r.role}
              createdAt={r.created_at}
              content={r.content}
              quoteText={r.quote_text}
              quoteAuthorName={r.quote_author_name}
              onQuote={user ? () => handleQuote(`${r.first_name} ${r.last_name}`, r.content, r.id) : undefined}
            />
          ))}
        </div>

        {user ? (
          <div className="card p-5">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <MessageSquare size={16} /> Odgovori na temu
            </h3>
            {quote && (
              <div className="mb-3 p-3 rounded-xl bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 relative">
                <button
                  type="button"
                  onClick={() => setQuote(null)}
                  className="absolute top-2 right-2 p-1 text-muted hover:text-red-500"
                  aria-label="Ukloni citat"
                >
                  <X size={14} />
                </button>
                <p className="text-xs font-semibold text-brand-600 dark:text-brand-400 mb-1">
                  Citat — {quote.authorName}:
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-300 italic pr-6">{quote.text}</p>
              </div>
            )}
            <textarea
              ref={replyRef}
              className="input min-h-[120px] mb-3 text-sm"
              placeholder={'Napi\u0161ite odgovor...'}
              value={reply}
              onChange={e => setReply(e.target.value)}
            />
            <button
              type="button"
              onClick={submitReply}
              disabled={submitting || reply.trim().length < 5}
              className="btn-primary"
            >
              {submitting ? 'Slanje...' : 'Odgovori'}
            </button>
          </div>
        ) : (
          <div className="card p-5 text-center text-sm text-muted">
            <Link to="/prijava" className="text-brand-600 dark:text-brand-400 hover:underline">Prijavite se</Link>
            {' '}da biste odgovorili na temu.
          </div>
        )}
      </div>
    </Layout>
  );
}

export function NewForumTopicPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuthStore();
  const [form, setForm] = useState({ section: 'pitanja' as ForumSection, title: '', content: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user === null) return;
    if (!user) {
      toast.show('Morate biti prijavljeni da biste objavili temu', 'error');
      navigate('/prijava', { replace: true, state: { from: '/forum/nova-tema' } });
    }
  }, [user, navigate, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (form.title.trim().length < 5) {
      toast.show('Naslov mora imati najmanje 5 karaktera', 'error');
      return;
    }
    if (form.content.trim().length < 20) {
      toast.show('Sadržaj mora imati najmanje 20 karaktera', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const topic = await api.post<{ id: string }>('/forum', {
        section: form.section,
        title: form.title.trim(),
        content: form.content.trim(),
      });
      toast.show('Tema uspešno objavljena', 'success');
      navigate(`/forum/${topic.id}`);
    } catch (err) {
      toast.show((err as Error).message || 'Greška pri objavljivanju teme', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (user === null) {
    return <Layout><div className="p-16 text-center">Učitavanje...</div></Layout>;
  }

  if (!user) return null;

  return (
    <Layout>
      <Helmet><title>Nova tema</title></Helmet>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">Nova tema</h1>
        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Sekcija</label>
            <select className="input" value={form.section} onChange={e => setForm(f => ({ ...f, section: e.target.value as ForumSection }))}>
              {sections.map(s => <option key={s} value={s}>{FORUM_SECTION_LABELS[s]}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Naslov</label>
            <input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              required minLength={5} maxLength={200} placeholder="Najmanje 5 karaktera" />
            <p className="text-xs text-muted mt-1">{form.title.length}/200 karaktera</p>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Sadržaj</label>
            <textarea className="input min-h-[200px]" value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              required minLength={20} placeholder="Opišite temu detaljno (najmanje 20 karaktera)" />
            <p className="text-xs text-muted mt-1">{form.content.length} karaktera (minimum 20)</p>
          </div>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Objavljivanje...' : 'Objavi temu'}
          </button>
        </form>
      </div>
    </Layout>
  );
}
