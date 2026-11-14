CREATE TABLE private_book_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id),
  book_id uuid NOT NULL,
  object_key text NOT NULL UNIQUE,
  filename text NOT NULL CHECK (char_length(filename) BETWEEN 1 AND 150),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 10000000),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','active','deleted','purged')),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX one_active_private_file ON private_book_files(owner_user_id,book_id) WHERE state='active';
CREATE UNIQUE INDEX private_files_deduplicate ON private_book_files(owner_user_id,sha256) WHERE state='active';
CREATE INDEX private_files_by_owner ON private_book_files(owner_user_id,state,created_at);
CREATE INDEX private_files_cleanup ON private_book_files(created_at) WHERE state IN ('deleted','pending');
