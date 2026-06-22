import { FastifyInstance } from 'fastify';
import { getDb, quoteSqlString, saveDb, type AppDb } from '@pdd-inspector/core';
import { sql } from 'drizzle-orm';

type RuleReviewStatus = 'pending' | 'approved' | 'expired' | 'paused';
type RuleReviewRow = {
  id: number;
  category: string;
  title: string;
  status: string;
  lastReviewedAt: string | null;
  nextReviewAt: string | null;
  conclusion: string | null;
  evidencePath: string | null;
  owner: string | null;
  updatedAt: string | null;
};

export async function ruleReviewRoutes(app: FastifyInstance) {
  app.get('/api/rule-reviews/status', async () => {
    const db = await getDb();
    const reviews = listRuleReviews(db);
    const now = new Date();
    const overdue = reviews.filter((review) => isExpired(review, now));
    return {
      overdueCount: overdue.length,
      highRiskWriteBlocked: overdue.length > 0,
      reviews,
    };
  });

  app.put<{
    Params: { category: string };
    Body: {
      status?: RuleReviewStatus;
      lastReviewedAt?: string;
      nextReviewAt?: string;
      conclusion?: string;
      evidencePath?: string;
      owner?: string;
    };
  }>('/api/rule-reviews/:category', async (req) => {
    const category = sanitizeCategory(req.params.category);
    if (!category) throw { statusCode: 400, message: 'Invalid rule review category' };
    const status = sanitizeStatus(req.body?.status || 'approved');
    const now = new Date().toISOString();
    const lastReviewedAt = req.body?.lastReviewedAt || now;
    const nextReviewAt = req.body?.nextReviewAt || addDaysIso(30);
    const db = await getDb();
    ensureRuleReviewTable(db);
    seedDefaultRuleReviews(db);
    db.run(sql.raw(`
      UPDATE rule_reviews
      SET status = ${quoteSqlString(status)},
          last_reviewed_at = ${quoteSqlString(lastReviewedAt)},
          next_review_at = ${quoteSqlString(nextReviewAt)},
          conclusion = ${req.body?.conclusion ? quoteSqlString(req.body.conclusion) : 'NULL'},
          evidence_path = ${req.body?.evidencePath ? quoteSqlString(req.body.evidencePath) : 'NULL'},
          owner = ${req.body?.owner ? quoteSqlString(req.body.owner) : 'NULL'},
          updated_at = ${quoteSqlString(now)}
      WHERE category = ${quoteSqlString(category)}
    `));
    saveDb(db);
    return { ok: true, category, status, lastReviewedAt, nextReviewAt };
  });
}

function listRuleReviews(db: AppDb): RuleReviewRow[] {
  ensureRuleReviewTable(db);
  seedDefaultRuleReviews(db);
  return db.all(sql.raw(`
    SELECT
      id,
      category,
      title,
      status,
      last_reviewed_at AS lastReviewedAt,
      next_review_at AS nextReviewAt,
      conclusion,
      evidence_path AS evidencePath,
      owner,
      updated_at AS updatedAt
    FROM rule_reviews
    ORDER BY category
  `));
}

function ensureRuleReviewTable(db: AppDb): void {
  db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS rule_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      last_reviewed_at TEXT,
      next_review_at TEXT,
      conclusion TEXT,
      evidence_path TEXT,
      owner TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `));
}

function seedDefaultRuleReviews(db: AppDb): void {
  const defaults = [
    ['review_management', '评价管理规则'],
    ['report_hide', '举报/隐藏规则'],
    ['account_security', '商家后台账号安全规则'],
    ['automation_tools', '自动化工具/第三方工具限制'],
    ['service_agreements', '店铺推广/客服/评价相关协议'],
  ] as const;
  for (const [category, title] of defaults) {
    db.run(sql.raw(`
      INSERT INTO rule_reviews (category, title, status)
      VALUES (${quoteSqlString(category)}, ${quoteSqlString(title)}, 'pending')
      ON CONFLICT(category) DO NOTHING
    `));
  }
}

function isExpired(review: { status: string; nextReviewAt?: string | null }, now: Date): boolean {
  if (review.status !== 'approved') return true;
  if (!review.nextReviewAt) return true;
  const next = Date.parse(review.nextReviewAt);
  return !Number.isFinite(next) || next < now.getTime();
}

function sanitizeCategory(value: string): string | null {
  return ['review_management', 'report_hide', 'account_security', 'automation_tools', 'service_agreements'].includes(value) ? value : null;
}

function sanitizeStatus(value: string): RuleReviewStatus {
  return ['pending', 'approved', 'expired', 'paused'].includes(value) ? value as RuleReviewStatus : 'approved';
}

function addDaysIso(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}
