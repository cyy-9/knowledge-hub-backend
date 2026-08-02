import { tool } from 'ai';
import { accessSync, constants } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import type { SkillFilesService } from '../skill-files.service';
import type { SkillScriptRunnerService } from '../skill-script-runner.service';
import type { SkillScriptValidatorService } from '../skill-script-validator.service';
import type { SkillWorkspace } from '../interfaces/skill-workspace.interface';

/**
 * run_script Tool 工厂
 *
 * AI 在启用 Skill 且用户问题需要脚本时调用；
 * 仅支持 scripts/*.js（JavaScript），路径/静态/参数校验通过后才本地 node 执行。
 */
export function createRunScriptTool(deps: {
  workspace: SkillWorkspace;
  skillFilesService: SkillFilesService;
  scriptValidator: SkillScriptValidatorService;
  scriptRunner: SkillScriptRunnerService;
}) {
  const availableScripts = deps.skillFilesService.listScriptPaths(
    deps.workspace.files,
  );

  return tool({
    description: [
      '在受控 Node 子进程中执行 Skill 的 JavaScript（.js）脚本。',
      '仅支持 scripts/ 目录下的 .js 文件；.py / .sh 等不可执行。',
      '仅当 Skill 已启用、且 SKILL.md 文档说明当前任务需要该脚本时才调用。',
      '脚本的具体用法（何时使用、参数含义、输出格式）见 skill_reference 正文，勿臆造路径或参数。',
      availableScripts.length
        ? `可执行 JS 脚本：${availableScripts.join('、')}`
        : '当前 Skill 无可用 JS 脚本。',
    ].join('\n'),
    inputSchema: z.object({
      path: z
        .string()
        .describe('JS 脚本相对路径，如 my-skill/scripts/format-json.js'),
      args: z
        .array(z.string())
        .optional()
        .describe('传给脚本的 CLI 参数列表'),
    }),
    execute: async ({ path, args }) => {
      if (!deps.scriptRunner.isEnabled()) {
        return {
          ok: false,
          error: '脚本执行功能未启用',
        };
      }

      try {
        deps.skillFilesService.assertScriptPath(deps.workspace.files, path);
        assertScriptFileOnDisk(deps.workspace, path);

        const content = deps.workspace.files[path];
        const scriptValidation = deps.scriptValidator.validate(content, path);
        if (!scriptValidation.safe) {
          return {
            ok: false,
            error: '脚本未通过安全校验',
            issues: scriptValidation.issues,
          };
        }

        const argsValidation = deps.scriptValidator.validateArgs(args, path);
        if (!argsValidation.safe) {
          return {
            ok: false,
            error: '脚本参数未通过校验',
            issues: argsValidation.issues,
          };
        }

        const result = await deps.scriptRunner.run(
          deps.workspace,
          path,
          args ?? [],
        );

        return {
          ok: result.exitCode === 0,
          ...result,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          error: message,
          path,
        };
      }
    },
  });
}

/** 确认 workspace 写盘后脚本文件存在且可读 */
function assertScriptFileOnDisk(workspace: SkillWorkspace, scriptPath: string): void {
  const absoluteScript = resolve(workspace.rootPath, scriptPath);
  const workspaceRoot = resolve(workspace.rootPath);

  if (
    absoluteScript !== workspaceRoot &&
    !absoluteScript.startsWith(`${workspaceRoot}/`)
  ) {
    throw new Error(`脚本路径越界：${scriptPath}`);
  }

  if (!absoluteScript.endsWith('.js')) {
    throw new Error(`仅支持执行 JavaScript（.js）脚本：${scriptPath}`);
  }

  accessSync(absoluteScript, constants.R_OK);
}
