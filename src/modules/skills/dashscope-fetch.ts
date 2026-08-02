import type { FetchFunction } from '@ai-sdk/provider-utils';

/**
 * 百炼 OpenAI 兼容接口：注入 enable_thinking / thinking_budget。
 * Qwen 混合思考模型默认开启思考，试用场景通常需要关闭以加快首 token。
 */
export function createDashScopeFetch(options?: {
  enableThinking?: boolean;
  thinkingBudget?: number;
}): FetchFunction {
  const enableThinking = options?.enableThinking ?? false;
  const thinkingBudget = options?.thinkingBudget;

  return async (input, init) => {
    if (init?.method === 'POST' && typeof init.body === 'string') {
      try {
        const body = JSON.parse(init.body) as Record<string, unknown>;
        body.enable_thinking = enableThinking;

        if (thinkingBudget != null) {
          body.thinking_budget = thinkingBudget;
        }

        return fetch(input, {
          ...init,
          body: JSON.stringify(body),
        });
      } catch {
        // 非 JSON body 时原样转发
      }
    }

    return fetch(input, init);
  };
}
