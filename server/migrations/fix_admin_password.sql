-- Pokreni ovo u pgAdmin ili psql ako admin login ne radi
-- Lozinka: Admin123!

UPDATE users
SET password_hash = '$2a$12$OYz1PEVUWxgb2u6Ux0cBFOY.qC3n9D.DxfIZ2WmGRamZ0RsmFKsEG'
WHERE email = 'admin@zavrsimi.rs';
