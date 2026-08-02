import type { UIMessage } from 'ai';

/** 试用模式：每次请求只使用最新一条用户消息，避免历史对话干扰 Skill 判定 */
export function pickLatestTrialMessage(messages: UIMessage[]): UIMessage[] {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'user') {
      return [messages[i]];
    }
  }

  return messages.length ? [messages[messages.length - 1]] : [];
}
