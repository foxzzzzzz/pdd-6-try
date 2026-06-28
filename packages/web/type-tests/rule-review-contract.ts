import { api, type RuleReviewUpdateInput } from '../src/api';

const payload: RuleReviewUpdateInput = {
  status: 'approved',
  owner: 'ops',
  conclusion: 'Reviewed current platform rules and no blocking change was found.',
  evidencePath: 'docs/evidence/rule-review.png',
  nextReviewAt: '2026-07-28T00:00:00.000Z',
};

void api.updateRuleReview('report_hide', payload);
