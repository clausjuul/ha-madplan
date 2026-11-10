import type { DatabaseSync } from "node:sqlite";
import type { DraftDay, PlanDraftRecord, PlanDraftStatus, PlanEngine, PlanRequest, PlanReview } from "@madplan/domain";
import { one, optText, parseJson, run, text, toJson } from "./repo.ts";
import type { Row } from "./repo.ts";

function toRecord(row: Row): PlanDraftRecord {
  const record: PlanDraftRecord = {
    id: text(row, "id"),
    createdAt: text(row, "created_at"),
    status: text(row, "status") as PlanDraftStatus,
    engine: text(row, "engine") as PlanEngine,
    request: parseJson<PlanRequest>(row, "request", {} as PlanRequest),
    days: parseJson<DraftDay[]>(row, "days", []),
    review: parseJson<PlanReview | null>(row, "review", null),
  };
  const error = optText(row, "error");
  if (error) record.error = error;
  return record;
}

export function currentDraft(db: DatabaseSync): PlanDraftRecord | null {
  const row = one(db, "SELECT * FROM plan_drafts ORDER BY created_at DESC, rowid DESC LIMIT 1");
  return row ? toRecord(row) : null;
}

export function getDraft(db: DatabaseSync, id: string): PlanDraftRecord | null {
  const row = one(db, "SELECT * FROM plan_drafts WHERE id = ?", id);
  return row ? toRecord(row) : null;
}

/** Only one current draft exists: saving a draft with a new id replaces all others. */
export function replaceDraft(db: DatabaseSync, record: PlanDraftRecord): void {
  run(db, "DELETE FROM plan_drafts");
  saveDraft(db, record);
}

export function saveDraft(db: DatabaseSync, record: PlanDraftRecord): void {
  run(
    db,
    `INSERT INTO plan_drafts (id, created_at, status, engine, request, days, review, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET status = excluded.status, engine = excluded.engine,
       request = excluded.request, days = excluded.days, review = excluded.review, error = excluded.error`,
    record.id,
    record.createdAt,
    record.status,
    record.engine,
    toJson(record.request),
    toJson(record.days),
    record.review ? toJson(record.review) : null,
    record.error ?? null,
  );
}

/** Marks drafts still "generating" as failed (their background job died with the previous process). */
export function failGeneratingDrafts(db: DatabaseSync, error: string): number {
  const stale = one(db, "SELECT COUNT(*) AS n FROM plan_drafts WHERE status = 'generating'");
  run(db, "UPDATE plan_drafts SET status = 'failed', error = ? WHERE status = 'generating'", error);
  return stale ? Number(stale.n) : 0;
}

export function deleteDraft(db: DatabaseSync, id: string): void {
  run(db, "DELETE FROM plan_drafts WHERE id = ?", id);
}
