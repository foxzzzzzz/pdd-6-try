import { FastifyInstance } from 'fastify';
import { getDb, saveDb } from '@pdd-inspector/core';
import { sql } from 'drizzle-orm';
import { addActionJob } from '../queue';

type CandidateStatus = 'pending_approval' | 'approved' | 'queued' | 'skipped';
type CandidateKind = 'review' | 'interaction';

export async function actionCandidateRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { status?: string; storeId?: string; type?: string } }>('/api/action-candidates', async (req) => {
    const db = await getDb();
    ensureApprovalColumns(db);
    const status = sanitizeStatus(req.query.status || 'pending_approval');
    const storeId = req.query.storeId ? parseInt(req.query.storeId, 10) : null;
    const type = sanitizeType(req.query.type || null);
    const rows = [
      ...listReviewCandidates(db, status, storeId, type),
      ...listInteractionCandidates(db, status, storeId, type),
    ];
    return rows.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  });

  app.post<{
    Params: { kind: CandidateKind; id: string };
    Body: { operatorId?: string };
  }>('/api/action-candidates/:kind/:id/approve', async (req) => {
    return approveCandidate(req.params.kind, parseInt(req.params.id, 10), requireOperatorId(req.body?.operatorId));
  });

  app.post<{
    Params: { kind: CandidateKind; id: string };
    Body: { operatorId?: string };
  }>('/api/action-candidates/:kind/:id/skip', async (req) => {
    return updateCandidate(req.params.kind, parseInt(req.params.id, 10), 'skipped', requireOperatorId(req.body?.operatorId));
  });
}

function listReviewCandidates(db: any, status: string, storeId: number | null, type: string | null) {
  if (type && type !== 'reply' && type !== 'report') return [];
  let where = `ra.status = ${quote(status)}`;
  if (storeId != null && Number.isFinite(storeId)) {
    where += ` AND ra.store_id = ${storeId}`;
  }
  if (type) {
    where += ` AND ra.action_type = ${quote(type)}`;
  }
  return db.all(sql.raw(`
    SELECT
      ra.id,
      'review' AS kind,
      ra.store_id AS storeId,
      s.name AS storeName,
      ra.inspection_id AS inspectionId,
      ra.review_id AS sourceId,
      ra.review_content AS content,
      ra.review_stars AS reviewStars,
      ra.action_type AS actionType,
      ra.action_content AS suggestedPayload,
      ra.status,
      ra.action_mode AS actionMode,
      ra.screenshot_path AS screenshotPath,
      ra.error_message AS failureReason,
      ra.submitted_at AS submittedAt,
      ra.executed_at AS executedAt,
      ra.approved_at AS approvedAt,
      ra.operator_id AS operatorId,
      ra.created_at AS createdAt
    FROM review_actions ra
    LEFT JOIN stores s ON s.id = ra.store_id
    WHERE ${where}
  `));
}

function listInteractionCandidates(db: any, status: string, storeId: number | null, type: string | null) {
  if (type && type !== 'hide') return [];
  let where = `ia.status = ${quote(status)} AND ia.action = 'hide'`;
  if (storeId != null && Number.isFinite(storeId)) {
    where += ` AND ia.store_id = ${storeId}`;
  }
  return db.all(sql.raw(`
    SELECT
      ia.id,
      'interaction' AS kind,
      ia.store_id AS storeId,
      s.name AS storeName,
      ia.inspection_id AS inspectionId,
      ia.interaction_id AS sourceId,
      ia.content_summary AS content,
      NULL AS reviewStars,
      ia.action AS actionType,
      ia.ai_judgment AS suggestedPayload,
      ia.status,
      ia.action_mode AS actionMode,
      ia.screenshot_path AS screenshotPath,
      ia.error_message AS failureReason,
      ia.submitted_at AS submittedAt,
      ia.executed_at AS executedAt,
      ia.approved_at AS approvedAt,
      ia.operator_id AS operatorId,
      ia.created_at AS createdAt
    FROM interaction_actions ia
    LEFT JOIN stores s ON s.id = ia.store_id
    WHERE ${where}
  `));
}

