import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { AlertTriangle, Phone, Clock } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { ListingCard } from '../components/ui/ListingCard';
import { api } from '../services/api';
import { Listing } from '@zavrsi-mi/shared';
import { Link } from 'react-router-dom';

export default function SOSPage() {
  const [listings, setListings] = useState<Listing[]>([]);

  useEffect(() => {
    api.get<Listing[]>('/listings/sos').then(setListings).catch(() => {});
  }, []);

  return (
    <Layout>
      <Helmet>
        <title>Hitne usluge - SOS</title>
        <meta name="description" content="Hitni zahtevi za usluge u vašem gradu." />
      </Helmet>

      <div className="bg-red-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-2xl">
              <AlertTriangle size={32} />
            </div>
            <div>
              <h1 className="text-3xl font-bold">HITNO MI TREBA USLUGA</h1>
              <p className="text-red-100 mt-1">Prioritetni zahtevi koji zahtevaju brzu reakciju</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <p className="text-gray-500">{listings.length} aktivnih hitnih zahteva</p>
          <Link to="/objavi" className="btn-danger">
            <AlertTriangle size={16} /> Objavi hitan zahtev
          </Link>
        </div>

        {listings.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {listings.map(listing => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 card">
            <AlertTriangle size={48} className="mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium mb-2">Nema aktivnih hitnih zahteva</h3>
            <p className="text-gray-500 mb-4">Trenutno nema hitnih zahteva u vašem gradu</p>
            <Link to="/objavi" className="btn-danger inline-flex">
              <AlertTriangle size={16} /> Objavi hitan zahtev
            </Link>
          </div>
        )}

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { icon: AlertTriangle, title: 'Prioritet', desc: 'SOS oglasi se prikazuju na vrhu i imaju posebnu oznaku' },
            { icon: Phone, title: 'Brza reakcija', desc: 'Majstori u blizini dobijaju obaveštenje o hitnom zahtevu' },
            { icon: Clock, title: '24/7 dostupnost', desc: 'Hitni zahtevi su vidljivi non-stop dok se ne reše' },
          ].map(item => (
            <div key={item.title} className="card p-6 text-center">
              <item.icon size={32} className="mx-auto text-red-500 mb-3" />
              <h3 className="font-semibold mb-2">{item.title}</h3>
              <p className="text-sm text-gray-500">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
