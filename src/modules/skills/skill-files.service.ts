import { Injectable } from '@nestjs/common';
import { BizCode } from '../../common/constants/biz-code.enum';
import { BusinessException } from '../../common/exceptions/business.exception';
import { SKILL_LIMITS } from './constants/skill-limits';

@Injectable()
export class SkillFilesService {
  normalizeFiles(files: Record<string, string>): Record<string, string> {
    if (!files || typeof files !== 'object' || Array.isArray(files)) {
      throw new BusinessException(BizCode.SKILL_PAYLOAD_INVALID, 'files 必须是对象');
    }

    const entries = Object.entries(files);
    if (entries.length === 0) {
      throw new BusinessException(BizCode.SKILL_PAYLOAD_INVALID, 'files 不能为空');
    }

    if (entries.length > SKILL_LIMITS.maxFileCount) {
      throw new BusinessException(
        BizCode.SKILL_PAYLOAD_TOO_LARGE,
        `文件数量超过上限（${SKILL_LIMITS.maxFileCount}）`,
      );
    }

    const normalized: Record<string, string> = {};
    let totalBytes = 0;

    for (const [rawPath, rawContent] of entries) {
      const path = this.normalizePath(rawPath);
      if (typeof rawContent !== 'string') {
        throw new BusinessException(
          BizCode.SKILL_PAYLOAD_INVALID,
          `文件内容必须是字符串：${path}`,
        );
      }

      const bytes = Buffer.byteLength(rawContent, 'utf8');
      if (bytes > SKILL_LIMITS.maxFileBytes) {
        throw new BusinessException(
          BizCode.SKILL_PAYLOAD_TOO_LARGE,
          `单文件过大：${path}`,
        );
      }

      totalBytes += bytes;
      if (totalBytes > SKILL_LIMITS.maxTotalBytes) {
        throw new BusinessException(
          BizCode.SKILL_PAYLOAD_TOO_LARGE,
          `Skill 总大小超过 ${SKILL_LIMITS.maxTotalBytes / 1024 / 1024}MB`,
        );
      }

      this.assertAllowedPath(path);
      normalized[path] = rawContent;
    }

    return normalized;
  }

  assertHasSkillMd(files: Record<string, string>): void {
    const hasSkillMd = Object.keys(files).some(
      (path) => path === 'SKILL.md' || path.endsWith('/SKILL.md'),
    );
    if (!hasSkillMd) {
      throw new BusinessException(
        BizCode.SKILL_MISSING_SKILL_MD,
        '缺少 SKILL.md 文件',
      );
    }
  }

  findSkillMdPath(files: Record<string, string>): string {
    return (
      Object.keys(files).find(
        (path) => path === 'SKILL.md' || path.endsWith('/SKILL.md'),
      ) ?? 'SKILL.md'
    );
  }

  /** 列出 Skill 中 scripts/ 目录下的 .js 脚本路径 */
  listScriptPaths(files: Record<string, string>): string[] {
    return Object.keys(files)
      .filter((path) => this.isScriptPath(path))
      .sort();
  }

  /** 是否有可执行脚本（决定是否注册 run_script tool） */
  hasScripts(files: Record<string, string>): boolean {
    return this.listScriptPaths(files).length > 0;
  }

  /**
   * 校验 AI 请求的脚本路径是否合法。
   * 只允许 files 快照中存在的 scripts/*.js。
   */
  assertScriptPath(files: Record<string, string>, path: string): void {
    const normalized = path.trim().replace(/\\/g, '/').replace(/\/+/g, '/');

    if (!normalized || normalized.includes('..')) {
      throw new BusinessException(
        BizCode.SKILL_PAYLOAD_INVALID,
        `非法脚本路径：${path}`,
      );
    }

    if (!this.isScriptPath(normalized)) {
      throw new BusinessException(
        BizCode.SKILL_PAYLOAD_INVALID,
        `仅允许执行 scripts/ 目录下的 .js 文件：${path}`,
      );
    }

    if (!(normalized in files)) {
      throw new BusinessException(
        BizCode.SKILL_PAYLOAD_INVALID,
        `脚本不存在：${path}`,
      );
    }
  }

  private isScriptPath(path: string): boolean {
    return /\/scripts\/[^/]+\.js$/.test(path) || /^scripts\/[^/]+\.js$/.test(path);
  }

  private normalizePath(path: string): string {
    const trimmed = path.trim().replace(/^\/+/, '').replace(/\\/g, '/');
    if (!trimmed || trimmed.includes('..')) {
      throw new BusinessException(BizCode.SKILL_PAYLOAD_INVALID, `非法路径：${path}`);
    }
    return trimmed.replace(/\/+/g, '/');
  }

  private assertAllowedPath(path: string): void {
    const fileName = path.split('/').pop() ?? path;
    const extension = fileName.includes('.')
      ? `.${fileName.split('.').pop()?.toLowerCase()}`
      : '';

    if (
      fileName !== 'SKILL.md' &&
      extension &&
      !SKILL_LIMITS.allowedExtensions.has(extension)
    ) {
      throw new BusinessException(
        BizCode.SKILL_PAYLOAD_INVALID,
        `不支持的文件类型：${path}`,
      );
    }
  }
}
