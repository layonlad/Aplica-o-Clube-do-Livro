-- An editorial topic reuses posts, comments, likes, saves and moderation.
INSERT INTO users(id,firebase_uid,email,name)
VALUES ('83bf6008-790b-4a72-a259-8791c302b061','~literary-editorial','editorial@catalog.invalid','Notícias Literárias');
INSERT INTO profiles(user_id,handle,display_name,is_public)
VALUES ('83bf6008-790b-4a72-a259-8791c302b061','noticias_do_catalogo','Notícias Literárias',false);

CREATE TABLE literary_news (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL UNIQUE REFERENCES social_posts(id),
  title text NOT NULL CHECK(char_length(title) BETWEEN 1 AND 300),
  summary text CHECK(char_length(summary)<=600),
  source text NOT NULL CHECK(char_length(source) BETWEEN 1 AND 100),
  url text NOT NULL UNIQUE CHECK(char_length(url)<=500 AND url LIKE 'https://%'),
  fingerprint text NOT NULL UNIQUE CHECK(length(fingerprint)=64),
  author text CHECK(char_length(author)<=150),
  category text NOT NULL CHECK(char_length(category)<=40),
  published_at timestamptz NOT NULL,
  collected_at timestamptz NOT NULL DEFAULT now(),
  book_id text CHECK(char_length(book_id)<=100)
);
CREATE INDEX literary_news_page ON literary_news(published_at DESC,id DESC);
CREATE INDEX literary_news_category_page ON literary_news(category,published_at DESC,id DESC);
CREATE TABLE literary_news_sync (
  id text PRIMARY KEY,
  checked_at timestamptz NOT NULL
);
CREATE TABLE literary_follows (
  user_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK(kind IN ('topic','debate')),
  item_key text NOT NULL CHECK(char_length(item_key) BETWEEN 1 AND 60),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,kind,item_key)
);
