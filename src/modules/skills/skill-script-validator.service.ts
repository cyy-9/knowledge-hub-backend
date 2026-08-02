import { Injectable } from '@nestjs/common';
import type {
  ScriptValidationIssue,
  ScriptValidationResult,
} from './interfaces/script-run-result.interface';

/**
 * 服务端脚本静态校验（Phase 2）
 *
 * 校验 scripts/*.js 的语法与危险 API 调用。
 * 这是执行前的安全边界之一；Docker 隔离是另一层。
 * 脚本的「何时使用 / 调用方式 / 输出格式」不在此校验，由 SKILL.md 文档 + AI 理解。
 */
@Injectable()
export class SkillScriptValidatorService {
  private readonly dangerousPatterns: Array<{
    pattern: RegExp;
    message: string;
    level: 'error' | 'warning';
  }> = [
    {
      pattern:
        /\brequire\s*\(\s*['"`](?:fs|node:fs|child_process|node:child_process|net|node:net|http|node:http|https|node:https|dgram|node:dgram|cluster|node:cluster|worker_threads|node:worker_threads|vm|node:vm|os|node:os)['"`]/,
      message: '禁止使用 require 加载 Node 内置敏感模块',
      level: 'error',
    },
    {
      pattern:
        /\bimport\s+.*from\s+['"`](?:fs|node:fs|child_process|node:child_process|net|node:net|http|node:http|https|node:https)['"`]/,
      message: '禁止使用 import 加载 Node 内置敏感模块',
      level: 'error',
    },
    {
      pattern: /\bprocess\.(?!argv\b|exit\b)/,
      message: '仅允许 process.argv / process.exit，禁止访问其他 process 属性',
      level: 'error',
    },
    {
      pattern: /\bglobal(?:This)?\s*\./,
      message: '禁止访问 global / globalThis',
      level: 'error',
    },
    {
      pattern: /\beval\s*\(/,
      message: '禁止使用 eval',
      level: 'error',
    },
    {
      pattern: /\bnew\s+Function\s*\(/,
      message: '禁止使用 new Function',
      level: 'error',
    },
    {
      pattern: /\bchild_process\b/,
      message: '禁止引用 child_process',
      level: 'error',
    },
    {
      pattern: /\bfetch\s*\(/,
      message: '脚本默认无网络访问，不建议使用 fetch',
      level: 'warning',
    },
  ];

  validate(content: string, path: string): ScriptValidationResult {
    const issues: ScriptValidationIssue[] = [];

    if (!content.trim()) {
      issues.push({ level: 'error', message: `${path}：脚本内容为空` });
      return { safe: false, issues };
    }

    const syntaxError = this.checkSyntax(content, path);
    if (syntaxError) {
      issues.push({ level: 'error', message: syntaxError });
    }

    for (const rule of this.dangerousPatterns) {
      if (rule.pattern.test(content)) {
        issues.push({ level: rule.level, message: `${path}：${rule.message}` });
      }
    }

    const hasError = issues.some((issue) => issue.level === 'error');
    return { safe: !hasError, issues };
  }

  private checkSyntax(content: string, path: string): string | null {
    try {
      // 仅做语法解析，不执行脚本
      // eslint-disable-next-line no-new-func
      new Function(content);
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `${path}：语法错误 — ${message}`;
    }
  }
}
