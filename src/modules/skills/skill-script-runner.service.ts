import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { join } from 'node:path';
import { SKILL_LIMITS } from './constants/skill-limits';
import type { ScriptRunResult } from './interfaces/script-run-result.interface';
import type { SkillWorkspace } from './interfaces/skill-workspace.interface';

/** macOS / Linux 常见 docker 路径（IDE 或服务进程 PATH 可能不含 docker） */
const DOCKER_BIN_CANDIDATES = [
  '/usr/bin/docker', // Linux 包管理安装（apt/yum）最常见
  '/usr/local/bin/docker', // macOS Docker Desktop / 部分 Linux
  '/Applications/Docker.app/Contents/Resources/bin/docker', // macOS
  '/opt/homebrew/bin/docker', // Apple Silicon Homebrew
];

/**
 * Skill 脚本执行器（Phase 1）
 *
 * 在受限制的 Docker 容器中执行 scripts/*.js；
 * 开发环境可通过 SKILL_SCRIPT_USE_DOCKER=false 降级为本地 node（不推荐生产）。
 */
@Injectable()
export class SkillScriptRunnerService {
  private readonly logger = new Logger(SkillScriptRunnerService.name);
  private activeRuns = 0;
  private resolvedDockerBin: string | null | undefined;

  constructor(private readonly configService: ConfigService) {}

  isEnabled(): boolean {
    return (
      this.configService.get<string>('SKILL_SCRIPT_ENABLED', 'true') === 'true'
    );
  }

  getActiveRuns(): number {
    return this.activeRuns;
  }

  async run(
    workspace: SkillWorkspace,
    scriptPath: string,
    args: string[] = [],
  ): Promise<ScriptRunResult> {
    if (!this.isEnabled()) {
      throw new Error('Skill 脚本执行未启用（SKILL_SCRIPT_ENABLED=false）');
    }

    const maxConcurrent = this.resolveMaxConcurrent();
    if (this.activeRuns >= maxConcurrent) {
      throw new Error(
        `脚本并发执行已达上限（${maxConcurrent}），请稍后重试`,
      );
    }

    const useDocker =
      this.configService.get<string>('SKILL_SCRIPT_USE_DOCKER', 'true') ===
      'true';

    this.activeRuns += 1;
    const startedAt = Date.now();

    try {
      const raw = useDocker
        ? await this.runInDocker(workspace, scriptPath, args)
        : await this.runLocally(workspace, scriptPath, args);

      const maxOutputBytes = this.resolveMaxOutputBytes();
      const truncated =
        Buffer.byteLength(raw.stdout + raw.stderr, 'utf8') > maxOutputBytes;

      return {
        path: scriptPath,
        exitCode: raw.exitCode,
        stdout: this.truncateOutput(raw.stdout, maxOutputBytes),
        stderr: this.truncateOutput(
          raw.stderr,
          Math.max(0, maxOutputBytes - Buffer.byteLength(raw.stdout, 'utf8')),
        ),
        truncated,
        runtime: useDocker ? 'docker' : 'local',
        durationMs: Date.now() - startedAt,
      };
    } finally {
      this.activeRuns -= 1;
    }
  }

  private async runInDocker(
    workspace: SkillWorkspace,
    scriptPath: string,
    args: string[],
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const image = this.configService.get<string>(
      'SKILL_SCRIPT_DOCKER_IMAGE',
      'skill-sandbox-node:latest',
    );
    const timeoutMs = this.resolveTimeoutMs();
    const memory = this.configService.get<string>(
      'SKILL_SCRIPT_DOCKER_MEMORY',
      '128m',
    );
    const cpus = this.configService.get<string>(
      'SKILL_SCRIPT_DOCKER_CPUS',
      '0.5',
    );
    const dockerBin = this.resolveDockerBin();

    const dockerArgs = [
      'run',
      '--rm',
      '--network',
      'none',
      '--read-only',
      '--memory',
      memory,
      '--cpus',
      cpus,
      '--pids-limit',
      '64',
      '--user',
      'node',
      '-v',
      `${workspace.rootPath}:/skill:ro`,
      '-w',
      '/skill',
      image,
      'node',
      scriptPath,
      ...args,
    ];

    this.logger.debug(`Docker 执行：${dockerBin} ${dockerArgs.join(' ')}`);

    return this.spawnProcess(dockerBin, dockerArgs, timeoutMs);
  }

