// --mock 모드: 실제 API 대신 fixtures/의 가상 응답을 돌려주는 가짜 fetch
// 실습 중 네트워크·키 문제가 있을 때 도구의 흐름만 보여 주기 위한 용도다.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const read = f => readFileSync(join(dir, f), "utf8");

export function mockFetch({ authFail = false } = {}) {
  return async url => {
    const u = new URL(url);
    const op = u.pathname.split("/").pop();
    let body;
    if (op === "getAdvancedSearch") body = authFail ? read("kipo-auth-error.xml") : read(u.searchParams.get("pageNo") === "2" ? "kipo-search-p2.xml" : "kipo-search-p1.xml");
    else if (op === "freeSearchInfo") body = read("openapi-free.xml");
    else if (op === "getBibliographyDetailInfoSearch") body = read("kipo-detail.xml");
    else if (op === "BasicInfo") body = read("st27-legal.xml");
    else if (op === "registrationInfo") body = read("registration.xml");
    else body = read("kipo-auth-error.xml");
    return { ok: true, status: 200, text: async () => body };
  };
}
