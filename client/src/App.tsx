import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { ToastContainer } from './components/ui/Toast';
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

function App() {
  const { fetchUser } = useAuthStore();

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  return (
    <>
      <ToastContainer />
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
