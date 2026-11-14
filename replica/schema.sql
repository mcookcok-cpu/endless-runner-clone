-- OPSIONAL, fase 3 saja (leaderboard + cloud save). Tidak dipakai di v1.
-- Waktu timestamptz (UTC). Postgres atau ekuivalen SQLite bila disederhanakan.

create table players (
  id uuid primary key default gen_random_uuid(),
  handle text not null unique check (char_length(handle) between 2 and 24),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table scores (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  score integer not null check (score >= 0),
  coins integer not null default 0 check (coins >= 0),
  seed text not null,                 -- untuk verifikasi ulang lari
  duration_ms integer not null check (duration_ms > 0),
  created_at timestamptz not null default now()
);
create index on scores (player_id, created_at desc);
create index on scores (score desc, created_at);

create table cloud_saves (
  player_id uuid primary key references players(id) on delete cascade,
  version integer not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Akses: cek otorisasi di data layer (pemain hanya boleh menulis baris miliknya).
-- Anti-curang: skor yang tidak masuk akal (skor/durasi di luar batas) ditolak di server.
