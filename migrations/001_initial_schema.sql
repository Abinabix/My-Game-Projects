CREATE TABLE IF NOT EXISTS admin_users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS admin_users_email_lower_unique ON admin_users (LOWER(email));

CREATE TABLE IF NOT EXISTS sessions (
  sid VARCHAR(255) PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expire_idx ON sessions (expire);

CREATE TABLE IF NOT EXISTS projects (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  title_break_after TEXT NOT NULL DEFAULT '',
  slug TEXT NOT NULL UNIQUE,
  short_description TEXT NOT NULL,
  full_description TEXT NOT NULL DEFAULT '',
  cover_image TEXT,
  cover_public_id TEXT,
  cover_alt_text TEXT NOT NULL DEFAULT '',
  github_url TEXT,
  live_demo_url TEXT,
  game_url TEXT,
  video_url TEXT,
  category TEXT NOT NULL DEFAULT '',
  visual_label TEXT NOT NULL DEFAULT '',
  project_type TEXT NOT NULL DEFAULT '',
  project_status TEXT NOT NULL DEFAULT '',
  engine TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  tools JSONB NOT NULL DEFAULT '[]'::jsonb,
  technologies JSONB NOT NULL DEFAULT '[]'::jsonb,
  technical_features JSONB NOT NULL DEFAULT '[]'::jsonb,
  platform TEXT NOT NULL DEFAULT '',
  completion_date DATE,
  copyright_notice TEXT NOT NULL DEFAULT '',
  ownership_statement TEXT NOT NULL DEFAULT '',
  third_party_acknowledgements TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS projects_public_order_idx ON projects (status, display_order, published_at DESC);
CREATE INDEX IF NOT EXISTS projects_featured_idx ON projects (is_featured) WHERE is_featured = TRUE;
CREATE INDEX IF NOT EXISTS projects_title_search_idx ON projects USING GIN (to_tsvector('simple', title || ' ' || short_description));

CREATE TABLE IF NOT EXISTS project_images (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  cloudinary_public_id TEXT NOT NULL,
  alt_text TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS project_images_project_order_idx ON project_images (project_id, display_order, id);
CREATE INDEX IF NOT EXISTS project_images_cloudinary_idx ON project_images (cloudinary_public_id);

CREATE TABLE IF NOT EXISTS project_credits (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  resource_name TEXT NOT NULL,
  creator TEXT NOT NULL DEFAULT '',
  source_url TEXT,
  license_type TEXT NOT NULL DEFAULT '',
  attribution_text TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS project_credits_project_idx ON project_credits (project_id, id);

INSERT INTO projects (title, title_break_after, slug, short_description, full_description, category, visual_label, engine, role, technologies, technical_features, platform, project_status, status, display_order, published_at)
VALUES
  ('The Quiet Frontier.', 'QUIET', 'the-quiet-frontier', 'A stylized environment study focused on composition, atmosphere and readable forms. Built to explore how lighting and material choices can give a small world its own character.', 'A stylized environment study focused on composition, atmosphere and readable forms. Built to explore how lighting and material choices can give a small world its own character.', 'Personal Study', 'ENVIRONMENT STUDY', 'Unreal Engine 5', 'Environment / Lighting', '["Lumen", "Materials"]'::jsonb, '["Composition", "Atmosphere", "Readable forms"]'::jsonb, 'PC', 'Concept Study', 'published', 1, NOW()),
  ('After Hours.', 'AFTER', 'after-hours', 'An industrial lighting and material exploration built around contrast, controlled highlights and moody spatial design. The study tests a restrained palette with a strong visual focal point.', 'An industrial lighting and material exploration built around contrast, controlled highlights and moody spatial design. The study tests a restrained palette with a strong visual focal point.', 'Look Development', 'MATERIAL / LIGHT STUDY', 'Unreal Engine 5', 'LOOK DEV / LIGHTING', '["Post Process", "PBR"]'::jsonb, '["Contrast", "Controlled highlights", "Spatial design"]'::jsonb, 'PC', 'In Progress', 'published', 2, NOW())
ON CONFLICT (slug) DO NOTHING;
