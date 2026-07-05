-- Glavni admin nalog (admin@zavrsimi.rs) je vlasnik platforme sa punim ovlašćenjima
UPDATE users SET is_platform_owner = false WHERE is_platform_owner = true;

UPDATE users
SET is_platform_owner = true, role = 'admin'
WHERE LOWER(email) = 'admin@zavrsimi.rs';
