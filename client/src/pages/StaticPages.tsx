import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Shield, Users, Star, Heart } from 'lucide-react';

function StaticLayout({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Layout>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
      </Helmet>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <h1 className="text-3xl font-bold text-heading mb-2">{title}</h1>
        <p className="text-muted mb-8">{description}</p>
        <div className="card p-8 prose-content">{children}</div>
      </div>
    </Layout>
  );
}

export function AboutPage() {
  return (
    <StaticLayout title="O nama" description="Saznajte više o platformi Završi Mi">
      <div className="space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-brand-600 rounded-xl flex items-center justify-center">
            <span className="text-white font-bold text-xl">Z</span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-heading m-0">Završi Mi</h2>
            <p className="text-sm text-muted m-0">Lokalne usluge, pouzdani majstori</p>
          </div>
        </div>

        <p>
          <strong className="text-heading">Završi Mi</strong> je platforma koja povezuje ljude sa pouzdanim lokalnim majstorima i pružaocima usluga.
          Bilo da tražite vodoinstalatera, molera, čuvara dece, petsitera ili bilo koju drugu uslugu — na pravom ste mestu.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { icon: Shield, title: 'Poverenje', desc: 'Verifikovani majstori i sistem ocenjivanja' },
            { icon: Users, title: 'Zajednica', desc: 'Forum za preporuke i iskustva' },
            { icon: Star, title: 'Kvalitet', desc: 'Ocene i reputacioni sistem' },
            { icon: Heart, title: 'Lokalno', desc: 'Usluge iz vašeg grada' },
          ].map(item => (
            <div key={item.title} className="p-4 surface-muted rounded-xl">
              <item.icon size={24} className="text-brand-600 dark:text-brand-400 mb-2" />
              <h3 className="font-semibold text-heading">{item.title}</h3>
              <p className="text-sm text-muted mt-1">{item.desc}</p>
            </div>
          ))}
        </div>

        <p>
          Naša misija je da olakšamo pronalaženje kvalitetnih usluga u vašem gradu,
          uz transparentne cene, proverene profile i podršku lokalne zajednice.
        </p>
      </div>
    </StaticLayout>
  );
}

export function TermsPage() {
  return (
    <StaticLayout title="Uslovi korišćenja" description="Uslovi korišćenja platforme Završi Mi">
      <div className="space-y-4 text-sm">
        <h2>1. Opšte odredbe</h2>
        <p>Korišćenjem platforme Završi Mi prihvatate ove uslove. Platforma služi kao posrednik između korisnika koji traže usluge i pružalaca usluga.</p>
        <h2>2. Registracija i nalozi</h2>
        <p>Korisnici su odgovorni za tačnost podataka pri registraciji. Zabranjeno je kreiranje lažnih naloga ili lažno predstavljanje.</p>
        <h2>3. Oglasi i usluge</h2>
        <p>Svi oglasi moraju biti tačni i zakoniti. Završi Mi zadržava pravo da ukloni oglase koji krše pravila. Transakcije se obavljaju direktno između korisnika.</p>
        <h2>4. Ocenjivanje</h2>
        <p>Ocene moraju biti iskrene i zasnovane na stvarnom iskustvu. Lažne ocene su zabranjene.</p>
        <h2>5. Odgovornost</h2>
        <p>Završi Mi nije odgovoran za kvalitet usluga koje pružaju majstori. Preporučujemo proveru profila, ocena i verifikacija pre angažovanja.</p>
        <h2>6. Izmene uslova</h2>
        <p>Zadržavamo pravo izmene ovih uslova. Korisnici će biti obavešteni o značajnim promenama.</p>
      </div>
    </StaticLayout>
  );
}

export function PrivacyPage() {
  return (
    <StaticLayout title="Politika privatnosti" description="Kako Završi Mi štiti vaše podatke">
      <div className="space-y-4 text-sm">
        <h2>Prikupljanje podataka</h2>
        <p>Prikupljamo podatke koje nam direktno pružite: ime, email, telefon, grad, i informacije iz profila i oglasa.</p>
        <h2>Korišćenje podataka</h2>
        <p>Podatke koristimo za pružanje usluge platforme, komunikaciju između korisnika, verifikaciju naloga i poboljšanje korisničkog iskustva.</p>
        <h2>Deljenje podataka</h2>
        <p>Ne prodajemo vaše podatke trećim stranama. Javni profil prikazuje ime, grad, ocene i verifikacije — ne prikazuje email.</p>
        <h2>Bezbednost</h2>
        <p>Koristimo JWT autentifikaciju, enkripciju lozinki (bcrypt) i HTTPS u produkciji. Redovno ažuriramo sigurnosne mere.</p>
        <h2>Vaša prava</h2>
        <p>Imate pravo na pristup, izmenu i brisanje vaših podataka. Kontaktirajte nas na <Link to="/kontakt">stranici za kontakt</Link>.</p>
        <h2>Kolačići</h2>
        <p>Koristimo neophodne kolačiće za autentifikaciju i funkcionisanje sajta.</p>
      </div>
    </StaticLayout>
  );
}

export function ContactPage() {
  return (
    <StaticLayout title="Kontakt" description="Kontaktirajte tim Završi Mi">
      <div className="space-y-6">
        <p>Imate pitanje, predlog ili problem? Javite nam se.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 surface-muted rounded-xl">
            <h3 className="font-semibold text-heading">Email</h3>
            <a href="mailto:info@zavrsimi.rs" className="text-brand-600 dark:text-brand-400 text-sm">info@zavrsimi.rs</a>
          </div>
          <div className="p-4 surface-muted rounded-xl">
            <h3 className="font-semibold text-heading">Podrška</h3>
            <a href="mailto:podrska@zavrsimi.rs" className="text-brand-600 dark:text-brand-400 text-sm">podrska@zavrsimi.rs</a>
          </div>
        </div>
        <form className="space-y-4" onSubmit={e => e.preventDefault()}>
          <div>
            <label className="text-sm font-medium text-body mb-1 block">Ime</label>
            <input className="input" placeholder="Vaše ime" />
          </div>
          <div>
            <label className="text-sm font-medium text-body mb-1 block">Email</label>
            <input type="email" className="input" placeholder="vas@email.com" />
          </div>
          <div>
            <label className="text-sm font-medium text-body mb-1 block">Poruka</label>
            <textarea className="input min-h-[120px]" placeholder="Vaša poruka..." />
          </div>
          <button type="submit" className="btn-primary">Pošalji poruku</button>
        </form>
      </div>
    </StaticLayout>
  );
}
