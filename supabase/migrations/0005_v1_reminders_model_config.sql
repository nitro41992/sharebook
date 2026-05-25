alter type capture_type add value if not exists 'voice_note';

create table if not exists model_route_configs (
  id uuid primary key default uuid_generate_v4(),
  route text not null unique,
  provider text not null,
  model text not null,
  prompt_version text not null,
  schema_version text not null,
  enabled boolean not null default true,
  is_default boolean not null default false,
  fallback_route text,
  temperature numeric,
  max_output_tokens integer,
  cost_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists model_route_configs_single_default_idx
  on model_route_configs(is_default)
  where is_default;

create trigger model_route_configs_set_updated_at
before update on model_route_configs
for each row execute procedure set_updated_at();

create table if not exists reminders (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trigger_type text not null,
  trigger_value text not null,
  due_at timestamptz,
  status text not null default 'scheduled',
  rationale text not null,
  created_from text not null default 'manual',
  source_suggestion_id uuid references reminder_suggestions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  dismissed_at timestamptz,
  cancelled_at timestamptz,
  snoozed_until timestamptz
);

create trigger reminders_set_updated_at
before update on reminders
for each row execute procedure set_updated_at();

create table if not exists reminder_captures (
  reminder_id uuid not null references reminders(id) on delete cascade,
  capture_id uuid not null references captures(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (reminder_id, capture_id)
);

create table if not exists notification_devices (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  push_token text not null,
  device_label text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, platform, push_token)
);

create trigger notification_devices_set_updated_at
before update on notification_devices
for each row execute procedure set_updated_at();

create table if not exists notification_deliveries (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reminder_id uuid references reminders(id) on delete cascade,
  notification_device_id uuid references notification_devices(id) on delete set null,
  channel text not null default 'push',
  title text not null,
  body text not null,
  status text not null default 'queued',
  provider_message_id text,
  error_message text,
  scheduled_for timestamptz,
  sent_at timestamptz,
  opened_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists reminders_user_due_idx on reminders(user_id, status, due_at);
create index if not exists reminder_captures_capture_idx on reminder_captures(capture_id);
create index if not exists notification_deliveries_user_status_idx
  on notification_deliveries(user_id, status, scheduled_for);

alter table model_route_configs enable row level security;
alter table reminders enable row level security;
alter table reminder_captures enable row level security;
alter table notification_devices enable row level security;
alter table notification_deliveries enable row level security;

drop policy if exists "read active model route configs" on model_route_configs;
create policy "read active model route configs" on model_route_configs
  for select using (enabled = true);

create policy "own reminders" on reminders using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own reminder captures" on reminder_captures using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own notification devices" on notification_devices using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own notification deliveries" on notification_deliveries using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into model_route_configs
  (route, provider, model, prompt_version, schema_version, enabled, is_default, fallback_route, cost_notes)
values
  ('openai_mini', 'openai', 'gpt-4.1-mini', 'phase-0d-context-2026-05-24', 'capture-analysis-v3', true, true, 'high_precision_openai', 'Default structured text and image analysis route.'),
  ('gemini_flash', 'google', 'gemini-2.5-flash', 'phase-0d-context-2026-05-24', 'capture-analysis-v3', true, false, 'openai_mini', 'Low-latency multimodal candidate route.'),
  ('gemini_flash_lite', 'google', 'gemini-2.5-flash-lite', 'phase-0d-context-2026-05-24', 'capture-analysis-v3', true, false, 'openai_mini', 'Low-cost multimodal candidate route.'),
  ('high_precision_openai', 'openai', 'gpt-4.1', 'phase-0d-context-2026-05-24', 'capture-analysis-v3', true, false, null, 'Higher-cost fallback for low-confidence or eval-failing captures.')
on conflict (route) do update set
  provider = excluded.provider,
  model = excluded.model,
  prompt_version = excluded.prompt_version,
  schema_version = excluded.schema_version,
  enabled = excluded.enabled,
  fallback_route = excluded.fallback_route,
  cost_notes = excluded.cost_notes;
