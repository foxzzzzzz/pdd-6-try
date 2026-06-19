import { getDb, saveDb, closeDb } from './connection';
import { sql } from 'drizzle-orm';

async function migrate() {
  console.log('Running database migration...');
  const db = await getDb();

  // Create all tables
  db.run(sql`
    CREATE TABLE IF NOT EXISTS stores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      pdd_store_id TEXT NOT NULL UNIQUE,
      cookie TEXT,
      storage_state TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      owner TEXT,
      factory TEXT,
      ai_config TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS inspection_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL REFERENCES stores(id),
      date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      start_time TEXT,
      end_time TEXT,
      duration INTEGER,
      worker_id TEXT,
      completion_rate REAL,
      summary TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS store_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL REFERENCES stores(id),
      inspection_id INTEGER REFERENCES inspection_records(id),
      date TEXT NOT NULL,
      rating REAL,
      rating_change REAL,
      defect_rate REAL,
      defect_rate_change REAL,
      dsr_desc REAL,
      dsr_service REAL,
      dsr_logistics REAL,
      dsr_rank_change TEXT,
      pilot_industry_rank REAL,
      platform_help_rate REAL,
      three_minute_reply_rate REAL,
      in_transit_refund_duration REAL,
      return_refund_duration REAL,
      review_score_rank REAL,
      positive_review_rate REAL,
      group_to_sign_duration REAL,
      logistics_violation_rate REAL,
      store_activity_rate REAL,
      experience_plan_status TEXT,
      exp_basic REAL,
      exp_service_basic REAL,
      exp_attitude REAL,
      exp_shipping REAL,
      exp_product REAL,
      exp_logistics REAL,
      exp_industry_rank_range TEXT,
      exp_basic_change REAL,
      exp_service_basic_change REAL,
      exp_attitude_change REAL,
      exp_shipping_change REAL,
      exp_product_change REAL,
      exp_logistics_change REAL,
      refund_duration REAL,
      refund_rate REAL,
      dispute_rate REAL,
      dispute_refund_count INTEGER,
      dispute_refund_rate REAL,
      intervention_order_count INTEGER,
      platform_intervention_rate REAL,
      quality_refund_rate REAL,
      average_refund_duration REAL,
      successful_refund_order_count INTEGER,
      successful_refund_amount REAL,
      successful_refund_rate REAL,
      return_refund_auto_duration REAL,
      refund_auto_duration REAL,
      appeal_count INTEGER,
      appeal_success_rate REAL,
      comment_score_rank REAL,
      comment_score_rank_change REAL,
      comment_count INTEGER,
      comment_count_change REAL,
      anomaly_flags TEXT,
      severity TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  for (const [column, type] of [
    ['pilot_industry_rank', 'REAL'],
    ['platform_help_rate', 'REAL'],
    ['three_minute_reply_rate', 'REAL'],
    ['in_transit_refund_duration', 'REAL'],
    ['return_refund_duration', 'REAL'],
    ['review_score_rank', 'REAL'],
    ['positive_review_rate', 'REAL'],
    ['group_to_sign_duration', 'REAL'],
    ['logistics_violation_rate', 'REAL'],
    ['store_activity_rate', 'REAL'],
    ['experience_plan_status', 'TEXT'],
  ] as const) {
    try {
      db.run(sql.raw(`ALTER TABLE store_metrics ADD COLUMN ${column} ${type}`));
    } catch {
      // Existing databases may already have this column.
    }
  }

  try {
    db.run(sql`ALTER TABLE store_metrics ADD COLUMN exp_service_basic REAL`);
  } catch {
    // Existing databases may already have this column.
  }

  try {
    db.run(sql`ALTER TABLE store_metrics ADD COLUMN exp_attitude REAL`);
  } catch {
    // Existing databases may already have this column.
  }

  for (const [column, type] of [
    ['exp_industry_rank_range', 'TEXT'],
    ['exp_basic_change', 'REAL'],
    ['exp_service_basic_change', 'REAL'],
    ['exp_attitude_change', 'REAL'],
    ['exp_shipping_change', 'REAL'],
    ['exp_product_change', 'REAL'],
    ['exp_logistics_change', 'REAL'],
  ] as const) {
    try {
      db.run(sql.raw(`ALTER TABLE store_metrics ADD COLUMN ${column} ${type}`));
    } catch {
      // Existing databases may already have this column.
    }
  }

  for (const [column, type] of [
    ['dispute_refund_count', 'INTEGER'],
    ['dispute_refund_rate', 'REAL'],
    ['intervention_order_count', 'INTEGER'],
    ['platform_intervention_rate', 'REAL'],
    ['quality_refund_rate', 'REAL'],
    ['average_refund_duration', 'REAL'],
    ['successful_refund_order_count', 'INTEGER'],
    ['successful_refund_amount', 'REAL'],
    ['successful_refund_rate', 'REAL'],
    ['return_refund_auto_duration', 'REAL'],
    ['refund_auto_duration', 'REAL'],
  ] as const) {
    try {
      db.run(sql.raw(`ALTER TABLE store_metrics ADD COLUMN ${column} ${type}`));
    } catch {
      // Existing databases may already have this column.
    }
  }

  for (const [column, type] of [
    ['comment_score_rank', 'REAL'],
    ['comment_score_rank_change', 'REAL'],
    ['comment_count', 'INTEGER'],
    ['comment_count_change', 'REAL'],
  ] as const) {
    try {
      db.run(sql.raw(`ALTER TABLE store_metrics ADD COLUMN ${column} ${type}`));
    } catch {
      // Existing databases may already have this column.
    }
  }

  db.run(sql`
    CREATE TABLE IF NOT EXISTS review_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL REFERENCES stores(id),
      inspection_id INTEGER REFERENCES inspection_records(id),
      review_id TEXT,
      review_content TEXT,
      review_stars INTEGER,
      action_type TEXT NOT NULL,
      action_content TEXT,
      template_id INTEGER,
      ai_confidence REAL,
      status TEXT NOT NULL DEFAULT 'pending',
      action_mode TEXT,
      screenshot_path TEXT,
      error_message TEXT,
      submitted_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  for (const [column, type] of [
    ['action_mode', 'TEXT'],
    ['submitted_at', 'TEXT'],
  ] as const) {
    try {
      db.run(sql.raw(`ALTER TABLE review_actions ADD COLUMN ${column} ${type}`));
    } catch {
      // Existing databases may already have this column.
    }
  }

  db.run(sql`
    CREATE TABLE IF NOT EXISTS interaction_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL REFERENCES stores(id),
      inspection_id INTEGER REFERENCES inspection_records(id),
      interaction_id TEXT,
      content_summary TEXT,
      ai_judgment TEXT,
      ai_confidence REAL,
      action TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      action_mode TEXT,
      screenshot_path TEXT,
      error_message TEXT,
      submitted_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  for (const [column, type] of [
    ['action_mode', 'TEXT'],
    ['screenshot_path', 'TEXT'],
    ['submitted_at', 'TEXT'],
  ] as const) {
    try {
      db.run(sql.raw(`ALTER TABLE interaction_actions ADD COLUMN ${column} ${type}`));
    } catch {
      // Existing databases may already have this column.
    }
  }

  db.run(sql`
    CREATE TABLE IF NOT EXISTS reply_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      scene TEXT,
      content TEXT NOT NULL,
      variables TEXT,
      store_id INTEGER REFERENCES stores(id),
      enabled INTEGER NOT NULL DEFAULT 1,
      usage_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS report_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      report_type TEXT,
      content TEXT NOT NULL,
      store_id INTEGER REFERENCES stores(id),
      enabled INTEGER NOT NULL DEFAULT 1,
      usage_count INTEGER DEFAULT 0,
      success_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL REFERENCES stores(id),
      inspection_id INTEGER REFERENCES inspection_records(id),
      type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'medium',
      description TEXT NOT NULL,
      factory TEXT,
      factory_feedback TEXT,
      rectification_status TEXT DEFAULT 'pending',
      handler TEXT,
      share_token TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'operator',
      store_ids TEXT,
      factory_ids TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS daily_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'generated',
      summary TEXT NOT NULL,
      stores TEXT NOT NULL,
      source_hash TEXT,
      generated_at TEXT NOT NULL,
      reviewed_at TEXT,
      published_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  saveDb(db);
  console.log('Migration complete: all tables created.');

  await closeDb();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
