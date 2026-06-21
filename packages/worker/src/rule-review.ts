import { sql } from 'drizzle-orm';

export type RuleReviewCategory =
  | 'review_management'
  | 'report_hide'
  | 'account_security'
  | 'automation_tools'
  | 'service_agreements';

export type RuleReviewStatus = 'pending' | 'approved' | 'expired' | 'paused';

export interface RuleReviewLike {
  category?: string | null;
  status: string;
  nextReviewAt?: string | null;
}

export interface RuleReviewRow extends RuleReviewLike {
  id: number;
  title: string;
  lastReviewedAt: string | null;
  conclusion: string | null;
  evidencePath: string | null;
  owner: string | null;
  updatedAt: string | null;
}

const HIGH_RISK_WRITE_CATEGORIES = new Set<RuleReviewCategory>([
  'review_management',
  'report_hide',
  'account_security',
  'automation_tools',
  'service_agreements',
]);

export function isRuleReviewExpired(review: RuleReviewLike | null | undefined, now = new Date()): boolean {
  if (!review) return true;
  if (review.status !== 'approved') return true;
  if (!review.nextReviewAt) return true;
  const next = Date.parse(review.nextReviewAt);
  if (!Number.isFinite(next)) return true;
  return next < now.getTime();
}

export function shouldBlockActionForRuleReview(
  actionType: 'reply' | 'report' | 'hide',
  reviews: RuleReviewLike[],
  now = new Date(),
): boolean {
  if (actionType === 'reply') return false;
  for (const category of HIGH_RISK_WRITE_CATEGORIES) {
    const review = reviews.find((item) => item.category === category);
    if (isRuleReviewExpired(review, now)) return true;
  }
  return false;
}

export function ensureRuleReviewTable(db: any): void {
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

export function listRuleReviews(db: any): RuleReviewRow[] {
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

export function getRuleReviewBlockReason(
  db: any,
  actionType: 'reply' | 'report' | 'hide',
  now = new Date(),
): string | null {
  if (actionType === 'reply') return null;
  const reviews = listRuleReviews(db);
  const expired = reviews.filter((review) => HIGH_RISK_WRITE_CATEGORIES.has(review.category as RuleReviewCategory) && isRuleReviewExpired(review, now));
  if (expired.length === 0) return null;
  return `Rule review expired or missing for: ${expired.map((item) => item.category).join(', ')}`;
}

function seedDefaultRuleReviews(db: any): void {
  const defaults: Array<{ category: RuleReviewCategory; title: string }> = [
    { category: 'review_management', title: '评价管理规则' },
    { category: 'report_hide', title: '举报/隐藏规则' },
    { category: 'account_security', title: '商家后台账号安全规则' },
    { category: 'automation_tools', title: '自动化工具/第三方工具限制' },
    { category: 'service_agreements', title: '店铺推广/客服/评价相关协议' },
  ];
  const now = new Date().toISOString();
  for (const item of defaults) {
    db.run(sql.raw(`
      INSERT INTO rule_reviews (category, title, status, created_at, updated_at)
      VALUES (${quote(item.category)}, ${quote(item.title)}, 'pending', ${quote(now)}, ${quote(now)})
      ON CONFLICT(category) DO NOTHING
    `));
  }
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
