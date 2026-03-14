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
  google_drive_parent_folder_id text not null default '',
  line_notify_enabled boolean not null default true,
  active_line_target_preset_id uuid references public.line_target_presets(id) on delete set null,
  line_message_header text not null default 'แจ้งเตือน: มีการเพิ่มข้อมูลใหม่',
  line_message_separator text not null default '---------------------------',
  line_message_include_frontend_url boolean not null default true,
  default_type text not null default '',
  default_brand text not null default '',
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