async function updateCandidate(kind: CandidateKind, id: number, status: CandidateStatus, operatorId: string) {
  if (!Number.isFinite(id)) throw { statusCode: 400, message: 'Invalid candidate id' };
  const db = await getDb();
  ensureApprovalColumns(db);
  const table = kind === 'review' ? 'review_actions' : 'interaction_actions';
  const timestamp = new Date().toISOString();
  const approvedAt = status === 'approved' ? quote(timestamp) : 'NULL';
  db.run(sql.raw(
    `UPDATE ${table} SET status = ${quote(status)}, approved_at = ${approvedAt}, operator_id = ${quote(operatorId)} WHERE id = ${id}`,
  ));
  saveDb(db);
  const updated = db.get(sql.raw(`SELECT id FROM ${table} WHERE id = ${id}`));
  if (!updated) throw { statusCode: 404, message: 'Action candidate not found' };
  return { ok: true, kind, id, status };
}

async function approveCandidate(kind: CandidateKind, id: number, operatorId: string) {
  if (!Number.isFinite(id)) throw { statusCode: 400, message: 'Invalid candidate id' };
  const db = await getDb();
  ensureApprovalColumns(db);
  const candidate = getCandidateForJob(db, kind, id);
  if (!candidate) throw { statusCode: 404, message: 'Action candidate not found' };
  if (!['pending_approval', 'approved'].includes(candidate.status)) {
    throw { statusCode: 409, message: `Action candidate is ${candidate.status}, cannot approve` };
  }

  const table = kind === 'review' ? 'review_actions' : 'interaction_actions';
  const timestamp = new Date().toISOString();
  db.run(sql.raw(`
    UPDATE ${table}
    SET status = 'approved',
        approved_at = ${quote(timestamp)},
        operator_id = ${quote(operatorId)}
    WHERE id = ${id}
  `));
  saveDb(db);

  const job = await addActionJob(kind, id, candidate.storeId, candidate.actionType, operatorId);
  db.run(sql.raw(`UPDATE ${table} SET status = 'queued' WHERE id = ${id}`));
  saveDb(db);
  return { ok: true, kind, id, status: 'queued', jobId: job.id };
}

function getCandidateForJob(db: any, kind: CandidateKind, id: number): {
  id: number;
  storeId: number;
  actionType: 'reply' | 'report' | 'hide';
  status: string;
} | null {
  if (kind === 'review') {
    const row = db.get(sql.raw(`
      SELECT id, store_id AS storeId, action_type AS actionType, status
      FROM review_actions
      WHERE id = ${id}
    `));
    return row && ['reply', 'report'].includes(row.actionType) ? row : null;
  }
  const row = db.get(sql.raw(`
    SELECT id, store_id AS storeId, action AS actionType, status
    FROM interaction_actions
    WHERE id = ${id}
  `));
  return row && row.actionType === 'hide' ? row : null;
}

function ensureApprovalColumns(db: any) {
  for (const table of ['review_actions', 'interaction_actions']) {
    for (const [column, type] of [
      ['executed_at', 'TEXT'],
      ['approved_at', 'TEXT'],
      ['operator_id', 'TEXT'],
    ] as const) {
      try {
        db.run(sql.raw(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`));
      } catch {
        // Column already exists.
      }
    }
  }
}

function sanitizeStatus(value: string): string {
  return ['pending_approval', 'approved', 'queued', 'running', 'skipped', 'failed', 'success'].includes(value) ? value : 'pending_approval';
}

function sanitizeType(value: string | null): string | null {
  return value && ['reply', 'report', 'hide'].includes(value) ? value : null;
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function requireOperatorId(value?: string | null): string {
  const operatorId = value?.trim();
  if (!operatorId) throw { statusCode: 400, message: 'operatorId is required' };
  return operatorId;
}
