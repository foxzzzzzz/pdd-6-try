import { eq } from 'drizzle-orm';
import { getDb, LoginBindJobData, saveDb, schema } from '@pdd-inspector/core';
import { BrowserManager } from './browser';
import {
  getOperatorStoreSession,
  markOperatorStoreSessionStatus,
  normalizeOperatorId,
  saveOperatorStoreSession,
} from './operator-session';
import { recordRiskEvent } from './risk-sentinel';

export interface LoginBindExecutorConfig {
  headless: boolean;
}

export interface LoginBindResult {
  status: 'success' | 'failed';
  storeId: number;
  operatorId: string;
  error?: string;
}

export async function executeLoginBind(
  job: LoginBindJobData,
  config: LoginBindExecutorConfig,
): Promise<LoginBindResult> {
  const operatorId = normalizeOperatorId(job.operatorId);
  if (!operatorId) {
    throw new Error('operatorId is required for login binding');
  }

  const db = await getDb();
  const store = db
    .select()
    .from(schema.stores)
    .where(eq(schema.stores.id, job.storeId))
    .get();
  if (!store) {
    throw new Error(`Store not found: ${job.storeId}`);
  }

  const session = getOperatorStoreSession(db, operatorId, store.id);
  const browser = new BrowserManager();
  let resultError: string | null = null;

  try {
    await browser.init({
      headless: config.headless,
      profileKey: session?.profileKey,
    });

    const loggedIn = await browser.login(store.id, session?.storageState || store.storageState);
    if (!loggedIn) {
      markOperatorStoreSessionStatus(db, operatorId, store.id, 'pending_login');
      db.update(schema.stores)
        .set({ status: 'pending_login', updatedAt: new Date().toISOString() })
        .where(eq(schema.stores.id, store.id))
        .run();
      await recordRiskEvent(db, {
        storeId: store.id,
        operatorId,
        eventType: 'login',
        message: 'Login binding requires manual login or timed out',
        browser,
      });
      saveDb(db);
      return {
        status: 'failed',
        storeId: store.id,
        operatorId,
        error: '登录绑定未完成或已超时',
      };
    }

    const storageState = await browser.saveStorageState();
    saveOperatorStoreSession(db, operatorId, store.id, storageState, 'active');
    db.update(schema.stores)
      .set({
        storageState,
        status: 'active',
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.stores.id, store.id))
      .run();
    saveDb(db);

    return {
      status: 'success',
      storeId: store.id,
      operatorId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    resultError = message;
    markOperatorStoreSessionStatus(db, operatorId, store.id, 'pending_login');
    db.update(schema.stores)
      .set({ status: 'pending_login', updatedAt: new Date().toISOString() })
      .where(eq(schema.stores.id, store.id))
      .run();
    saveDb(db);
    return {
      status: 'failed',
      storeId: store.id,
      operatorId,
      error: message,
    };
  } finally {
    if (shouldKeepLoginBindBrowserOpen(resultError)) {
      console.log(`Store ${store.id}: Security challenge browser window left open for manual login-bind handling`);
    } else {
      await browser.close();
    }
  }
}

export function shouldKeepLoginBindBrowserOpen(errorMessage: string | null | undefined): boolean {
  return Boolean(errorMessage?.includes('Security challenge detected'));
}
