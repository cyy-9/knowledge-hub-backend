import { Injectable } from '@nestjs/common';
import { load as parseYaml } from 'js-yaml';
import type { SkillValidationResult } from './interfaces/validation-result.interface';

const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ALLOWED_FRONTMATTER_KEYS = new Set([
  'name',
  'description',
  'license',
  'compatibility',
  'metadata',
  'allowed-tools',
  'disable-model-invocation',
]);

@Injectable()
export class SkillValidateService {
  validate(files: Record<string, string>): SkillValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const skillPath = Object.keys(files).find(
      (path) => path === 'SKILL.md' || path.endsWith('/SKILL.md'),
    );

    if (!skillPath) {
      return {
        isValid: false,
        errors: ['缺少必需的 SKILL.md 文件'],
        warnings: [],
        meta: null,
      };
    }

    const content = files[skillPath];
    const { frontmatter, body, parseError } = this.splitFrontmatter(content);

    if (parseError) {
      return {
        isValid: false,
        errors: [parseError],
        warnings: [],
        meta: null,
      };
    }

    for (const key of Object.keys(frontmatter ?? {})) {
      if (!ALLOWED_FRONTMATTER_KEYS.has(key)) {
        warnings.push(`未知 frontmatter 字段：${key}`);
      }
    }

    const directoryName = this.getDirectoryName(files);
    errors.push(...this.validateName(frontmatter?.name, directoryName, warnings));
    errors.push(...this.validateDescription(frontmatter?.description, warnings));
    errors.push(...this.validateCompatibility(frontmatter?.compatibility));
    errors.push(...this.validateMetadata(frontmatter?.metadata, warnings));
    warnings.push(...this.validateFileReferences(body, files));

    const lineCount = content.split('\n').length;
    if (lineCount > 500) {
      warnings.push(`SKILL.md 共 ${lineCount} 行，建议控制在 500 行以内`);
    }

    if (!body.trim()) {
      warnings.push('SKILL.md 正文为空，建议补充操作指令');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      meta: {
        name: typeof frontmatter?.name === 'string' ? frontmatter.name : null,
        description:
          typeof frontmatter?.description === 'string'
            ? frontmatter.description
            : null,
        lineCount,
        fileCount: Object.keys(files).length,
      },
    };
  }

  private splitFrontmatter(content: string) {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match) {
      return {
        frontmatter: null,
        body: content,
        parseError: '缺少 YAML frontmatter（需以 --- 包裹）',
      };
    }

    try {
      const parsed = parseYaml(match[1]) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {
          frontmatter: null,
          body: match[2],
          parseError: 'frontmatter 必须是 YAML 对象',
        };
      }
      return {
        frontmatter: parsed as Record<string, unknown>,
        body: match[2],
        parseError: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      return {
        frontmatter: null,
        body: match[2],
        parseError: `YAML 解析失败：${message}`,
      };
    }
  }

  private validateName(
    name: unknown,
    directoryName: string | null,
    warnings: string[],
  ): string[] {
    const errors: string[] = [];

    if (typeof name !== 'string' || !name.trim()) {
      errors.push('name 为必填字段');
      return errors;
    }

    if (name.length > 64) {
      errors.push(`name 超过 64 字符（当前 ${name.length}）`);
    }

    if (!NAME_PATTERN.test(name)) {
      errors.push(
        'name 只能包含小写字母、数字和连字符，且不能以连字符开头或结尾',
      );
    }

    if (name.includes('--')) {
      errors.push('name 不能包含连续连字符 (--)');
    }

    if (directoryName && name !== directoryName) {
      warnings.push(
        `name "${name}" 与目录名 "${directoryName}" 不一致（规范建议保持一致）`,
      );
    }

    return errors;
  }

  private validateDescription(description: unknown, warnings: string[]): string[] {
    const errors: string[] = [];

    if (typeof description !== 'string' || !description.trim()) {
      errors.push('description 为必填字段且不能为空');
      return errors;
    }

    if (description.length > 1024) {
      errors.push(`description 超过 1024 字符（当前 ${description.length}）`);
    }

    if (description.length < 30) {
      warnings.push('description 较短，建议补充触发场景关键词');
    }

    return errors;
  }

  private validateCompatibility(compatibility: unknown): string[] {
    if (compatibility == null) {
      return [];
    }

    if (typeof compatibility !== 'string') {
      return ['compatibility 必须是字符串'];
    }

    if (compatibility.length > 500) {
      return [`compatibility 超过 500 字符（当前 ${compatibility.length}）`];
    }

    return [];
  }

  private validateMetadata(metadata: unknown, warnings: string[]): string[] {
    if (metadata == null) {
      return [];
    }

    if (typeof metadata !== 'object' || Array.isArray(metadata)) {
      return ['metadata 必须是键值对对象'];
    }

    for (const [key, value] of Object.entries(metadata as Record<string, unknown>)) {
      if (typeof value !== 'string') {
        warnings.push(`metadata.${key} 建议使用字符串值`);
      }
    }

    return [];
  }

  private validateFileReferences(body: string, files: Record<string, string>) {
    const warnings: string[] = [];
    const refs = [...this.extractMarkdownLinks(body), ...this.extractPlainPaths(body)];
    const fileKeys = new Set(Object.keys(files));

    for (const ref of refs) {
      if (ref.startsWith('http://') || ref.startsWith('https://') || ref.startsWith('#')) {
        continue;
      }

      const normalized = ref.replace(/^\.\//, '');
      if (!fileKeys.has(normalized)) {
        warnings.push(`引用的文件不存在：${normalized}`);
      }
    }

    return warnings;
  }

  private extractMarkdownLinks(body: string) {
    const links: string[] = [];
    const pattern = /\[([^\]]*)\]\(([^)]+)\)/g;
    let match = pattern.exec(body);
    while (match) {
      links.push(match[2].trim());
      match = pattern.exec(body);
    }
    return links;
  }

  private extractPlainPaths(body: string) {
    const paths: string[] = [];
    for (const line of body.split('\n')) {
      const trimmed = line.trim();
      if (/^(?:scripts|references|assets)\/[\w./-]+/.test(trimmed)) {
        paths.push(trimmed.split(/\s+/)[0]);
      }
    }
    return paths;
  }

  private getDirectoryName(files: Record<string, string>) {
    const paths = Object.keys(files);
    if (paths.length === 0) {
      return null;
    }

    const segments = paths[0].split('/');
    if (segments.length > 1) {
      return segments[0];
    }

    return null;
  }
}
