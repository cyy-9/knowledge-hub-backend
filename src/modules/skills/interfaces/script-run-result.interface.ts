/** Docker / 本地 fallback 执行 scripts/*.js 的返回结构 */
export interface ScriptRunResult {
  path: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  /** 输出是否因超出上限被截断 */
  truncated: boolean;
  /** 实际执行方式：docker 或 local（开发 fallback） */
  runtime: 'docker' | 'local';
  durationMs: number;
}

/** 脚本静态校验结果 */
export interface ScriptValidationIssue {
  level: 'error' | 'warning';
  message: string;
}

export interface ScriptValidationResult {
  safe: boolean;
  issues: ScriptValidationIssue[];
}
