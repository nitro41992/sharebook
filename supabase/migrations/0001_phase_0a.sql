create extension if not exists "uuid-ossp";
create extension if not exists vector;

create type capture_type as enum (
  'link',
  'social_post',
  'screenshot',
  'image',
  'text_note',
  'mixed',
  'unknown'
);

create type analysis_state as enum (
  'queued',
  'processing',
  'ready',
  'partial',
  'failed',
  'needs_review'
);

create type capture_state as enum ('active', 'archived', 'deleted');

create table captures (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  capture_type capture_type not null default 'unknown',
  source_app text,
  source_url text,
  source_text text,
  title text,
  thumbnail_url text,
  capture_state capture_state not null default 'active',
  analysis_state analysis_state not null default 'queued',
  analysis_error text,
  default_intent text,
  default_intent_confidence numeric,
  current_save_intent text,
  intent_rationale text,
  context_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table capture_assets (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  capture_id uuid not null references captures(id) on delete cascade,
  storage_path text not null,
  public_url text,
  mime_type text,
  byte_size bigint,
  created_at timestamptz not null default now()
);

create table analysis_runs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  capture_id uuid not null references captures(id) on delete cascade,
  provider text not null,
  model text not null,
  prompt_version text not null,
  schema_version text not null,
  latency_ms integer,
  usage jsonb not null default '{}'::jsonb,
  cost_estimate numeric,
  raw_output jsonb not null,
  created_at timestamptz not null default now()
);

create table captured_entities (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  capture_id uuid not null references captures(id) on delete cascade,
  analysis_run_id uuid references analysis_runs(id) on delete set null,
  entity_type text not null,
  display_name text not null,
  normalized_name text,
  confidence numeric not null,
  evidence text,
  source text,
  created_at timestamptz not null default now()
);

create table platform_evidence (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  capture_id uuid not null references captures(id) on delete cascade,
  analysis_run_id uuid references analysis_runs(id) on delete set null,
  evidence_type text not null,
  value text not null,
  source text not null,
  confidence numeric not null,
  created_at timestamptz not null default now()
);

create table reminder_suggestions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  capture_id uuid not null references captures(id) on delete cascade,
  analysis_run_id uuid references analysis_runs(id) on delete set null,
  trigger_type text not null,
  trigger_value text not null,
  rationale text not null,
  confidence numeric not null,
  accepted_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now()
);

create table collections (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  rationale text,
  created_by text not null default 'user',
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table collection_suggestions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  capture_id uuid not null references captures(id) on delete cascade,
  analysis_run_id uuid references analysis_runs(id) on delete set null,
  name text not null,
  rationale text not null,
  confidence numeric not null,
  accepted_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now()
);

create table capture_collections (
  capture_id uuid not null references captures(id) on delete cascade,
  collection_id uuid not null references collections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (capture_id, collection_id)
);

create table search_documents (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  capture_id uuid not null references captures(id) on delete cascade,
  analysis_run_id uuid references analysis_runs(id) on delete set null,
  document text not null,
  embedding vector(1536),
  created_at timestamptz not null default now()
);

create table eval_fixtures (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  capture_id uuid not null references captures(id) on delete cascade,
  expected_intent text,
  acceptable_intents text[] not null default '{}',
  bad_intents text[] not null default '{}',
  required_entities text[] not null default '{}',
  search_queries text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now()
);

create table eval_runs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  eval_fixture_id uuid not null references eval_fixtures(id) on delete cascade,
  analysis_run_id uuid references analysis_runs(id) on delete set null,
  model_route text not null,
  passed boolean,
  score jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index captures_user_created_idx on captures(user_id, created_at desc);
create index captures_user_state_idx on captures(user_id, capture_state, analysis_state);
create index entities_capture_idx on captured_entities(capture_id);
create index evidence_capture_idx on platform_evidence(capture_id);
create index search_documents_capture_idx on search_documents(capture_id);
create index search_documents_fts_idx on search_documents using gin(to_tsvector('english', document));
create index search_documents_embedding_idx on search_documents using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger captures_set_updated_at
before update on captures
for each row execute procedure set_updated_at();

alter table captures enable row level security;
alter table capture_assets enable row level security;
alter table analysis_runs enable row level security;
alter table captured_entities enable row level security;
alter table platform_evidence enable row level security;
alter table reminder_suggestions enable row level security;
alter table collections enable row level security;
alter table collection_suggestions enable row level security;
alter table capture_collections enable row level security;
alter table search_documents enable row level security;
alter table eval_fixtures enable row level security;
alter table eval_runs enable row level security;

create policy "own captures" on captures using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own capture assets" on capture_assets using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own analysis runs" on analysis_runs using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own captured entities" on captured_entities using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own platform evidence" on platform_evidence using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own reminder suggestions" on reminder_suggestions using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own collections" on collections using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own collection suggestions" on collection_suggestions using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own capture collections" on capture_collections using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own search documents" on search_documents using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own eval fixtures" on eval_fixtures using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own eval runs" on eval_runs using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('captures', 'captures', false)
on conflict (id) do nothing;

create policy "own capture storage read" on storage.objects
for select using (
  bucket_id = 'captures'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "own capture storage write" on storage.objects
for insert with check (
  bucket_id = 'captures'
  and auth.uid()::text = (storage.foldername(name))[1]
);
