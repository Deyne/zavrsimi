import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Menu, X, Search, Plus, MessageCircle, User, LogOut,
  Map, Users, Shield, AlertTriangle, Home, Sun, Moon
} from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { api } from '../../services/api';
import { getSocket } from '../../services/socket';
import clsx from 'clsx';

function UserAvatar({ user, size = 'md' }: { user: { firstName: string; lastName: string; avatarUrl?: string }; size?: 'sm' | 'md' }) {
  const dims = size === 'sm' ? 'w-8 h-8 text-sm' : 'w-9 h-9 text-sm';
  if (user.avatarUrl) {
    return <img src={user.avatarUrl} alt="" className={`${dims} rounded-full object-cover ring-2 ring-brand-100 dark:ring-brand-900`} />;
  }
  return (
    <div className={`${dims} rounded-full bg-brand-100 dark:bg-brand-900 flex items-center justify-center text-brand-700 dark:text-brand-300 font-medium`}>
      {user.firstName[0]}{user.lastName[0]}
    </div>
  );
}

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const { user, logout } = useAuthStore();
  const { theme, toggle } = useThemeStore();
  const location = useLocation();
  const navigate = useNavigate();

  const fetchUnread = useCallback(() => {
    if (!user) return;
    api.get<{ count: number }>('/messages/unread-count')
      .then(r => setUnreadCount(r.count))
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    fetchUnread();
    if (!user) return;
    const socket = getSocket();
    const onNotify = () => fetchUnread();
    socket.on('notification:message', onNotify);
    const interval = setInterval(fetchUnread, 30000);
    return () => {
      socket.off('notification:message', onNotify);
      clearInterval(interval);
    };
  }, [user, fetchUnread]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const navLinks = [
    { to: '/oglasi', label: 'Oglasi', icon: Search },
    ...(user ? [{ to: '/hitno', label: 'Hitno', icon: AlertTriangle }] : []),
    { to: '/forum', label: 'Forum', icon: Users },
    { to: '/mapa', label: 'Majstori', icon: Map },
  ];

  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <header className="sticky top-0 z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-b border-gray-100 dark:border-gray-800 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-9 h-9 bg-brand-600 rounded-xl flex items-center justify-center shadow-sm group-hover:bg-brand-500 transition-colors">
              <span className="text-white font-bold text-lg">Z</span>
            </div>
            <span className="font-bold text-xl text-gray-900 dark:text-white hidden sm:block">
              Završi <span className="text-brand-600 dark:text-brand-400">Mi</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map(link => (
              <Link
                key={link.to}
                to={link.to}
                className={clsx(
                  'nav-link',
                  isActive(link.to) ? 'nav-link-active' : 'nav-link-idle'
                )}
              >
                <link.icon size={16} />
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={toggle}
              className="p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              title={theme === 'light' ? 'Tamna tema' : 'Svetla tema'}
            >
              {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
            </button>

            <Link to="/objavi" className="btn-primary text-sm hidden sm:inline-flex">
              <Plus size={16} /> Objavi oglas
            </Link>

            {user ? (
              <div className="flex items-center gap-2">
                <Link to="/poruke" className="p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 relative">
                  <MessageCircle size={20} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-accent-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </Link>
                <div className="relative group">
                  <button className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800">
                    <UserAvatar user={user} size="sm" />
                  </button>
                  <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-100 dark:border-gray-800 py-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                    <Link to="/profil" className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800">
                      <User size={16} /> Profil
                    </Link>
                    {(user.role === 'admin' || user.role === 'moderator') && (
                      <Link to="/admin" className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800">
                        <Shield size={16} /> Admin panel
                      </Link>
                    )}
                    <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 w-full">
                      <LogOut size={16} /> Odjavi se
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link to="/prijava" className="btn-secondary text-sm hidden sm:inline-flex">Prijava</Link>
                <Link to="/registracija" className="btn-primary text-sm">Registracija</Link>
              </div>
            )}

            <button
              className="md:hidden p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <nav className="md:hidden py-4 border-t border-gray-100 dark:border-gray-800 space-y-1">
            <Link to="/" className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800" onClick={() => setMobileOpen(false)}>
              <Home size={18} /> Početna
            </Link>
            {navLinks.map(link => (
              <Link key={link.to} to={link.to} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800" onClick={() => setMobileOpen(false)}>
                <link.icon size={18} /> {link.label}
              </Link>
            ))}
            <Link to="/objavi" className="flex items-center gap-2 px-3 py-2 rounded-lg bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 font-medium" onClick={() => setMobileOpen(false)}>
              <Plus size={18} /> Objavi oglas
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}

export function Footer() {
  const { user } = useAuthStore();
  return (
    <footer className="bg-gray-900 text-gray-300 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold">Z</span>
              </div>
              <span className="font-bold text-white text-lg">Završi Mi</span>
            </div>
            <p className="text-sm text-gray-400">
              Pronađi pouzdane majstore i lokalne usluge u tvom gradu. Zajednica koja povezuje ljude.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-white mb-3">Platforma</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/oglasi" className="hover:text-white transition-colors">Oglasi</Link></li>
              <li>{user ? <Link to="/hitno" className="hover:text-white transition-colors">Hitne usluge</Link> : <span className="text-gray-600">Hitne usluge (prijava)</span>}</li>
              <li><Link to="/forum" className="hover:text-white transition-colors">Forum</Link></li>
              <li><Link to="/mapa" className="hover:text-white transition-colors">Mapa majstora</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-white mb-3">Kategorije</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/oglasi?categoryId=2" className="hover:text-white transition-colors">Vodoinstalateri</Link></li>
              <li><Link to="/oglasi?categoryId=3" className="hover:text-white transition-colors">Električari</Link></li>
              <li><Link to="/oglasi?categoryId=4" className="hover:text-white transition-colors">Moleri</Link></li>
              <li><Link to="/oglasi?categoryId=8" className="hover:text-white transition-colors">Čišćenje</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-white mb-3">Informacije</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/o-nama" className="hover:text-white transition-colors">O nama</Link></li>
              <li><Link to="/uslovi" className="hover:text-white transition-colors">Uslovi korišćenja</Link></li>
              <li><Link to="/privatnost" className="hover:text-white transition-colors">Privatnost</Link></li>
              <li><Link to="/kontakt" className="hover:text-white transition-colors">Kontakt</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-gray-800 mt-8 pt-8 text-center text-sm text-gray-500">
          &copy; {new Date().getFullYear()} Završi Mi. Sva prava zadržana.
        </div>
      </div>
    </footer>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  const [pendingListings, setPendingListings] = useState(0);

  useEffect(() => {
    if (!user) { setPendingListings(0); return; }
    const load = () => {
      api.get<{ count: number }>('/listings/my/pending-count')
        .then(r => setPendingListings(r.count))
        .catch(() => {});
    };
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [user]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">{children}</main>
      {pendingListings > 0 && (
        <Link
          to="/profil"
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 px-4 py-2.5 rounded-full bg-yellow-500 text-yellow-950 text-sm font-semibold shadow-lg hover:bg-yellow-400 transition-colors"
        >
          <AlertTriangle size={16} />
          {pendingListings} {pendingListings === 1 ? 'oglas' : 'oglasa'} na čekanju
        </Link>
      )}
      <Footer />
    </div>
  );
}
