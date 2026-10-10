// 입력·AI 출력 검증 (zod)
import { z } from "zod";
import { MAX_QUERIES, MAX_PER_QUERY } from "../shared/queries.js";

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "올바른 ID가 아닙니다.");
const appNo = z.string().regex(/^\d{13}$/, "출원번호는 숫자 13자리입니다.");
const text = (max = 100) => z.string().trim().max(max);

export const productCodes = ["BCR-A100", "BCR-A200", "BCR-C100"];
export const researchTypes = ["rnd", "planning", "strategy"];

export const projectCreate = z.object({
  title: text(120).min(1, "조사 제목을 입력하세요."),
  productCode: z.enum(productCodes),
  researchType: z.enum(researchTypes)
});

export const queryItem = z.object({
  name: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/, "검색식 이름은 영문 소문자·숫자·하이픈입니다."),
  inventionTitle: text().default(""),
  astrtCont: text().default(""),
  ipcNumber: text(30).default(""),
  from: z.number().int().min(1960).max(2100).nullable().optional(),
  to: z.number().int().min(1960).max(2100).nullable().optional(),
  max: z.number().int().min(1).max(MAX_PER_QUERY).default(MAX_PER_QUERY),
  patent: z.boolean().default(true),
  utility: z.boolean().default(false),
  featureIds: z.array(z.string()).optional()
}).refine(q => q.inventionTitle || q.astrtCont || q.ipcNumber, { message: "제목·요약·IPC 중 하나는 있어야 합니다." });

export const keywordsBody = z.object({
  featureIds: z.array(z.string()).min(1).max(20),
  queries: z.array(queryItem).min(1).max(MAX_QUERIES)
});

export const searchBody = z.object({
  projectId: uuid,
  query: queryItem,
  preview: z.boolean().optional()
});

export const detailBody = z.object({ applicationNumber: appNo });
export const pinBody = z.object({ applicationNumber: appNo, pinned: z.boolean() });
export const analyzeBody = z.object({ projectId: uuid, applicationNumbers: z.array(appNo).min(1).max(5) });
export const reviewedBody = z.object({ applicationNumber: appNo, reviewed: z.any() });
export const reportBody = z.object({ projectId: uuid, researchType: z.enum(researchTypes) });
export const reportPatch = z.object({
  reviewStatus: z.enum(["ai_draft", "in_review", "approved"]).optional(),
  reviewerNote: text(2000).optional(),
  reviewer: text(60).optional(),
  ackWarning: z.string().max(20).optional()
});

export const isUuid = s => uuid.safeParse(s).success;

// 유사성 평가 AI 출력 (명세 7.2)
export const MATCH = ["match", "partial", "none", "unclear"];
export const similarityOut = z.object({
  application_number: z.string(),
  features: z.array(z.object({
    feature_id: z.string(),
    match: z.enum(MATCH),
    evidence: z.string().default(""),
    evidence_source: z.string().default("")
  })),
  overall: z.enum(["high", "medium", "low"]),
  differences: z.array(z.string()).default([]),
  followups: z.array(z.string()).default([])
});
export const similarityBatch = z.object({ patents: z.array(similarityOut) });
