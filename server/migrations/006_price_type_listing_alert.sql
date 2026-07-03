-- Tip cene oglasa + tip poruke za SOS obaveštenja
ALTER TABLE listings ADD COLUMN IF NOT EXISTS price_type VARCHAR(20) NOT NULL DEFAULT 'fixed';

UPDATE listings SET price_type = 'negotiable' WHERE price_negotiable = true AND (price IS NULL OR price = 0);
UPDATE listings SET price_type = 'fixed' WHERE price_type IS NULL OR price_type = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'message_type' AND e.enumlabel = 'listing_alert'
  ) THEN
    ALTER TYPE message_type ADD VALUE 'listing_alert';
  END IF;
END $$;
