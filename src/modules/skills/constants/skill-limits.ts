/** Skill 请求体限制（无表方案，仅内存处理） */
export const SKILL_LIMITS = {
  maxFileCount: 100,
  maxFileBytes: 512 * 1024,
  maxTotalBytes: 2 * 1024 * 1024,
  allowedExtensions: new Set([
    '.md',
    '.txt',
    '.json',
    '.yaml',
    '.yml',
    '.py',
    '.sh',
    '.js',
    '.ts',
    '.gitkeep',
  ]),

  /** scripts/ 下 .js 脚本执行限制（仅支持 JavaScript） */
  script: {
    /** 可执行脚本扩展名（唯一） */
    executableExtension: '.js',
    /** 单次脚本执行超时（毫秒） */
    timeoutMs: 10_000,
    /** stdout + stderr 合计最大字节数 */
    maxOutputBytes: 65_536,
    /** 同时运行的脚本进程上限 */
    maxConcurrentRuns: 5,
    /** agent loop 最大步数（含 tool 调用轮次） */
    maxTrialSteps: 5,
    /** 单脚本最大字节数（执行前校验） */
    maxScriptBytes: 32 * 1024,
    /** 单脚本最大行数 */
    maxScriptLines: 200,
    /** CLI 参数最大个数 */
    maxArgs: 10,
    /** 单个 CLI 参数最大字节数 */
    maxArgBytes: 8 * 1024,
  },
} as const;
