-- ============================================================
-- Alte Schraubenfabrik Hagen – Audioguide
-- Datenbankschema für Supabase (Postgres + Auth + Storage)
--
-- Anwendung: Im Supabase-Dashboard unter "SQL Editor" einfügen
-- und einmal komplett ausführen ("Run"). Danach im Storage-Bereich
-- prüfen, dass die Buckets "station-media" existieren (werden
-- unten automatisch angelegt).
-- ============================================================

-- Erweiterungen, die wir brauchen (auf Supabase i.d.R. schon aktiv)
create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- Tabelle: stations
-- ------------------------------------------------------------
create table if not exists public.stations (
  id            text primary key,              -- z.B. '01' .. '08'
  slug          text unique not null,           -- für URLs: /#/s/<slug>
  sort_order    integer not null default 0,
  title         text not null default '',
  sub           text not null default '',
  era           text not null default '',
  dur           integer not null default 180,   -- Dauer in Sekunden
  status        text not null default 'draft' check (status in ('draft','pub')),
  audio_title   text not null default '',       -- Kurztitel über dem Player
  narration     text not null default '',       -- Sprechertext für Browser-Vorlesefunktion (Fallback ohne Audiodatei)
  description   text not null default '',       -- Fließtext auf der Stationsseite
  image_url     text,                           -- Hauptbild
  gallery       jsonb not null default '[]'::jsonb,  -- [{ "url": "...", "cap": "..." }]
  audio_url     text,                           -- echte Sprecher-Audiodatei (falls hochgeladen)
  scans         integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists stations_status_idx on public.stations (status);
create index if not exists stations_sort_idx on public.stations (sort_order);

-- updated_at automatisch pflegen
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists stations_set_updated_at on public.stations;
create trigger stations_set_updated_at
  before update on public.stations
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Tabelle: gallery ("Das Gebäude heute" – globale Bildstrecke)
-- ------------------------------------------------------------
create table if not exists public.gallery (
  id          uuid primary key default gen_random_uuid(),
  sort_order  integer not null default 0,
  image_url   text not null,
  caption     text not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists gallery_sort_idx on public.gallery (sort_order);

-- ------------------------------------------------------------
-- Tabelle: site_settings (Startseiten-Texte, genau eine Zeile)
-- ------------------------------------------------------------
create table if not exists public.site_settings (
  id              text primary key default 'main',
  hero_title      text not null default 'Alte Schraubenfabrik Hagen',
  hero_subtitle   text not null default 'Funcke & Hueck',
  hero_image_url  text,
  kicker          text not null default 'Willkommen',
  stations_kicker text not null default 'Stationen',
  welcome_heading text not null default '{n} Stationen,\n180 Jahre.',
  welcome_text    text not null default 'Von der ersten Dampfmaschine Hagens 1844 über 1.500 Beschäftigte im Jahr 1913 bis zur denkmalgerechten Sanierung heute. Jede Station: ein kurzer Text und ein Audioguide von etwa drei Minuten.',
  link_label      text not null default 'Mehr auf alte-schraubenfabrik.de',
  link_url        text not null default 'https://www.alte-schraubenfabrik.de',
  show_scan_button boolean not null default true,
  home_block_order jsonb not null default '["buttons","banner","stations","sources"]'::jsonb,
  updated_at      timestamptz not null default now()
);

drop trigger if exists site_settings_set_updated_at on public.site_settings;
create trigger site_settings_set_updated_at
  before update on public.site_settings
  for each row execute function public.set_updated_at();

insert into public.site_settings (id) values ('main')
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- RLS aktivieren
-- ------------------------------------------------------------
alter table public.stations      enable row level security;
alter table public.gallery       enable row level security;
alter table public.site_settings enable row level security;

-- Besucher (anon) dürfen nur veröffentlichte Stationen lesen.
-- Angemeldete Admins dürfen alles lesen (auch Entwürfe).
drop policy if exists "stations_select_public" on public.stations;
create policy "stations_select_public" on public.stations
  for select
  using (status = 'pub' or auth.role() = 'authenticated');

drop policy if exists "stations_write_admin" on public.stations;
create policy "stations_write_admin" on public.stations
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "gallery_select_public" on public.gallery;
create policy "gallery_select_public" on public.gallery
  for select
  using (true);

drop policy if exists "gallery_write_admin" on public.gallery;
create policy "gallery_write_admin" on public.gallery
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "site_settings_select_public" on public.site_settings;
create policy "site_settings_select_public" on public.site_settings
  for select
  using (true);

drop policy if exists "site_settings_write_admin" on public.site_settings;
create policy "site_settings_write_admin" on public.site_settings
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ------------------------------------------------------------
-- Scan-Zähler: darf auch von anonymen Besuchern erhöht werden,
-- ohne dass sie sonst irgendetwas an der Station ändern können.
-- ------------------------------------------------------------
create or replace function public.increment_station_scans(station_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.stations set scans = scans + 1 where id = station_id;
end;
$$;

grant execute on function public.increment_station_scans(text) to anon, authenticated;

-- ------------------------------------------------------------
-- Storage: ein öffentlicher Bucket für Bilder & Audiodateien
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('station-media', 'station-media', true)
on conflict (id) do nothing;

-- Jeder darf Dateien aus dem Bucket lesen (öffentliche Museums-Inhalte)
drop policy if exists "station_media_public_read" on storage.objects;
create policy "station_media_public_read" on storage.objects
  for select
  using (bucket_id = 'station-media');

-- Nur angemeldete Admins dürfen Dateien hochladen/ändern/löschen
drop policy if exists "station_media_admin_write" on storage.objects;
create policy "station_media_admin_write" on storage.objects
  for insert
  with check (bucket_id = 'station-media' and auth.role() = 'authenticated');

drop policy if exists "station_media_admin_update" on storage.objects;
create policy "station_media_admin_update" on storage.objects
  for update
  using (bucket_id = 'station-media' and auth.role() = 'authenticated');

drop policy if exists "station_media_admin_delete" on storage.objects;
create policy "station_media_admin_delete" on storage.objects
  for delete
  using (bucket_id = 'station-media' and auth.role() = 'authenticated');
