-- Existing accounts retain access. Missing proof is never backfilled as acceptance.
ALTER TABLE users ADD COLUMN legal_review_required boolean NOT NULL DEFAULT false;
ALTER TABLE users ALTER COLUMN legal_review_required SET DEFAULT true;

CREATE TABLE legal_acceptances (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  terms_version text NOT NULL CHECK (char_length(terms_version) BETWEEN 1 AND 32),
  privacy_version text NOT NULL CHECK (char_length(privacy_version) BETWEEN 1 AND 32),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, terms_version, privacy_version)
);
