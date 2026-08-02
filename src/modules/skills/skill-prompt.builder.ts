import { Injectable } from '@nestjs/common';
import { load as parseYaml } from 'js-yaml';
import type { ModelMessage } from 'ai';
import { SkillFilesService } from './skill-files.service';

export interface SkillTrialPrompt {
  /** 常驻：meta + 路由规则，不含 Skill 正文 */
  system: string;
  /** 按需参考：Skill 正文，通过对话前缀与 system 路由规则隔离 */
  preambleMessages: ModelMessage[];
}

@Injectable()
export class SkillPromptBuilder {
  constructor(private readonly skillFilesService: SkillFilesService) {}

  buildTrialPrompt(files: Record<string, string>): SkillTrialPrompt {
    const skillMdPath = this.skillFilesService.findSkillMdPath(files);
    const skillMd = files[skillMdPath] ?? '';
    const { name, description, body } = this.parseSkillMd(skillMd);
    const skillName = name ?? 'unknown';
    const skillDescription =
      description?.trim() || '（未提供 description，请谨慎判断是否启用）';

    const scriptPaths = this.skillFilesService.listScriptPaths(files);
    const referenceIndex = Object.keys(files)
      .filter((path) => path !== skillMdPath && !path.endsWith('/.gitkeep'))
      .map((path) => {
        const tag = scriptPaths.includes(path) ? ' [可执行脚本]' : '';
        return `- ${path}${tag}`;
      })
      .join('\n');

    const referenceHint = referenceIndex
      ? `\n\n<available_files>\n${referenceIndex}\n</available_files>`
      : '';

    // Phase 2：有脚本时提示 AI 通过 run_script tool 执行，用法见 SKILL.md 正文
    const scriptToolHint = scriptPaths.length
      ? `\n\n<script_execution>
本 Skill 含 JavaScript 脚本（${scriptPaths.join('、')}）。
- 何时调用哪个脚本、传什么参数、如何解读输出：见下方 SKILL.md 正文说明，勿臆造。
- 启用 Skill 且任务确实需要脚本时，使用 run_script tool 执行；不需要脚本时勿调用。
- 脚本在隔离 Docker 容器中运行，无网络、无文件系统写入。
</script_execution>`
      : '';

    const system = `你是 Skill Playground 试用助手。用户正在测试一个**可选** Agent Skill，不是每个问题都必须使用它。

<skill_meta name="${skillName}">
<description>
${skillDescription}
</description>
</skill_meta>

## 路由规则（必须遵守）

1. 先根据 description 判断用户**最新一条消息**是否落在 Skill 的触发范围内。
2. **不匹配**：作为普通助手直接回答。
   - 禁止套用 Skill 的输出格式、流程或专有结构。
   - 可简短说明该 Skill 的适用范围，并给出 1 个可触发 Skill 的示例提问。
3. **匹配**：启用 Skill，严格遵循后续 skill_reference 中的指令。
4. **不确定**：先说明 Skill 适用场景，询问用户是否希望按 Skill 处理；在用户确认前不要套用 Skill 格式。
5. 使用与用户相同的语言。

## 多样性规则（启用 Skill 时）

- 保持 Skill 规定的格式、步骤和约束不变。
- 具体措辞、建议、举例等内容应随情境变化，**禁止**逐字复制 skill_reference 中的示例原文。
- 相同或相近的用户输入，也应尽量给出不同表述。`.trim();

    const skillReference = `<skill_reference name="${skillName}">
${body.trim()}${referenceHint}${scriptToolHint}
</skill_reference>

说明：以上 skill_reference 是按需加载的指令文档。默认不启用；仅当用户问题与 skill_meta 中的 description 匹配时才遵循。`;

    const preambleMessages: ModelMessage[] = [
      {
        role: 'user',
        content: skillReference,
      },
      {
        role: 'assistant',
        content:
          scriptPaths.length > 0
            ? '明白。我会先根据 skill_meta 的 description 判断是否启用 Skill；仅在匹配时遵循 skill_reference 的格式与流程。若任务需要且文档有说明，我会通过 run_script 执行脚本后再继续回答；不需要脚本时不会调用。'
            : '明白。我会先根据 skill_meta 的 description 判断是否启用 Skill；仅在匹配时遵循 skill_reference 的格式与流程，不匹配时作为普通助手回答。启用 Skill 时会保持结构一致，但具体措辞会随情境变化，不会照抄示例原文。',
      },
    ];

    return { system, preambleMessages };
  }

  private parseSkillMd(content: string) {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match) {
      return { name: null, description: null, body: content };
    }

    try {
      const parsed = parseYaml(match[1]) as Record<string, unknown>;
      return {
        name: typeof parsed.name === 'string' ? parsed.name : null,
        description:
          typeof parsed.description === 'string' ? parsed.description : null,
        body: match[2],
      };
    } catch {
      return { name: null, description: null, body: match[2] };
    }
  }
}
