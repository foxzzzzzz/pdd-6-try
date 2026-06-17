/**
 * Claude AI Provider — Anthropic API
 */
import type {
  AIProvider, AIProviderConfig, ReviewClassification,
  SentimentJudgment, AnomalyDetection, DailySummary,
} from '@pdd-inspector/core';

const DEFAULT_BASE_URL = 'https://api.anthropic.com';

export class ClaudeProvider implements AIProvider {
  name: 'claude' = 'claude';
  private config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.config = config;
  }

  private async callAPI(prompt: string, system?: string): Promise<string> {
    const url = `${this.config.baseUrl || DEFAULT_BASE_URL}/v1/messages`;
    const body = {
      model: this.config.model,
      max_tokens: this.config.maxTokens || 1024,
      temperature: this.config.temperature ?? 0.3,
      system: system || '你是一个拼多多电商运营助手。请用中文回复，只返回要求的 JSON 格式，不要额外解释。',
      messages: [{ role: 'user', content: prompt }],
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Claude API error ${resp.status}: ${errText.substring(0, 200)}`);
    }

    const data = await resp.json() as any;
    return data.content?.[0]?.text || '';
  }

  private extractJSON(text: string): any {
    // Try to extract JSON from response (may be wrapped in ```json blocks)
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[1]); } catch { /* fall through */ }
    }
    try { return JSON.parse(text); } catch { /* fall through */ }
    return null;
  }

  // ========== 接入点 1&2: 评价分类 ==========
  async classifyReview(
    reviewContent: string,
    reviewStars: number,
    availableTemplates: { name: string; content: string }[],
  ): Promise<ReviewClassification> {
    const templateList = availableTemplates.map((t) => `- ${t.name}: ${t.content}`).join('\n');

    const prompt = `分析以下拼多多${reviewStars}星评价，选择最合适的处理方式。

评价内容: "${reviewContent}"

可用模板:
${templateList}

请返回 JSON:
{
  "category": "评价类型",
  "recommendedTemplate": "推荐使用的模板名称(从可用模板中选一个最匹配的)",
  "suggestedContent": "推荐的回复/举报内容(基于模板，可微调)",
  "confidence": 0.0到1.0的置信度,
  "shouldAct": true或false(置信度<0.6时不操作)
}`;

    const resp = await this.callAPI(prompt);
    const json = this.extractJSON(resp);

    if (json) {
      return {
        category: json.category || '未分类',
        recommendedTemplate: json.recommendedTemplate || availableTemplates[0]?.name || '',
        suggestedContent: json.suggestedContent || '',
        confidence: json.confidence || 0.5,
        shouldAct: (json.confidence || 0) >= 0.6,
      };
    }

    // Fallback
    return {
      category: '未分类',
      recommendedTemplate: availableTemplates[0]?.name || '',
      suggestedContent: '',
      confidence: 0,
      shouldAct: false,
    };
  }

  // ========== 接入点 3: 互动动态判断 ==========
  async judgeInteraction(content: string): Promise<SentimentJudgment> {
    const prompt = `判断以下拼多多店铺互动动态是否需要隐藏。需要隐藏的情况：负面评价、投诉倾向、恶意内容、广告引流。

动态内容: "${content}"

返回 JSON:
{
  "sentiment": "negative|neutral|positive",
  "confidence": 0.0到1.0,
  "shouldHide": true或false,
  "reason": "简要说明判断理由"
}`;

    const resp = await this.callAPI(prompt);
    const json = this.extractJSON(resp);

    if (json) {
      return {
        sentiment: json.sentiment || 'neutral',
        confidence: json.confidence || 0.5,
        shouldHide: json.shouldHide || false,
        reason: json.reason || '',
      };
    }

    return { sentiment: 'neutral', confidence: 0, shouldHide: false, reason: 'API parse failed' };
  }

  // ========== 接入点 4: 异常检测 ==========
  async detectAnomalies(
    current: Record<string, number | null>,
    historical: Record<string, number | null>[],
  ): Promise<AnomalyDetection> {
    const currentStr = JSON.stringify(current);
    const historyStr = JSON.stringify(historical.slice(-7)); // Last 7 days

    const prompt = `分析以下拼多多店铺指标数据，检测是否有异常波动。

今日数据: ${currentStr}
近7日历史: ${historyStr}

检测规则:
- 评分下降≥0.1视为预警，≥0.3视为严重
- 劣质率上升≥1%视为预警，≥3%视为严重
- 体验分下降≥20%视为预警，≥50%视为严重
- 退款率异常升高

返回 JSON:
{
  "isAnomaly": true或false,
  "severity": "normal|warning|critical",
  "flags": ["异常指标列表"],
  "description": "人类可读的异常描述"
}`;

    const resp = await this.callAPI(prompt);
    const json = this.extractJSON(resp);

    if (json) {
      return {
        isAnomaly: json.isAnomaly || false,
        severity: json.severity || 'normal',
        flags: json.flags || [],
        description: json.description || '',
      };
    }

    return { isAnomaly: false, severity: 'normal', flags: [], description: '' };
  }

  // ========== 接入点 5: 日报摘要 ==========
  async generateSummary(data: {
    storeName: string;
    metrics: Record<string, string | null>;
    reviewCount: number;
    reportCount: number;
    hideCount: number;
  }[]): Promise<DailySummary> {
    const dataStr = JSON.stringify(data);

    const prompt = `根据以下${data.length}家拼多多店铺的巡店数据，生成日报摘要。

数据: ${dataStr}

返回 JSON:
{
  "overview": "今日运营总体情况(2-3句话)",
  "attentionStores": [{"name": "需要关注的店铺名", "reason": "关注原因"}],
  "trends": "关键趋势分析(1-2句话)",
  "recommendations": ["建议行动1", "建议行动2"]
}`;

    const resp = await this.callAPI(prompt, '你是拼多多多店铺运营助手，擅长数据分析。用中文回复。');
    const json = this.extractJSON(resp);

    if (json) {
      return {
        overview: json.overview || '',
        attentionStores: json.attentionStores || [],
        trends: json.trends || '',
        recommendations: json.recommendations || [],
      };
    }

    return { overview: '日报生成失败', attentionStores: [], trends: '', recommendations: [] };
  }
}
