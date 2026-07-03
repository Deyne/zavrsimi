import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { MessageSquare, Eye, Pin, Plus } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { api } from '../services/api';
import { FORUM_SECTION_LABELS, ForumSection } from '@zavrsi-mi/shared';
import { formatDistanceToNow } from 'date-fns';
import { sr } from 'date-fns/locale';

interface ForumTopic {
  id: string;
  section: ForumSection;
  title: string;
  content: string;
  is_pinned: boolean;
  view_count: number;
  reply_count: number;
  created_at: string;
  first_name: string;
  last_name: string;
  reputation: string;
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
            <h1 className="text-3xl font-bold text-gray-900">Forum zajednice</h1>
            <p className="text-gray-500 mt-1">Povezujte se, preporučujte i delite iskustva</p>
          </div>
          <Link to="/forum/nova-tema" className="btn-primary">
            <Plus size={16} /> Nova tema
          </Link>
        </div>

        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          <button onClick={() => setActiveSection('')}
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${!activeSection ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            Sve
          </button>
          {sections.map(s => (
            <button key={s} onClick={() => setActiveSection(s)}
              className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${activeSection === s ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {FORUM_SECTION_LABELS[s]}
            </button>
          ))}
        </div>

        <div className="card divide-y divide-gray-100">
          {topics.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <MessageSquare size={48} className="mx-auto mb-4 text-gray-300" />
              <p>Još nema tema. Budite prvi!</p>
            </div>
          ) : topics.map(topic => (
            <Link key={topic.id} to={`/forum/${topic.id}`}
              className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors">
              <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-medium text-sm shrink-0">
                {topic.first_name[0]}{topic.last_name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {topic.is_pinned && <Pin size={14} className="text-brand-600" />}
                  <span className="text-xs text-brand-600 font-medium">{FORUM_SECTION_LABELS[topic.section]}</span>
                </div>
                <h3 className="font-medium text-gray-900 truncate">{topic.title}</h3>
                <div className="text-xs text-gray-500 mt-1">
                  {topic.first_name} {topic.last_name} · {formatDistanceToNow(new Date(topic.created_at), { addSuffix: true, locale: sr })}
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-400 shrink-0">
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
  const [topic, setTopic] = useState<{ topic: ForumTopic; replies: { id: string; content: string; first_name: string; last_name: string; created_at: string }[] } | null>(null);
  const [reply, setReply] = useState('');
  const id = window.location.pathname.split('/').pop();

  useEffect(() => {
    if (id) api.get<{ topic: ForumTopic; replies: { id: string; content: string; first_name: string; last_name: string; created_at: string }[] }>(`/forum/${id}`).then(setTopic).catch(() => {});
  }, [id]);

  const submitReply = async () => {
    if (!reply.trim() || !id) return;
    await api.post(`/forum/${id}/replies`, { content: reply });
    setReply('');
    api.get<{ topic: ForumTopic; replies: { id: string; content: string; first_name: string; last_name: string; created_at: string }[] }>(`/forum/${id}`).then(setTopic);
  };

  if (!topic) return <Layout><div className="p-16 text-center">Učitavanje...</div></Layout>;

  return (
    <Layout>
      <Helmet><title>{topic.topic.title}</title></Helmet>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="card p-6 mb-6">
          <span className="text-xs text-brand-600 font-medium">{FORUM_SECTION_LABELS[topic.topic.section]}</span>
          <h1 className="text-2xl font-bold mt-2 mb-4">{topic.topic.title}</h1>
          <div className="text-gray-700 whitespace-pre-wrap">{topic.topic.content}</div>
          <div className="mt-4 pt-4 border-t text-sm text-gray-500">
            {topic.topic.first_name} {topic.topic.last_name}
          </div>
        </div>

        <h2 className="font-bold mb-4">{topic.replies.length} odgovora</h2>
        <div className="space-y-4 mb-6">
          {topic.replies.map(r => (
            <div key={r.id} className="card p-4">
              <div className="font-medium text-sm mb-2">{r.first_name} {r.last_name}</div>
              <div className="text-gray-700">{r.content}</div>
            </div>
          ))}
        </div>

        <div className="card p-4">
          <textarea className="input min-h-[100px] mb-3" placeholder="Napišite odgovor..." value={reply} onChange={e => setReply(e.target.value)} />
          <button onClick={submitReply} className="btn-primary">Odgovori</button>
        </div>
      </div>
    </Layout>
  );
}

export function NewForumTopicPage() {
  const [form, setForm] = useState({ section: 'pitanja' as ForumSection, title: '', content: '' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const topic = await api.post<{ id: string }>('/forum', form);
    window.location.href = `/forum/${topic.id}`;
  };

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
            <input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Sadržaj</label>
            <textarea className="input min-h-[200px]" value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} required />
          </div>
          <button type="submit" className="btn-primary">Objavi temu</button>
        </form>
      </div>
    </Layout>
  );
}
