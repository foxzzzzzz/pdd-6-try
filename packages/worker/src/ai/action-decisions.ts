import type { AIProvider } from '@pdd-inspector/core';

export type ReviewForDecision = { content: string; stars: number };
export type ReportTemplateFn = (review: ReviewForDecision) => string;
export type AsyncReportTemplateFn = (review: ReviewForDecision) => Promise<string>;
export type InteractionJudgment = { shouldHide: boolean; reason: string };
export type InteractionJudgeFn = (content: string) => InteractionJudgment;
export type AsyncInteractionJudgeFn = (content: string) => Promise<InteractionJudgment>;

const DEFAULT_REPORT_TEMPLATES = [
  { name: '广告引流', content: '该评价内容为广告信息，请平台核实处理' },
  { name: '不文明用语', content: '该评价包含不文明用语，请平台核实处理' },
  { name: '内容不实', content: '该评价内容不实，请平台核实处理' },
  { name: '其他', content: '该评价内容不实，请平台核实处理' },
];

export function createReportTemplateResolver(
  provider: Pick<AIProvider, 'classifyReview'>,
  fallback: ReportTemplateFn,
): AsyncReportTemplateFn {
  return async (review) => {
    try {
      const classification = await provider.classifyReview(
        review.content,
        review.stars,
        DEFAULT_REPORT_TEMPLATES,
      );
      if (!classification.shouldAct) return fallback(review);
      if (classification.suggestedContent?.trim()) return classification.suggestedContent.trim();
      const matched = DEFAULT_REPORT_TEMPLATES.find((template) => template.name === classification.recommendedTemplate);
      return matched?.content || fallback(review);
    } catch {
      return fallback(review);
    }
  };
}

export function createInteractionJudge(
  provider: Pick<AIProvider, 'judgeInteraction'>,
  fallback: InteractionJudgeFn,
): AsyncInteractionJudgeFn {
  return async (content) => {
    try {
      const judgment = await provider.judgeInteraction(content);
      if (judgment.confidence < 0.6) return fallback(content);
      return {
        shouldHide: judgment.shouldHide,
        reason: judgment.reason || `AI judgment: ${judgment.sentiment}`,
      };
    } catch {
      return fallback(content);
    }
  };
}
