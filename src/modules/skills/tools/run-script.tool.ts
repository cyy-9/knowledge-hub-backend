import { tool } from 'ai';
import { z } from 'zod';
import type { SkillFilesService } from '../skill-files.service';
import type { SkillScriptRunnerService } from '../skill-script-runner.service';
import type { SkillScriptValidatorService } from '../skill-script-validator.service';
import type { SkillWorkspace } from '../interfaces/skill-workspace.interface';

/**
 * run_script Tool 工厂（Phase 2）
 *
 * AI 在启用 Skill 且用户问题需要脚本时调用；
 * 脚本路径、参数含义由 SKILL.md 文档说明，此处只做路径白名单 + 安全校验 + 执行。
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
      '在隔离 Docker 容器中执行 Skill 的 JavaScript 脚本。',
      '仅当 Skill 已启用、且 SKILL.md 文档说明当前任务需要该脚本时才调用。',
      '脚本的具体用法（何时使用、参数含义、输出格式）见 skill_reference 正文，勿臆造路径或参数。',
      availableScripts.length
        ? `可用脚本：${availableScripts.join('、')}`
        : '当前 Skill 无可用脚本。',
    ].join('\n'),
    inputSchema: z.object({
      path: z
        .string()
        .describe('脚本相对路径，如 my-skill/scripts/format-json.js'),
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

        const content = deps.workspace.files[path];
        const validation = deps.scriptValidator.validate(content, path);
        if (!validation.safe) {
          return {
            ok: false,
            error: '脚本未通过安全校验',
            issues: validation.issues,
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
