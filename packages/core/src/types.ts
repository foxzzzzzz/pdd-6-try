// ============================================================
// Store & Inspection Types
// ============================================================

export type StoreStatus = 'active' | 'paused' | 'pending_login';
export type InspectionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'partial';
export type Severity = 'normal' | 'warning' | 'critical';
export type IssueType = 'quality' | 'logistics' | 'service' | 'review' | 'other';
export type RectificationStatus = 'pending' | 'in_progress' | 'resolved' | 'closed';
export type UserRole = 'admin' | 'operator' | 'factory';
export type ActionStatus = 'pending' | 'success' | 'failed' | 'skipped';
export type ReviewActionType = 'reply' | 'report';
export type InteractionAction = 'hide' | 'ignore';

// ============================================================
// Store Metrics Snapshot
// ============================================================

export interface MetricsSnapshot {
  storeId: number;
  date: string;

  // Store health
  rating: number | null;
  ratingChange: number | null;
  defectRate: number | null;
  defectRateChange: number | null;

  // DSR
  dsrDesc: number | null;
  dsrService: number | null;
  dsrLogistics: number | null;
  dsrRankChange: string | null;

  // Pilot mall / store star assessment
  pilotIndustryRank: number | null;
  platformHelpRate: number | null;
  threeMinuteReplyRate: number | null;
  inTransitRefundDuration: number | null;
  returnRefundDuration: number | null;
  reviewScoreRank: number | null;
  positiveReviewRate: number | null;
  groupToSignDuration: number | null;
  logisticsViolationRate: number | null;
  storeActivityRate: number | null;
  experiencePlanStatus: string | null;

  // Consumer experience
  expBasic: number | null;
  expServiceBasic: number | null;
  expAttitude: number | null;
  expShipping: number | null;
  expProduct: number | null;
  expLogistics: number | null;
  expIndustryRankRange: string | null;
  expBasicChange: number | null;
  expServiceBasicChange: number | null;
  expAttitudeChange: number | null;
  expShippingChange: number | null;
  expProductChange: number | null;
  expLogisticsChange: number | null;

  // Orders
  refundDuration: number | null;
  refundRate: number | null;
  disputeRate: number | null;

  // Appeals
  appealCount: number | null;
  appealSuccessRate: number | null;
}

// ============================================================
// Inspection Result
// ============================================================

export interface InspectionResult {
  storeId: number;
  date: string;
  status: InspectionStatus;
  duration: number;
  completionRate: number;
  summary: string;

  metrics: MetricsSnapshot;
  reviewActions: {
    total: number;
    replied: number;
    reported: number;
    skipped: number;
    failed: number;
    details: ReviewActionDetail[];
  };
  interactionActions: {
    total: number;
    hidden: number;
    ignored: number;
    skipped: number;
    details: InteractionActionDetail[];
  };
  issues: IssueDetail[];
}

export interface ReviewActionDetail {
  reviewId: string;
  reviewContent: string;
  reviewStars: number;
  actionType: ReviewActionType;
  actionContent: string;
  status: ActionStatus;
}

export interface InteractionActionDetail {
  interactionId: string;
  contentSummary: string;
  aiJudgment: string;
  action: InteractionAction;
  status: ActionStatus;
}

export interface IssueDetail {
  type: IssueType;
  severity: Severity;
  description: string;
  factory?: string;
}

// ============================================================
// Daily Report
// ============================================================

export interface DailyReport {
  date: string;
  generatedAt: string;
  totalStores: number;
  normalCount: number;
  warningCount: number;
  criticalCount: number;
  totalDuration: number; // seconds
  storeReports: StoreReport[];
  summary: string;
}

export interface StoreReport {
  storeId: number;
  storeName: string;
  status: InspectionStatus;
  severity: Severity;
  duration: number;
  completionRate: number;
  metrics: MetricsSnapshot;
  operationsSummary: string;
  anomalyNotes: string;
}
