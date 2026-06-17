/**
 * AI Provider 工厂 — 根据配置实例化不同 Provider
 *
 * 三级配置优先级: 任务指定 > 店铺覆盖 > 全局默认
 */
import type { AIProvider, AIProviderConfig } from '@pdd-inspector/core';
import { buildAIConfig } from '@pdd-inspector/core';
import { ClaudeProvider } from './claude-provider';

// 缓存已创建的 Provider 实例
const providerCache = new Map<string, AIProvider>();

/**
 * 获取 AI Provider 实例
 * @param storeAiConfig 店铺级 AI 配置 (JSON string from stores.ai_config)
 * @param taskModel 任务级模型覆盖 (如 'claude-haiku-4-5' for light tasks)
 */
export function getAIProvider(
  storeAiConfig?: string | null,
  taskModel?: string,
): AIProvider {
  const cacheKey = `${storeAiConfig || ''}:${taskModel || ''}`;

  if (providerCache.has(cacheKey)) {
    return providerCache.get(cacheKey)!;
  }

  // 三级配置合并
  const config = buildAIConfig(
    process.env.AI_PROVIDER,
    taskModel ? undefined : process.env.AI_LIGHT_MODEL || process.env.AI_HEAVY_MODEL,
    process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY,
    storeAiConfig,
    taskModel,
  );

  if (!config.apiKey) {
    throw new Error(
      `AI Provider "${config.provider}" requires an API key. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or DEEPSEEK_API_KEY in .env`,
    );
  }

  let provider: AIProvider;
  switch (config.provider) {
    case 'claude':
      provider = new ClaudeProvider(config);
      break;
    default:
      throw new Error(`Unsupported AI provider: ${config.provider}. Supported: claude`);
  }

  providerCache.set(cacheKey, provider);
  return provider;
}

/** 轻量模型 (介入点 1,2,4) */
export function getLightProvider(storeAiConfig?: string | null): AIProvider {
  return getAIProvider(storeAiConfig, process.env.AI_LIGHT_MODEL || 'claude-haiku-4-5');
}

/** 重量模型 (介入点 3,5) */
export function getHeavyProvider(storeAiConfig?: string | null): AIProvider {
  return getAIProvider(storeAiConfig, process.env.AI_HEAVY_MODEL || 'claude-sonnet-4-6');
}

/** 清除缓存 (用于测试) */
export function clearProviderCache(): void {
  providerCache.clear();
}
