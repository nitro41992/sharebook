alter table captures add column if not exists display_title text;
alter table captures add column if not exists intent_corrected_at timestamptz;
alter table captures add column if not exists intent_corrected_from text;

alter table analysis_runs add column if not exists model_route text;
alter table analysis_runs add column if not exists status text not null default 'succeeded';
alter table analysis_runs add column if not exists is_canonical boolean not null default true;
alter table analysis_runs add column if not exists raw_model_output text;
alter table analysis_runs add column if not exists extracted_json jsonb;
alter table analysis_runs add column if not exists repaired_output jsonb;
alter table analysis_runs add column if not exists schema_errors jsonb not null default '[]'::jsonb;
alter table analysis_runs add column if not exists input_snapshot jsonb not null default '{}'::jsonb;
alter table analysis_runs add column if not exists error_message text;

alter table eval_fixtures add column if not exists label text;
alter table eval_fixtures add column if not exists expected_reminders text[] not null default '{}';

create index if not exists analysis_runs_capture_created_idx
  on analysis_runs(capture_id, created_at desc);

create index if not exists analysis_runs_capture_canonical_idx
  on analysis_runs(capture_id, is_canonical, created_at desc);