  /**
   * 解析 docker 可执行文件路径。
   * spawn docker ENOENT 通常是因为 IDE 启动的后端进程 PATH 不含 /usr/local/bin。
   */
  private resolveDockerBin(): string {
    if (this.resolvedDockerBin !== undefined) {
      if (!this.resolvedDockerBin) {
        throw new Error(this.buildDockerNotFoundMessage());
      }
      return this.resolvedDockerBin;
    }

    const configured = this.configService
      .get<string>('SKILL_SCRIPT_DOCKER_BIN', '')
      .trim();
    if (configured && this.isExecutable(configured)) {
      this.resolvedDockerBin = configured;
      this.logger.log(`使用配置的 Docker 路径：${configured}`);
      return configured;
    }

    for (const candidate of DOCKER_BIN_CANDIDATES) {
      if (this.isExecutable(candidate)) {
        this.resolvedDockerBin = candidate;
        this.logger.log(`自动解析 Docker 路径：${candidate}`);
        return candidate;
      }
    }

    this.resolvedDockerBin = null;
    throw new Error(this.buildDockerNotFoundMessage());
  }

  private isExecutable(path: string): boolean {
    try {
      accessSync(path, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  private buildDockerNotFoundMessage(): string {
    return [
      '找不到 docker 可执行文件（spawn docker ENOENT）。',
      '请确认 Docker Desktop 已启动，并在 .env 中设置：',
      'SKILL_SCRIPT_DOCKER_BIN=/usr/local/bin/docker',
      '或临时使用本地执行：SKILL_SCRIPT_USE_DOCKER=false',
    ].join(' ');
  }

  private async runLocally(
    workspace: SkillWorkspace,
    scriptPath: string,
    args: string[],
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    this.logger.warn(
      `使用本地 node 执行脚本（非 Docker 隔离）：${scriptPath}`,
    );

    const absoluteScript = join(workspace.rootPath, scriptPath);
    return this.spawnProcess(
      'node',
      [absoluteScript, ...args],
      this.resolveTimeoutMs(),
      workspace.rootPath,
    );
  }

  private spawnProcess(
    command: string,
    args: string[],
    timeoutMs: number,
    cwd?: string,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        env: {
          NODE_ENV: 'production',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          child.kill('SIGKILL');
          reject(new Error(`脚本执行超时（${timeoutMs}ms）`));
        }
      }, timeoutMs);

      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });

      child.on('error', (error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(error);
        }
      });

      child.on('close', (code) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({
            exitCode: code ?? 1,
            stdout,
            stderr,
          });
        }
      });
    });
  }

  private truncateOutput(text: string, maxBytes: number): string {
    if (Buffer.byteLength(text, 'utf8') <= maxBytes) {
      return text;
    }

    let result = '';
    for (const char of text) {
      const next = result + char;
      if (Buffer.byteLength(next, 'utf8') > maxBytes) {
        break;
      }
      result = next;
    }

    return `${result}\n…（输出已截断）`;
  }

  private resolveTimeoutMs(): number {
    const raw = this.configService.get<string>(
      'SKILL_SCRIPT_TIMEOUT_MS',
      String(SKILL_LIMITS.script.timeoutMs),
    );
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : SKILL_LIMITS.script.timeoutMs;
  }

  private resolveMaxOutputBytes(): number {
    const raw = this.configService.get<string>(
      'SKILL_SCRIPT_MAX_STDOUT_BYTES',
      String(SKILL_LIMITS.script.maxOutputBytes),
    );
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed)
      ? parsed
      : SKILL_LIMITS.script.maxOutputBytes;
  }

  private resolveMaxConcurrent(): number {
    const raw = this.configService.get<string>(
      'SKILL_SCRIPT_MAX_CONCURRENT',
      String(SKILL_LIMITS.script.maxConcurrentRuns),
    );
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed)
      ? parsed
      : SKILL_LIMITS.script.maxConcurrentRuns;
  }
}
