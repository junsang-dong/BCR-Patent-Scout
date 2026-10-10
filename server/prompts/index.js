import { readFileSync } from "node:fs";

const read = name => readFileSync(new URL(`./${name}.md`, import.meta.url), "utf8");

export const prompts = {
  common: () => read("common-rules"),
  similarity: () => read("similarity"),
  report: type => read({ rnd: "report-rnd", planning: "report-planning", strategy: "report-strategy" }[type])
};
