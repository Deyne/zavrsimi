import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Upload, X } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { useAuthStore } from '../store/authStore';
import { api } from '../services/api';
import { Category, Listing } from '@zavrsi-mi/shared';
import { useToast } from '../components/ui/Toast';

export default function EditListingPage() {
  const { id } = useParams();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const toast = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [existingImages, setExistingImages] = useState<{ url: string }[]>([]);
  const [newImages, setNewImages] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    type: 'offer',
    title: '',
    description: '',
    categoryId: '',
    subcategoryId: '',
    city: '',
    address: '',
    price: '',
    priceType: 'fixed' as 'fixed' | 'negotiable' | 'inquiry',
    phone: '',
  });

  useEffect(() => {
    if (!user) { navigate('/prijava'); return; }
    api.get<Category[]>('/listings/categories').then(setCategories);
    if (id) {
      api.get<Listing>(`/listings/${id}`).then(listing => {
        const canEdit = user.id === listing.userId || user.role === 'admin' || user.role === 'moderator';
        if (!canEdit) { navigate(`/oglas/${id}`); return; }
        setForm({
          type: listing.type,
          title: listing.title,
          description: listing.description,
          categoryId: String(listing.categoryId),
          subcategoryId: listing.subcategoryId ? String(listing.subcategoryId) : '',
          city: listing.city,
          address: listing.address || '',
          price: listing.price !== undefined ? String(listing.price) : '',
          priceType: (listing.priceType || (listing.priceNegotiable ? 'negotiable' : 'fixed')) as 'fixed' | 'negotiable' | 'inquiry',
          phone: listing.phone || '',
        });
        setExistingImages(listing.images.map(i => ({ url: i.url })));
      }).catch(() => navigate('/oglasi'));
    }
  }, [user, id, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setLoading(true);

    const formData = new FormData();
    Object.entries(form).forEach(([k, v]) => {
      if (k === 'priceType') formData.append(k, String(v));
      else if (v !== '') formData.append(k, String(v));
    });
    existingImages.forEach(img => formData.append('keepImages', img.url));
    newImages.forEach(img => formData.append('images', img));

    try {
      const listing = await api.uploadPut<Listing>(`/listings/${id}`, formData);
      toast.show(
        user?.role === 'admin' || user?.role === 'moderator'
          ? 'Oglas ažuriran!'
          : 'Oglas ažuriran i poslat na ponovnu proveru.',
        'success'
      );
      navigate(`/oglas/${listing.id}`);
    } catch (err) {
      toast.show((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const selectedCategory = categories.find(c => c.id === parseInt(form.categoryId));
  const isStaff = user?.role === 'admin' || user?.role === 'moderator';

  return (
    <Layout>
      <Helmet><title>Izmeni oglas</title></Helmet>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-3xl font-bold text-heading mb-2">Izmeni oglas</h1>
        <p className="text-muted mb-8">
          {isStaff ? 'Izmenite oglas kao administrator.' : 'Nakon izmene oglas ide na ponovnu proveru.'}
        </p>

        <form onSubmit={handleSubmit} className="card p-6 space-y-5">
          <div>
            <label className="text-sm font-medium text-body mb-1 block">Naslov *</label>
            <input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required minLength={5} />
          </div>
          <div>
            <label className="text-sm font-medium text-body mb-1 block">Opis *</label>
            <textarea className="input min-h-[150px]" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} required minLength={20} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-body mb-1 block">Kategorija *</label>
              <select className="input" value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value, subcategoryId: '' }))} required>
                <option value="">Izaberite...</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            {selectedCategory?.subcategories && selectedCategory.subcategories.length > 0 && (
              <div>
                <label className="text-sm font-medium text-body mb-1 block">Podkategorija</label>
                <select className="input" value={form.subcategoryId} onChange={e => setForm(f => ({ ...f, subcategoryId: e.target.value }))}>
                  <option value="">Izaberite...</option>
                  {selectedCategory.subcategories.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-body mb-1 block">Grad *</label>
              <input className="input" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} required />
            </div>
            <div>
              <label className="text-sm font-medium text-body mb-1 block">Adresa</label>
              <input className="input" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-body mb-2 block">Cena</label>
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
              <input className="input" type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
            )}
          </div>
          <div>
            <label className="text-sm font-medium text-body mb-1 block">Telefon</label>
            <input className="input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium text-body mb-2 block">Slike</label>
            {existingImages.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {existingImages.map((img, i) => (
                  <div key={img.url} className="relative w-20 h-14 rounded-lg overflow-hidden">
                    <img src={img.url} alt="" className="w-full h-full object-cover" />
                    <button type="button" onClick={() => setExistingImages(prev => prev.filter((_, j) => j !== i))}
                      className="absolute top-0.5 right-0.5 p-0.5 bg-black/50 rounded text-white">
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-6 text-center">
              <Upload size={32} className="mx-auto text-gray-400 mb-2" />
              <input type="file" accept="image/*" multiple className="hidden" id="edit-images"
                onChange={e => setNewImages(Array.from(e.target.files || []).slice(0, 10))} />
              <label htmlFor="edit-images" className="text-sm text-brand-600 cursor-pointer hover:underline">Dodaj nove slike</label>
              {newImages.length > 0 && <p className="text-sm text-muted mt-2">{newImages.length} novih slika</p>}
            </div>
          </div>
          <button type="submit" className="btn-primary w-full py-3" disabled={loading}>
            {loading ? 'Čuvanje...' : 'Sačuvaj izmene'}
          </button>
        </form>
      </div>
    </Layout>
  );
}
