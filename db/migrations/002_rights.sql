-- 16번 법적 상태 이력(ST.27)·17번 등록사항 캐시 (7일)
create table patent_rights (
  application_number text primary key references patents(application_number),
  legal jsonb,
  legal_fetched_at timestamptz,
  registration jsonb,
  registration_fetched_at timestamptz
);
