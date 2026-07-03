-- Završi Mi - Initial Database Schema
-- PostgreSQL 16+

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Enums
CREATE TYPE user_role AS ENUM ('guest', 'user', 'provider', 'admin');
CREATE TYPE user_reputation AS ENUM ('novi_clan', 'pouzdan_clan', 'proveren_clan', 'ekspert', 'elitni_majstor');
CREATE TYPE listing_type AS ENUM ('offer', 'request', 'sos');
CREATE TYPE listing_status AS ENUM ('draft', 'pending', 'active', 'paused', 'completed', 'rejected', 'expired');
CREATE TYPE offer_status AS ENUM ('pending', 'accepted', 'rejected', 'withdrawn');
CREATE TYPE verification_type AS ENUM ('phone', 'email', 'user', 'provider', 'top_provider');
CREATE TYPE verification_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE availability_status AS ENUM ('free', 'busy', 'vacation');
CREATE TYPE forum_section AS ENUM ('preporuke', 'iskustva', 'pitanja', 'opste');
CREATE TYPE message_type AS ENUM ('text', 'image');

-- Categories
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE,
    icon VARCHAR(50),
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE subcategories (
    id SERIAL PRIMARY KEY,
    category_id INT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(category_id, slug)
);

-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255),
    google_id VARCHAR(255) UNIQUE,
    role user_role DEFAULT 'user',
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    avatar_url VARCHAR(500),
    bio TEXT,
    city VARCHAR(100),
    address VARCHAR(255),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    reputation user_reputation DEFAULT 'novi_clan',
    completed_jobs INT DEFAULT 0,
    average_rating DECIMAL(3, 2) DEFAULT 0,
    recommendation_count INT DEFAULT 0,
    is_online BOOLEAN DEFAULT false,
    last_seen TIMESTAMPTZ,
    is_suspended BOOLEAN DEFAULT false,
    email_verified BOOLEAN DEFAULT false,
    phone_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_city ON users(city);
CREATE INDEX idx_users_location ON users(latitude, longitude);

-- Verifications
CREATE TABLE verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type verification_type NOT NULL,
    status verification_status DEFAULT 'pending',
    document_url VARCHAR(500),
    admin_note TEXT,
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, type)
);

-- Listings (Oglasi)
CREATE TABLE listings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type listing_type NOT NULL DEFAULT 'offer',
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    category_id INT NOT NULL REFERENCES categories(id),
    subcategory_id INT REFERENCES subcategories(id),
    city VARCHAR(100) NOT NULL,
    address VARCHAR(255),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    price DECIMAL(12, 2),
    price_negotiable BOOLEAN DEFAULT false,
    phone VARCHAR(20),
    status listing_status DEFAULT 'pending',
    is_sos BOOLEAN DEFAULT false,
    view_count INT DEFAULT 0,
    published_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_listings_type ON listings(type);
CREATE INDEX idx_listings_status ON listings(status);
CREATE INDEX idx_listings_category ON listings(category_id);
CREATE INDEX idx_listings_city ON listings(city);
CREATE INDEX idx_listings_user ON listings(user_id);
CREATE INDEX idx_listings_sos ON listings(is_sos) WHERE is_sos = true;
CREATE INDEX idx_listings_search ON listings USING gin(to_tsvector('simple', title || ' ' || description));

-- Listing images
CREATE TABLE listing_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    url VARCHAR(500) NOT NULL,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bids/Ponude (for request listings)
CREATE TABLE bids (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    price DECIMAL(12, 2) NOT NULL,
    description TEXT NOT NULL,
    estimated_time VARCHAR(100),
    status offer_status DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(listing_id, provider_id)
);

-- Reviews
CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reviewee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    listing_id UUID REFERENCES listings(id) ON DELETE SET NULL,
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    is_recommended BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(reviewer_id, reviewee_id, listing_id)
);

CREATE INDEX idx_reviews_reviewee ON reviews(reviewee_id);

-- Availability calendar
CREATE TABLE availability (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    status availability_status NOT NULL DEFAULT 'free',
    note VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, date)
);

CREATE INDEX idx_availability_user_date ON availability(user_id, date);

-- Conversations & Messages
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    listing_id UUID REFERENCES listings(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE conversation_participants (
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_read_at TIMESTAMPTZ,
    PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type message_type DEFAULT 'text',
    content TEXT NOT NULL,
    image_url VARCHAR(500),
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);

-- Forum
CREATE TABLE forum_topics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    section forum_section NOT NULL,
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    is_pinned BOOLEAN DEFAULT false,
    is_locked BOOLEAN DEFAULT false,
    view_count INT DEFAULT 0,
    reply_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_forum_section ON forum_topics(section);

CREATE TABLE forum_replies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    topic_id UUID NOT NULL REFERENCES forum_topics(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Refresh tokens
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admin audit log
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID NOT NULL REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(50),
    target_id UUID,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed categories
INSERT INTO categories (name, slug, icon, sort_order) VALUES
('Kuća i stan', 'kuca-i-stan', 'home', 1),
('Vodoinstalateri', 'vodoinstalateri', 'droplet', 2),
('Električari', 'elektricari', 'zap', 3),
('Moleri', 'moleri', 'paintbrush', 4),
('Keramičari', 'keramicari', 'grid', 5),
('Dvorište i bašta', 'dvoriste-i-basta', 'tree', 6),
('Selidbe i prevoz', 'selidbe-i-prevoz', 'truck', 7),
('Čišćenje', 'ciscenje', 'sparkles', 8),
('Čuvanje dece', 'cuvanje-dece', 'baby', 9),
('Čuvanje kućnih ljubimaca', 'cuvanje-ljubimaca', 'paw', 10),
('IT usluge', 'it-usluge', 'monitor', 11),
('Privatni časovi', 'privatni-casovi', 'book', 12),
('Ostalo', 'ostalo', 'more', 13);

-- Default admin user (password: Admin123!)
INSERT INTO users (email, password_hash, role, first_name, last_name, email_verified, phone_verified)
VALUES (
    'admin@zavrsimi.rs',
    '$2a$12$OYz1PEVUWxgb2u6Ux0cBFOY.qC3n9D.DxfIZ2WmGRamZ0RsmFKsEG',
    'admin',
    'Admin',
    'Završi Mi',
    true,
    true
);
