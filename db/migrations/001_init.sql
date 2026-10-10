-- BCR Patent Scout 초기 스키마 (BCR-PATENT-SCOUT-SPEC v1.0 6장)

create table projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  product_code text not null check (product_code in ('BCR-A100','BCR-A200','BCR-C100')),
  research_type text not null check (research_type in ('rnd','planning','strategy')),
  status text not null default 'draft',
  created_by text,
  created_at timestamptz default now()
);

create table keyword_sets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  feature_ids text[] not null,
  queries jsonb not null,
  catalog_version text not null,
  created_at timestamptz default now()
);

create table search_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  query_name text not null,
  query jsonb not null,
  gateway text,
  total_count int,
  fetched int,
  kept int,
  truncated boolean,
  error text,
  started_at timestamptz default now(),
  finished_at timestamptz
);

create table patents (
  application_number text primary key,
  invention_title text,
  applicant_name text,
  application_date date,
  ipc text,
  register_status text,
  open_number text,
  open_date date,
  register_number text,
  register_date date,
  abstract text,
  first_seen_at timestamptz default now(),
  last_fetched_at timestamptz default now()
);

create table patent_details (
  application_number text primary key references patents(application_number),
  claims jsonb,
  applicants jsonb,
  ipc_all jsonb,
  family jsonb,
  fetched_at timestamptz default now()
);

create table project_patents (
  project_id uuid references projects(id) on delete cascade,
  application_number text references patents(application_number),
  matched_queries text[] not null,
  pinned boolean default false,
  similarity jsonb,
  similarity_reviewed jsonb,
  primary key (project_id, application_number)
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  research_type text not null,
  version int not null,
  provider text not null,
  model text not null,
  markdown text not null,
  input_snapshot jsonb not null,
  validation jsonb,
  review_status text default 'ai_draft',
  reviewer text,
  reviewer_note text,
  created_at timestamptz default now()
);

create table llm_calls (
  id bigserial primary key,
  project_id uuid,
  purpose text,
  provider text,
  model text,
  input_tokens int,
  output_tokens int,
  latency_ms int,
  ok boolean,
  error text,
  created_at timestamptz default now()
);

create table app_settings (
  key text primary key,
  value jsonb,
  updated_at timestamptz default now()
);

create index idx_search_runs_project on search_runs(project_id, started_at desc);
create index idx_project_patents_app on project_patents(application_number);
create index idx_reports_project on reports(project_id, created_at desc);
create index idx_llm_calls_created on llm_calls(created_at);
