import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { SkillWorkspace } from './interfaces/skill-workspace.interface';

/**
 * Skill 临时工作区（Phase 1）
 *
 * 每次试用请求将 files 快照写入独立临时目录，供 Docker 挂载只读执行。
 * 请求结束后在 finally 中清理，避免 Skill 内容落库。
 */
@Injectable()
export class SkillWorkspaceService implements OnModuleInit {
  private readonly logger = new Logger(SkillWorkspaceService.name);
  private baseDir = resolve(process.cwd(), 'tmp', 'skill-trial');

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const configured = this.configService.get<string>('SKILL_SCRIPT_WORKSPACE_DIR');
    if (configured?.trim()) {
      // Docker -v 挂载要求宿主机路径为绝对路径，相对路径需 resolve
      this.baseDir = resolve(configured.trim());
    }
  }

  /** 将 normalize 后的 files 还原为目录树 */
  async create(files: Record<string, string>): Promise<SkillWorkspace> {
    const id = randomUUID();
    const rootPath = resolve(this.baseDir, id);

    await mkdir(rootPath, { recursive: true });

    for (const [relativePath, content] of Object.entries(files)) {
      const absolutePath = join(rootPath, relativePath);
      await mkdir(join(absolutePath, '..'), { recursive: true });
      await writeFile(absolutePath, content, 'utf8');
    }

    return { id, rootPath, files };
  }

  /** 清理临时目录；失败仅打日志，不阻塞响应 */
  async cleanup(workspace: SkillWorkspace): Promise<void> {
    try {
      await rm(workspace.rootPath, { recursive: true, force: true });
    } catch (error) {
      this.logger.warn(
        `清理 Skill 临时目录失败：${workspace.rootPath}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** 启动时清理超过 TTL 的孤儿目录（容器异常退出等） */
  async cleanupStaleWorkspaces(): Promise<void> {
    const ttlHours = Number.parseInt(
      this.configService.get<string>('SKILL_SCRIPT_WORKSPACE_TTL_HOURS', '24'),
      10,
    );
    const ttlMs = (Number.isFinite(ttlHours) ? ttlHours : 24) * 60 * 60 * 1000;
    const cutoff = Date.now() - ttlMs;

    try {
      const { readdir, stat } = await import('node:fs/promises');
      await mkdir(this.baseDir, { recursive: true });
      const entries = await readdir(this.baseDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const entryPath = resolve(this.baseDir, entry.name);
        const entryStat = await stat(entryPath);
        if (entryStat.mtimeMs < cutoff) {
          await rm(entryPath, { recursive: true, force: true });
          this.logger.log(`已清理过期 Skill 工作区：${entry.name}`);
        }
      }
    } catch (error) {
      this.logger.warn(
        '扫描过期 Skill 工作区失败',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
