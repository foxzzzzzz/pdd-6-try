import type {
  AIProvider, AIProviderConfig, ReviewClassification,
  SentimentJudgment, AnomalyDetection, DailySummary,
} from '@pdd-inspector/core';

const DEFAULT_BASE_URL = 'https://api.deepseek.com';

export class DeepSeekProvider implements AIProvider {
  name: 'deepseek' = 'deepseek';
  private config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.config = config;
  }

  private async callAPI(prompt: string, system?: string): Promise<string> {
    const baseUrl = this.config.baseUrl || DEFAULT_BASE_URL;
    const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
    const body = {
      model: this.config.model,
      temperature: this.config.temperature ?? 0.3,
      max_tokens: this.config.maxTokens || 1024,
      messages: [
        {
          role: 'system',
          content: system || '你是一个拼多多电商运营助手。请用中文回复，只返回要求的 JSON 格式，不要额外解释。',
        },
        { role: 'user', content: prompt },
      ],
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`DeepSeek API error ${resp.status}: ${errText.substring(0, 200)}`);
    }

    const data = await resp.json() as any;
    return data.choices?.[0]?.message?.content || '';
  }

  private extractJSON(text: string): any {
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[1]); } catch { /* fall through */ }
    }
    try { return JSON.parse(text); } catch { /* fall through */ }
    return null;
  }

  async classifyReview(
    reviewContent: string,
    reviewStars: number,
    availableTemplates: { name: string; content: string }[],
  ): Promise<ReviewClassification> {
    const templateList = availableTemplates.map((template) => `- ${template.name}: ${template.content}`).join('\n');
    const prompt = `分析以下拼多多 ${reviewStars} 星评价，选择最合适的处理方式。
评价内容: "${reviewContent}"

可用模板:
${templateList}

请返回 JSON:
{
  "category": "评价类型",
  "recommendedTemplate": "推荐使用的模板名称，必须来自可用模板",
  "suggestedContent": "推荐的回复或举报内容",
  "confidence": 0.0到1.0的置信度,
  "shouldAct": true或false
}`;

    const resp = await this.callAPI(prompt);
    const json = this.extractJSON(resp);
    if (!json) return { category: '未分类', recommendedTemplate: availableTemplates[0]?.name || '', suggestedContent: '', confidence: 0, shouldAct: false };

    const confidence = Number(json.confidence ?? 0.5);
    return {
      category: json.category || '未分类',
      recommendedTemplate: json.recommendedTemplate || availableTemplates[0]?.name || '',
      suggestedContent: json.suggestedContent || '',
      confidence,
      shouldAct: Boolean(json.shouldAct) && confidence >= 0.6,
    };
  }

  async judgeInteraction(content: string): Promise<SentimentJudgment> {
    const prompt = `判断以下拼多多店铺互动评论是否需要隐藏。需要隐藏的情况：负面评价、投诉倾向、恶意内容、广告引流。
互动内容: "${content}"

返回 JSON:
{
  "sentiment": "negative|neutral|positive",
  "confidence": 0.0到1.0,
  "shouldHide": true或false,
  "reason": "简要说明判断理由"
}`;

    const resp = await this.callAPI(prompt);
    const json = this.extractJSON(resp);
    if (!json) return { sentiment: 'neutral', confidence: 0, shouldHide: false, reason: 'API parse failed' };

    return {
      sentiment: json.sentiment || 'neutral',
      confidence: Number(json.confidence ?? 0.5),
      shouldHide: Boolean(json.shouldHide),
      reason: json.reason || '',
    };
  }

  async detectAnomalies(
    current: Record<string, number | null>,
    historical: Record<string, number | null>[],
  ): Promise<AnomalyDetection> {
    const prompt = `分析以下拼多多店铺指标数据，检测是否有异常波动。
今日数据: ${JSON.stringify(current)}
近7日历史: ${JSON.stringify(historical.slice(-7))}

返回 JSON:
{
  "isAnomaly": true或false,
  "severity": "normal|warning|critical",
  "flags": ["异常指标列表"],
  "description": "人类可读的异常说明"
}`;

    const resp = await this.callAPI(prompt);
    const json = this.extractJSON(resp);
    if (!json) return { isAnomaly: false, severity: 'normal', flags: [], description: '' };

    return {
      isAnomaly: Boolean(json.isAnomaly),
      severity: json.severity || 'normal',
      flags: Array.isArray(json.flags) ? json.flags : [],
      description: json.description || '',
    };
  }

  async generateSummary(data: {
    storeName: string;
    metrics: Record<string, string | null>;
    reviewCount: number;
    reportCount: number;
    hideCount: number;
  }[]): Promise<DailySummary> {
    const prompt = `根据以下 ${data.length} 家拼多多店铺的巡店数据，生成日报摘要。
数据: ${JSON.stringify(data)}

返回 JSON:
{
  "overview": "今日运营总体情况",
  "attentionStores": [{"name": "店铺名", "reason": "关注原因"}],
  "trends": "关键趋势分析",
  "recommendations": ["建议行动1", "建议行动2"]
}`;

    const resp = await this.callAPI(prompt, '你是拼多多店铺运营助手，擅长数据分析。用中文回复，只返回 JSON。');
    const json = this.extractJSON(resp);
    if (!json) return { overview: '日报生成失败', attentionStores: [], trends: '', recommendations: [] };

    return {
      overview: json.overview || '',
      attentionStores: Array.isArray(json.attentionStores) ? json.attentionStores : [],
      trends: json.trends || '',
      recommendations: Array.isArray(json.recommendations) ? json.recommendations : [],
    };
  }
}
