ALTER TABLE private_book_files ADD COLUMN export_permission text NOT NULL DEFAULT 'blocked'
  CHECK (export_permission IN ('blocked', 'personal', 'public_domain', 'licensed_transfer'));

CREATE TABLE external_reading_progress (
  user_id uuid NOT NULL REFERENCES personal_workspaces(user_id) ON DELETE CASCADE,
  book_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider = 'kindle'),
  percentage integer NOT NULL CHECK (percentage BETWEEN 0 AND 100),
  chapter text NOT NULL CHECK (length(chapter) <= 150),
  reading_date date NOT NULL,
  observation text NOT NULL CHECK (length(observation) <= 1000),
  include_in_summary boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, book_id, provider)
);

CREATE TABLE imported_reading_annotations (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES personal_workspaces(user_id) ON DELETE CASCADE,
  book_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider = 'kindle'),
  fingerprint text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('note','highlight')),
  source_book text NOT NULL CHECK (length(source_book) <= 400),
  location text NOT NULL CHECK (length(location) <= 80),
  source_date text NOT NULL CHECK (length(source_date) <= 160),
  content text NOT NULL CHECK (length(content) BETWEEN 1 AND 2000),
  personal_note text NOT NULL DEFAULT '' CHECK (length(personal_note) <= 2000),
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, book_id, provider, fingerprint)
);

CREATE TABLE reading_export_attempts (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES personal_workspaces(user_id) ON DELETE CASCADE,
  book_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider = 'kindle'),
  status text NOT NULL CHECK (status IN ('preparing','available','preparation_failed','download_started','share_requested')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reading_export_attempts_by_book
  ON reading_export_attempts(user_id, book_id, provider, created_at DESC, id DESC);
