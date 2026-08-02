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

  /** scripts/ 下 .js 脚本执行限制（Docker 沙箱） */
  script: {
    /** 单次脚本执行超时（毫秒） */
    timeoutMs: 10_000,
    /** stdout + stderr 合计最大字节数 */
    maxOutputBytes: 65_536,
    /** 同时运行的脚本容器上限 */
    maxConcurrentRuns: 5,
    /** agent loop 最大步数（含 tool 调用轮次） */
    maxTrialSteps: 5,
  },
} as const;
