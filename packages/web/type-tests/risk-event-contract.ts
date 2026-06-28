import { api, type RiskEvent, type RiskStatus } from '../src/api';

const event: RiskEvent = {
  id: 1,
  storeId: null,
  operatorId: 'ops',
  storeName: null,
  scope: 'global',
  eventType: 'login',
  severity: 'warning',
  message: 'Login binding requires manual login or timed out',
  actionType: null,
  sourceType: null,
  sourceId: null,
  screenshotPath: 'D:/try/pdd-6/packages/worker/data/screenshots/risk.png',
  htmlPath: 'D:/try/pdd-6/packages/worker/data/screenshots/risk.html',
  status: 'active',
  createdAt: '2026-06-29T00:00:00.000Z',
};

const status: RiskStatus = {
  globalWritePaused: false,
  globalReasons: [],
  pausedStoreIds: [],
  activeEvents: [event],
};

void status;
void api.resolveRiskEvent(event.id);
