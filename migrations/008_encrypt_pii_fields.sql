-- Migration: 008_encrypt_pii_fields
-- Description: Increase column sizes to accommodate encrypted PII blobs

-- Transactions table
ALTER TABLE transactions 
  ALTER COLUMN phone_number TYPE TEXT,
  ALTER COLUMN stellar_address TYPE TEXT,
  ALTER COLUMN notes TYPE TEXT,
  ALTER COLUMN admin_notes TYPE TEXT;

-- Users table
ALTER TABLE users 
  ALTER COLUMN phone_number TYPE TEXT,
  ALTER COLUMN email TYPE TEXT,
  ALTER COLUMN two_factor_secret TYPE TEXT;

-- Note: We are keeping the existing data as is for now. 
-- In a real scenario, we would also need a data migration script to encrypt existing rows.
