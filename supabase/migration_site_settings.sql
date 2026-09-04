-- Nachtrag für bereits eingerichtete Supabase-Projekte:
-- fügt die neue Tabelle "site_settings" hinzu (Startseiten-Texte,
-- jetzt über den Admin-Bereich bearbeitbar). Einmal im SQL Editor
-- ausführen - für neue Projekte ist das schon in schema.sql enthalten.

create table if not exists public.site_settings (
  id              text primary key default 'main',
  hero_title      text not null default 'Alte Schraubenfabrik Hagen',
  hero_subtitle   text not null default 'Funcke & Hueck',
  hero_image_url  text,
  badge_text      text not null default '{n} STATIONEN',
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

-- Falls die Tabelle schon aus einem früheren Lauf dieser Datei existiert,
-- aber neue Spalten noch fehlen:
alter table public.site_settings add column if not exists show_scan_button boolean not null default true;
alter table public.site_settings add column if not exists home_block_order jsonb not null default '["buttons","banner","stations","sources"]'::jsonb;
alter table public.site_settings add column if not exists kicker text not null default 'Willkommen';
alter table public.site_settings add column if not exists stations_kicker text not null default 'Stationen';
alter table public.site_settings add column if not exists badge_text text not null default '{n} STATIONEN';

drop trigger if exists site_settings_set_updated_at on public.site_settings;
create trigger site_settings_set_updated_at
  before update on public.site_settings
  for each row execute function public.set_updated_at();

insert into public.site_settings (id) values ('main')
on conflict (id) do nothing;

alter table public.site_settings enable row level security;

drop policy if exists "site_settings_select_public" on public.site_settings;
create policy "site_settings_select_public" on public.site_settings
  for select
  using (true);

drop policy if exists "site_settings_write_admin" on public.site_settings;
create policy "site_settings_write_admin" on public.site_settings
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
