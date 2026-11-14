CREATE TABLE club_book_files (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),club_id uuid NOT NULL REFERENCES clubs(id),book_id uuid NOT NULL,uploaded_by uuid NOT NULL REFERENCES users(id),
 filename text NOT NULL CHECK(char_length(filename) BETWEEN 1 AND 150),source text NOT NULL CHECK(char_length(source) BETWEEN 3 AND 500),license text NOT NULL CHECK(char_length(license) BETWEEN 5 AND 1000),
 object_key text NOT NULL UNIQUE,sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 10000000),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','active','deleted','purged')),created_at timestamptz NOT NULL DEFAULT now(),deleted_at timestamptz,
 FOREIGN KEY(club_id,uploaded_by) REFERENCES club_memberships(club_id,user_id)
);
CREATE UNIQUE INDEX club_book_original ON club_book_files(club_id,book_id) WHERE state IN ('pending','active');
CREATE INDEX club_book_file_cleanup ON club_book_files(state,created_at) WHERE state IN ('pending','deleted');
CREATE INDEX club_book_file_quota ON club_book_files(club_id,state);
