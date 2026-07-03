# Završi Mi

Platforma za lokalne usluge — kombinacija oglasa, zajednice i marketplace-a za majstore i usluge.

## Tehnologije

| Sloj | Tehnologija |
|------|-------------|
| Frontend | React 18, TypeScript, Tailwind CSS, Vite |
| Backend | Node.js, Express, TypeScript |
| Baza | PostgreSQL 16 |
| Keš / sesije | Redis 7 |
| Real-time | Socket.io |
| Autentifikacija | JWT + Google OAuth |

## Struktura projekta

```
Deyne Test Site/
├── client/          # React frontend
├── server/          # Express API + Socket.io
├── shared/          # Deljeni TypeScript tipovi
├── docker-compose.yml
└── README.md
```

## Brzo pokretanje

### Preduslovi

- Node.js 18+
- **Jedno od sledećeg:**
  - [Docker Desktop](https://www.docker.com/products/docker-desktop/) (preporučeno), ili
  - PostgreSQL 16 instaliran lokalno na Windows-u

> **Napomena:** Na novijim verzijama Docker-a komanda je `docker compose` (sa razmakom), ne `docker-compose`.

Provera okruženja:

```bash
npm run setup
```

### 1. Instalacija

```bash
cd "C:\Users\Administrator\Desktop\Deyne Test Site"
npm install
cp .env.example .env
```

### 2. Pokreni bazu

**Sa Docker Desktop-om** (mora biti instaliran i pokrenut):

```bash
npm run docker:up
```

**Bez Docker-a** — instaliraj [PostgreSQL za Windows](https://www.postgresql.org/download/windows/), zatim u pgAdmin-u pokreni SQL fajl:

`server/migrations/001_initial_schema.sql`

U `.env` podesi:

```
DATABASE_URL=postgresql://TVOJ_USER:TVOJA_LOZINKA@localhost:5432/zavrsi_mi
```

Redis **nije obavezan** — server radi i bez njega.

### 3. Pokreni aplikaciju

```bash
npm run dev
```

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:3001
- **Health check:** http://localhost:3001/api/health

## Funkcionalnosti

### Korisnički nalozi
- 4 tipa: Gost, Korisnik, Pružalac usluga, Administrator
- Registracija / prijava (email + Google OAuth)
- Profil, lozinka, avatar, lokacija

### Oglasi
- Ponuda usluge, zahtev za uslugu, SOS hitni zahtevi
- 13 kategorija sa podkategorijama
- Do 10 slika po oglasu
- Admin odobravanje oglasa

### Obrnuti sistem (zahtevi)
- Korisnik objavljuje zahtev → majstori šalju ponude
- Ponuda: cena, opis, procenjeno vreme
- Korisnik bira jednu ponudu

### Ocenjivanje i reputacija
- Ocena 1–5, komentar, preporuka
- Nivoi: Novi član → Elitni majstor

### Verifikacija
- Potvrđen telefon / email
- Verifikovan korisnik / majstor / Top pružalac
- Admin odobrava

### Chat (Socket.io)
- Tekstualne poruke i slike
- Online/offline status
- Real-time obaveštenja

### Forum
- Preporuke, Iskustva, Pitanja, Opšte diskusije

### Pretraga i filteri
- Grad, kategorija, cena, ocena, udaljenost, verifikacija

### Mapa
- OpenStreetMap + Leaflet
- Prikaz majstora na mapi

### Admin panel
- Korisnici, oglasi, verifikacije, statistika, suspenzija

### Sigurnost
- JWT autentifikacija
- Rate limiting
- Helmet, XSS sanitizacija
- Parametrizovani SQL upiti

### SEO
- Meta tagovi, Open Graph
- Sitemap (`/api/sitemap.xml`)
- SEO-friendly URL-ovi (`/oglas/:id`, `/oglasi`, `/forum`)

## API rute

| Metoda | Ruta | Opis |
|--------|------|------|
| POST | `/api/auth/register` | Registracija |
| POST | `/api/auth/login` | Prijava |
| GET | `/api/auth/me` | Trenutni korisnik |
| GET | `/api/listings/search` | Pretraga oglasa |
| POST | `/api/listings` | Novi oglas |
| GET | `/api/listings/sos` | Hitni oglasi |
| POST | `/api/listings/:id/bids` | Ponuda na zahtev |
| POST | `/api/reviews` | Ocena |
| GET | `/api/messages` | Razgovori |
| GET | `/api/forum` | Forum teme |
| GET | `/api/admin/stats` | Admin statistika |

## Admin nalog

```
Email: admin@zavrsimi.rs
Lozinka: Admin123!
```

## Produkcija

1. Postavite `.env` sa produkcijskim vrednostima
2. `npm run build`
3. Koristite reverse proxy (nginx) za frontend + API
4. Omogućite HTTPS
5. Podesite Google OAuth i reCAPTCHA ključeve

## Licenca

Privatni projekat — Završi Mi © 2026
