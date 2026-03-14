create extension if not exists pgcrypto;

create table if not exists public.computer_specs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  type text not null,
  brand text not null,
  model text not null,
  cpu text not null,
  ram text not null,
  storage text not null,
  display_size text not null,
  price numeric(12,2) not null default 0,
  features text not null default '',
  remarks text not null default '',
  folder_link text not null default '',
  image_links jsonb not null default '[]'::jsonb,
  status_image boolean not null default false,
  status_posted boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists computer_specs_created_at_idx on public.computer_specs (created_at desc);
create index if not exists computer_specs_type_idx on public.computer_specs (type);
create index if not exists computer_specs_brand_idx on public.computer_specs (brand);

create or replace function public.set_computer_specs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

DROP TRIGGER IF EXISTS trg_set_computer_specs_updated_at ON public.computer_specs;

create trigger trg_set_computer_specs_updated_at
before update on public.computer_specs
for each row
execute function public.set_computer_specs_updated_at();

create table if not exists public.line_target_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  target_id text not null,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key default 'main' check (key = 'main'),
  edit_password text not null default '',
  admin_password text not null default '',
  google_drive_parent_folder_id text not null default '',
  line_notify_enabled boolean not null default true,
  active_line_target_preset_id uuid references public.line_target_presets(id) on delete set null,
  line_message_header text not null default 'แจ้งเตือน: มีการเพิ่มข้อมูลใหม่',
  line_message_separator text not null default '---------------------------',
  line_message_include_frontend_url boolean not null default true,
  default_type text not null default '',
  default_brand text not null default '',
  type_options jsonb not null default '["PC","Notebook","All in One","Monitor"]'::jsonb,
  brand_options jsonb not null default '["Dell","HP","Lenovo","Acer","Asus","Toshiba","Fujitsu","MSI","Hisense"]'::jsonb,
  feature_options jsonb not null default '["License Windows","KB มีไฟ","สแกนนิ้ว","สแกนหน้า","Card Wi-Fi","DVD-RW","ใส่ Sim ได้"]'::jsonb,
  feature_bulk_status_enabled boolean not null default true,
  feature_submit_lock_enabled boolean not null default true,
  feature_dedupe_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.record_submission_requests (
  submission_key text primary key,
  status text not null default 'processing',
  record_id uuid references public.computer_specs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists line_target_presets_enabled_idx on public.line_target_presets (is_enabled);
create index if not exists record_submission_requests_status_idx on public.record_submission_requests (status);
create index if not exists record_submission_requests_created_at_idx on public.record_submission_requests (created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_set_line_target_presets_updated_at on public.line_target_presets;
create trigger trg_set_line_target_presets_updated_at
before update on public.line_target_presets
for each row
execute function public.set_updated_at();

drop trigger if exists trg_set_app_settings_updated_at on public.app_settings;
create trigger trg_set_app_settings_updated_at
before update on public.app_settings
for each row
execute function public.set_updated_at();

drop trigger if exists trg_set_record_submission_requests_updated_at on public.record_submission_requests;
create trigger trg_set_record_submission_requests_updated_at
before update on public.record_submission_requests
for each row
execute function public.set_updated_at();
