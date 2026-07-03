import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { useAuthStore } from '../store/authStore';
import { api } from '../services/api';
import { User } from '@zavrsi-mi/shared';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await api.post<{ user: User; accessToken: string }>('/auth/login', { email, password });
      setAuth(result.user, result.accessToken);
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <Helmet><title>Prijava</title></Helmet>
      <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Dobrodošli nazad</h1>
            <p className="text-gray-500 mt-2">Prijavite se na vaš nalog</p>
          </div>

          <div className="card p-8">
            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-xl text-sm">{error}</div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Email</label>
                <div className="relative">
                  <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="email" className="input pl-10" placeholder="vas@email.com"
                    value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Lozinka</label>
                <div className="relative">
                  <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type={showPassword ? 'text' : 'password'} className="input pl-10 pr-10"
                    placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                    onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <button type="submit" className="btn-primary w-full py-3" disabled={loading}>
                {loading ? 'Prijava...' : 'Prijavi se'}
              </button>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
              <div className="relative flex justify-center text-sm"><span className="px-4 bg-white text-gray-500">ili</span></div>
            </div>

            <a href="/api/auth/google" className="btn-secondary w-full py-3">
              <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Prijavi se sa Google
            </a>

            <p className="text-center text-sm text-gray-500 mt-6">
              <Link to="/zaboravljena-lozinka" className="text-brand-600 font-medium hover:underline block mb-2">Zaboravili ste lozinku?</Link>
              Nemate nalog? <Link to="/registracija" className="text-brand-600 font-medium hover:underline">Registrujte se</Link>
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}

export function RegisterPage() {
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({
    email: '', password: '', firstName: '', lastName: '', city: '',
    role: searchParams.get('role') === 'provider' ? 'provider' : 'user',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [captchaOk, setCaptchaOk] = useState(false);
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!captchaOk) { setError('Potvrdite da niste robot'); return; }
    setError('');
    setLoading(true);
    try {
      const result = await api.post<{ user: User; accessToken: string }>('/auth/register', {
        ...form,
        captchaToken: 'verified',
      });
      setAuth(result.user, result.accessToken);
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <Helmet><title>Registracija</title></Helmet>
      <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Kreirajte nalog</h1>
            <p className="text-gray-500 mt-2">Pridružite se Završi Mi zajednici</p>
          </div>

          <div className="card p-8">
            {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-xl text-sm">{error}</div>}

            <div className="flex gap-2 mb-6">
              <button type="button" onClick={() => setForm(f => ({ ...f, role: 'user' }))}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${form.role === 'user' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                Tražim uslugu
              </button>
              <button type="button" onClick={() => setForm(f => ({ ...f, role: 'provider' }))}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${form.role === 'provider' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                Pružam uslugu
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Ime</label>
                  <input className="input" value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} required />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Prezime</label>
                  <input className="input" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} required />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Email</label>
                <input type="email" className="input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Lozinka</label>
                <input type="password" className="input" minLength={8} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Grad</label>
                <input className="input" placeholder="npr. Beograd" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
              </div>
              <label className="flex items-center gap-2 cursor-pointer p-3 bg-gray-50 rounded-xl">
                <input type="checkbox" checked={captchaOk} onChange={e => setCaptchaOk(e.target.checked)}
                  className="rounded border-gray-300 text-brand-600" />
                <span className="text-sm text-gray-600">Nisam robot (CAPTCHA)</span>
              </label>
              <button type="submit" className="btn-primary w-full py-3" disabled={loading || !captchaOk}>
                {loading ? 'Registracija...' : 'Registruj se'}
              </button>
            </form>

            <p className="text-center text-sm text-gray-500 mt-6">
              Već imate nalog? <Link to="/prijava" className="text-brand-600 font-medium hover:underline">Prijavite se</Link>
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      localStorage.setItem('token', token);
      api.get<User>('/auth/me').then(user => {
        setAuth(user, token);
        navigate('/');
      }).catch(() => navigate('/prijava'));
    } else {
      navigate('/prijava');
    }
  }, [navigate, setAuth]);

  return (
    <Layout>
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full" />
      </div>
    </Layout>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [devToken, setDevToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await api.post<{ message: string; devToken?: string }>('/auth/forgot-password', { email });
      setMessage(result.message);
      if (result.devToken) setDevToken(result.devToken);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <Helmet><title>Zaboravljena lozinka</title></Helmet>
      <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md card p-8">
          <h1 className="text-2xl font-bold mb-2 dark:text-white">Reset lozinke</h1>
          <p className="text-gray-500 mb-6">Unesite email i poslaćemo vam link za reset.</p>
          {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-xl text-sm">{error}</div>}
          {message ? (
            <div className="p-4 bg-brand-50 dark:bg-brand-900/30 text-brand-800 dark:text-brand-200 rounded-xl text-sm">
              {message}
              {devToken && (
                <p className="mt-3">
                  <Link to={`/reset-lozinke?token=${devToken}&email=${encodeURIComponent(email)}`} className="font-medium underline">
                    Kliknite ovde za reset (dev)
                  </Link>
                </p>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <input type="email" className="input" placeholder="vas@email.com" value={email} onChange={e => setEmail(e.target.value)} required />
              <button type="submit" className="btn-primary w-full" disabled={loading}>
                {loading ? 'Slanje...' : 'Pošalji link'}
              </button>
            </form>
          )}
          <p className="text-center text-sm text-gray-500 mt-6">
            <Link to="/prijava" className="text-brand-600 hover:underline">Nazad na prijavu</Link>
          </p>
        </div>
      </div>
    </Layout>
  );
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: searchParams.get('email') || '',
    token: searchParams.get('token') || '',
    newPassword: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/reset-password', form);
      navigate('/prijava');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <Helmet><title>Nova lozinka</title></Helmet>
      <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md card p-8">
          <h1 className="text-2xl font-bold mb-6 dark:text-white">Postavite novu lozinku</h1>
          {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-xl text-sm">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <input type="email" className="input" placeholder="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
            <input type="text" className="input" placeholder="Token iz emaila" value={form.token} onChange={e => setForm(f => ({ ...f, token: e.target.value }))} required />
            <input type="password" className="input" placeholder="Nova lozinka (min 8)" minLength={8} value={form.newPassword} onChange={e => setForm(f => ({ ...f, newPassword: e.target.value }))} required />
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? 'Čuvanje...' : 'Promeni lozinku'}
            </button>
          </form>
        </div>
      </div>
    </Layout>
  );
}
