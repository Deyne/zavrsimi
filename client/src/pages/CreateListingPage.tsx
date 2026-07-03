import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Upload, AlertTriangle } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { useAuthStore } from '../store/authStore';
import { api } from '../services/api';
import { Category } from '@zavrsi-mi/shared';

import { useToast } from '../components/ui/Toast';

export default function CreateListingPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const toast = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [images, setImages] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    type: 'offer',
    title: '',
    description: '',
    categoryId: '',
    subcategoryId: '',
    city: user?.city || '',
    address: '',
    price: '',
    priceType: 'fixed' as 'fixed' | 'negotiable' | 'inquiry',
    phone: user?.phone || '',
  });

  useEffect(() => {
    if (!user) { navigate('/prijava'); return; }
    api.get<Category[]>('/listings/categories').then(setCategories);
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData();
    Object.entries(form).forEach(([k, v]) => {
      if (k === 'priceType') {
        formData.append(k, String(v));
      } else if (v !== '') {
        formData.append(k, String(v));
      }
    });
    images.forEach(img => formData.append('images', img));

    try {
      const listing = await api.upload<{ id: string; status: string }>('/listings', formData);
      toast.show('Oglas poslat na proveru! Biće vidljiv nakon odobrenja administratora.', 'success');
      navigate(`/oglas/${listing.id}`);
    } catch (err) {
      toast.show((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const selectedCategory = categories.find(c => c.id === parseInt(form.categoryId));

  return (
    <Layout>
      <Helmet><title>Objavi oglas</title></Helmet>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-3xl font-bold text-heading mb-2">Objavi oglas</h1>
        <p className="text-muted mb-8">Ponudite uslugu, zatražite pomoć ili objavite hitan zahtev</p>

        <div className="flex gap-2 mb-8">
          {[
            { value: 'offer', label: 'Ponuda usluge' },
            { value: 'request', label: 'Tražim uslugu' },
            { value: 'sos', label: 'HITNO', icon: AlertTriangle },
          ].map(opt => (
            <button key={opt.value} type="button"
              onClick={() => setForm(f => ({ ...f, type: opt.value }))}
              className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all ${
                form.type === opt.value
                  ? opt.value === 'sos' ? 'bg-red-600 text-white' : 'bg-brand-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {opt.icon && <AlertTriangle size={14} className="inline mr-1" />}
              {opt.label}
            </button>
          ))}
        </div>

        {form.type === 'sos' && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm">
            <AlertTriangle size={16} className="inline mr-1" />
            SOS oglasi imaju prioritet i odmah su vidljivi svim majstorima u blizini.
          </div>
        )}

        <form onSubmit={handleSubmit} className="card p-6 space-y-5">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Naslov *</label>
            <input className="input" placeholder="npr. Profesionalno farbanje stanova" value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required minLength={5} />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Opis *</label>
            <textarea className="input min-h-[150px]" placeholder="Detaljno opišite uslugu..."
              value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} required minLength={20} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Kategorija *</label>
              <select className="input" value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value, subcategoryId: '' }))} required>
                <option value="">Izaberite...</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            {selectedCategory?.subcategories && selectedCategory.subcategories.length > 0 && (
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Podkategorija</label>
                <select className="input" value={form.subcategoryId} onChange={e => setForm(f => ({ ...f, subcategoryId: e.target.value }))}>
                  <option value="">Izaberite...</option>
                  {selectedCategory.subcategories.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Grad *</label>
              <input className="input" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} required />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Adresa</label>
              <input className="input" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Cena</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {[
                { value: 'fixed', label: 'Fiksna cena' },
                { value: 'negotiable', label: 'Po dogovoru' },
                { value: 'inquiry', label: 'Po upitu' },
              ].map(opt => (
                <button key={opt.value} type="button"
                  onClick={() => setForm(f => ({ ...f, priceType: opt.value as typeof form.priceType }))}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium ${form.priceType === opt.value ? 'bg-brand-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {form.priceType === 'fixed' && (
              <input className="input" type="number" placeholder="Cena u RSD" value={form.price}
                onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
            )}
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Telefon</label>
            <input className="input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">Slike (do 10)</label>
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-brand-300 transition-colors">
              <Upload size={32} className="mx-auto text-gray-400 mb-2" />
              <input type="file" accept="image/*" multiple className="hidden" id="images"
                onChange={e => setImages(Array.from(e.target.files || []).slice(0, 10))} />
              <label htmlFor="images" className="text-sm text-brand-600 cursor-pointer hover:underline">
                Kliknite za upload slika
              </label>
              {images.length > 0 && <p className="text-sm text-gray-500 mt-2">{images.length} slika izabrano</p>}
            </div>
          </div>

          <button type="submit" className={`w-full py-3 rounded-xl font-medium text-white ${form.type === 'sos' ? 'bg-red-600 hover:bg-red-700' : 'btn-primary'}`} disabled={loading}>
            {loading ? 'Objavljivanje...' : form.type === 'sos' ? 'Objavi HITNO' : 'Objavi oglas'}
          </button>
        </form>
      </div>
    </Layout>
  );
}
