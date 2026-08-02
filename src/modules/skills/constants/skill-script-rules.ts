/** 可执行脚本必须是 scripts/ 下的 .js 文件 */
export const JS_SCRIPT_PATH_PATTERN =
  /\/scripts\/[^/]+\.js$|^scripts\/[^/]+\.js$/;

/** scripts/ 下非 .js 文件（可上传但不可执行） */
export const NON_JS_SCRIPT_IN_SCRIPTS_PATTERN =
  /\/scripts\/[^/]+\.(?!js$)[^/]+$|^scripts\/[^/]+\.(?!js$)[^/]+$/;

export interface ScriptDangerRule {
  pattern: RegExp;
  message: string;
  level: 'error' | 'warning';
  /** 仅在 SKILL_SCRIPT_STRICT_MODE=true 时作为 error，否则为 warning */
  strictOnly?: boolean;
}

/** 后端脚本静态扫描规则（前端 scriptSafetyCheck.js 需保持同步） */
export const SCRIPT_DANGER_RULES: ScriptDangerRule[] = [
  {
    pattern:
      /\brequire\s*\(\s*['"`](?:fs|node:fs|child_process|node:child_process|net|node:net|http|node:http|https|node:https|dgram|node:dgram|cluster|node:cluster|worker_threads|node:worker_threads|vm|node:vm|os|node:os|path|node:path|url|node:url|dns|node:dns|tls|node:tls|module|node:module)['"`]/,
    message: '禁止使用 require 加载 Node 内置敏感模块',
    level: 'error',
  },
  {
    pattern: /\brequire\s*\(\s*[^'"`\s]/,
    message: '禁止动态 require（变量参数）',
    level: 'error',
  },
  {
    pattern:
      /\bimport\s+.*from\s+['"`](?:fs|node:fs|child_process|node:child_process|net|node:net|http|node:http|https|node:https|path|node:path|url|node:url|dns|node:dns)['"`]/,
    message: '禁止使用 import 加载 Node 内置敏感模块',
    level: 'error',
  },
  {
    pattern: /\bimport\s*\(/,
    message: '禁止动态 import()',
    level: 'error',
  },
  {
    pattern: /\bprocess\.(?!argv\b|exit\b)/,
    message: '仅允许 process.argv / process.exit',
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
    message: '不建议使用 fetch（本地执行模式下无法保证网络隔离）',
    level: 'warning',
    strictOnly: true,
  },
  {
    pattern: /\b__dirname\b|\b__filename\b/,
    message: '不建议使用 __dirname / __filename',
    level: 'warning',
    strictOnly: true,
  },
];
