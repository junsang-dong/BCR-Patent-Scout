// 검색 결과를 DB에 넣는다 (목록 한 번에 insert — 서버리스에서 왕복 횟수를 줄인다)
import { query } from "./db.js";

const col = (items, k) => items.map(i => i[k] ?? null);

export async function savePatents(items) {
  if (!items.length) return;
  await query(
    `insert into patents (application_number, invention_title, applicant_name, application_date, ipc, register_status,
                          open_number, open_date, register_number, register_date, abstract)
     select a, t, ap, nullif(ad, '')::date, ipc, rs, onum, nullif(od, '')::date, rnum, nullif(rd, '')::date, ab
       from unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::text[], $11::text[])
            as x(a, t, ap, ad, ipc, rs, onum, od, rnum, rd, ab)
     on conflict (application_number) do update set
       invention_title = excluded.invention_title, applicant_name = excluded.applicant_name,
       application_date = excluded.application_date, ipc = excluded.ipc, register_status = excluded.register_status,
       open_number = excluded.open_number, open_date = excluded.open_date, register_number = excluded.register_number,
       register_date = excluded.register_date, abstract = excluded.abstract, last_fetched_at = now()`,
    [col(items, "applicationNumber"), col(items, "inventionTitle"), col(items, "applicantName"), col(items, "applicationDate"),
     col(items, "ipcNumber"), col(items, "registerStatus"), col(items, "openNumber"), col(items, "openDate"),
     col(items, "registerNumber"), col(items, "registerDate"), col(items, "abstract")]
  );
}

export async function linkToProject(projectId, queryName, numbers) {
  if (!numbers.length) return;
  await query(
    `insert into project_patents (project_id, application_number, matched_queries)
     select $1::uuid, a, array[$2::text] from unnest($3::text[]) as a
     on conflict (project_id, application_number) do update set
       matched_queries = (select coalesce(array_agg(distinct m), '{}') from unnest(project_patents.matched_queries || array[$2::text]) as m)`,
    [projectId, queryName, numbers]
  );
}
