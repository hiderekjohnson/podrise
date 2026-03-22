-- Migration: Replace password-based admin auth with Google OAuth
-- Remove legacy columns and seed derek@podrise.com as the only admin

DELETE FROM admin_users;

INSERT INTO admin_users (email, name, role) VALUES ('derek@podrise.com', 'Derek', 'owner')
ON CONFLICT (email) DO UPDATE SET role = 'owner', name = 'Derek';

ALTER TABLE admin_users DROP COLUMN IF EXISTS password_hash;
ALTER TABLE admin_users DROP COLUMN IF EXISTS invite_token;
ALTER TABLE admin_users DROP COLUMN IF EXISTS invite_sent_at;
ALTER TABLE admin_users DROP COLUMN IF EXISTS status;
