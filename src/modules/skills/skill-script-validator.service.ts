import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SKILL_LIMITS } from './constants/skill-limits';
import {
  SCRIPT_DANGER_RULES,
  type ScriptDangerRule,
} from './constants/skill-script-rules';
import type {
  ScriptValidationIssue,
  ScriptValidationResult,
} from './interfaces/script-run-result.interface';
import { SkillFilesService } from './skill-files.service';

export interface ScriptBatchValidationResult {
  safe: boolean;
  issues: ScriptValidationIssue[];
  byPath: Record<string, ScriptValidationResult>;
}

@Injectable()
export class SkillScriptValidatorService {
  constructor(
    private readonly configService: ConfigService,
    private readonly skillFilesService: SkillFilesService,
  ) {}

  /** 试用入口：扫描 Skill 中全部可执行 .js 脚本 */
  validateAllScripts(files: Record<string, string>): ScriptBatchValidationResult {
    const scriptPaths = this.skillFilesService.listScriptPaths(files);
    const byPath: Record<string, ScriptValidationResult> = {};
    const issues: ScriptValidationIssue[] = [];

    for (const path of scriptPaths) {
      const result = this.validate(files[path], path);
      byPath[path] = result;
      issues.push(...result.issues);
    }

    return {
      safe: issues.every((issue) => issue.level !== 'error'),
      issues,
      byPath,
    };
  }

  validate(content: string, path: string): ScriptValidationResult {
    const issues: ScriptValidationIssue[] = [];
    const strictMode = this.isStrictMode();

    if (!this.skillFilesService.isJsScriptPath(path)) {
      issues.push({
        level: 'error',
        message: `${path}：仅支持执行 scripts/ 目录下的 .js 文件`,
      });
      return { safe: false, issues };
    }

    if (!content.trim()) {
      issues.push({ level: 'error', message: `${path}：脚本内容为空` });
      return { safe: false, issues };
    }

    const bytes = Buffer.byteLength(content, 'utf8');
    const maxBytes = this.resolveMaxScriptBytes();
    if (bytes > maxBytes) {
      issues.push({
        level: 'error',
        message: `${path}：脚本超过 ${maxBytes} 字节（当前 ${bytes}）`,
      });
    }

    const lineCount = content.split('\n').length;
    const maxLines = this.resolveMaxScriptLines();
    if (lineCount > maxLines) {
      issues.push({
        level: 'error',
        message: `${path}：脚本超过 ${maxLines} 行（当前 ${lineCount}）`,
      });
    }

    const syntaxError = this.checkSyntax(content, path);
    if (syntaxError) {
      issues.push({ level: 'error', message: syntaxError });
    }

    for (const rule of SCRIPT_DANGER_RULES) {
      if (!rule.pattern.test(content)) {
        continue;
      }
      issues.push({
        level: this.resolveRuleLevel(rule, strictMode),
        message: `${path}：${rule.message}`,
      });
    }

    const hasError = issues.some((issue) => issue.level === 'error');
    return { safe: !hasError, issues };
  }

  /** run_script 调用前：校验 CLI 参数 */
  validateArgs(args: string[] | undefined, scriptPath: string): ScriptValidationResult {
    const issues: ScriptValidationIssue[] = [];
    const list = args ?? [];
    const maxArgs = this.resolveMaxArgs();
    const maxArgBytes = this.resolveMaxArgBytes();

    if (list.length > maxArgs) {
      issues.push({
        level: 'error',
        message: `${scriptPath}：参数个数超过上限（${maxArgs}）`,
      });
    }

    for (const [index, arg] of list.entries()) {
      if (typeof arg !== 'string') {
        issues.push({
          level: 'error',
          message: `${scriptPath}：第 ${index + 1} 个参数必须是字符串`,
        });
        continue;
      }

      if (arg.includes('\0')) {
        issues.push({
          level: 'error',
          message: `${scriptPath}：第 ${index + 1} 个参数包含非法字符`,
        });
      }

      const bytes = Buffer.byteLength(arg, 'utf8');
      if (bytes > maxArgBytes) {
        issues.push({
          level: 'error',
          message: `${scriptPath}：第 ${index + 1} 个参数超过 ${maxArgBytes} 字节`,
        });
      }
    }

    const hasError = issues.some((issue) => issue.level === 'error');
    return { safe: !hasError, issues };
  }

  isStrictMode(): boolean {
    return (
      this.configService.get<string>('SKILL_SCRIPT_STRICT_MODE', 'true') ===
      'true'
    );
  }

  private resolveRuleLevel(
    rule: ScriptDangerRule,
    strictMode: boolean,
  ): 'error' | 'warning' {
    if (rule.level === 'error') {
      return 'error';
    }
    if (rule.strictOnly && strictMode) {
      return 'error';
    }
    return rule.level;
  }

  private checkSyntax(content: string, path: string): string | null {
    try {
      // eslint-disable-next-line no-new-func
      new Function(content);
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `${path}：语法错误 — ${message}`;
    }
  }

  private resolveMaxScriptBytes(): number {
    return this.resolveInt(
      'SKILL_SCRIPT_MAX_SCRIPT_BYTES',
      SKILL_LIMITS.script.maxScriptBytes,
    );
  }

  private resolveMaxScriptLines(): number {
    return this.resolveInt(
      'SKILL_SCRIPT_MAX_SCRIPT_LINES',
      SKILL_LIMITS.script.maxScriptLines,
    );
  }

  private resolveMaxArgs(): number {
    return this.resolveInt('SKILL_SCRIPT_MAX_ARGS', SKILL_LIMITS.script.maxArgs);
  }

  private resolveMaxArgBytes(): number {
    return this.resolveInt(
      'SKILL_SCRIPT_MAX_ARG_BYTES',
      SKILL_LIMITS.script.maxArgBytes,
    );
  }

  private resolveInt(key: string, fallback: number): number {
    const raw = this.configService.get<string>(key, String(fallback));
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
}
