import { createOpenAI } from '@ai-sdk/openai';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  convertToModelMessages,
  isStepCount,
  streamText,
  type UIMessage,
} from 'ai';
import type { Response } from 'express';
import { BizCode } from '../../common/constants/biz-code.enum';
import { BusinessException } from '../../common/exceptions/business.exception';
import { SKILL_LIMITS } from './constants/skill-limits';
import { createDashScopeFetch } from './dashscope-fetch';
import { SkillFilesService } from './skill-files.service';
import { SkillPromptBuilder } from './skill-prompt.builder';
import { SkillScriptRunnerService } from './skill-script-runner.service';
import { SkillScriptValidatorService } from './skill-script-validator.service';
import { SkillWorkspaceService } from './skill-workspace.service';
import { createRunScriptTool } from './tools/run-script.tool';
import { pickLatestTrialMessage } from './trial-chat-messages';

/**
 * Skill AI 试用服务
 *
 * Phase 2：当 Skill 含 scripts/*.js 时，注册 run_script tool，
 * 通过 agent loop（isStepCount）让 AI 按需执行脚本后继续生成回复。
 */
@Injectable()
export class SkillTrialService implements OnModuleInit {
  private readonly logger = new Logger(SkillTrialService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly skillPromptBuilder: SkillPromptBuilder,
    private readonly skillFilesService: SkillFilesService,
    private readonly workspaceService: SkillWorkspaceService,
    private readonly scriptValidator: SkillScriptValidatorService,
    private readonly scriptRunner: SkillScriptRunnerService,
  ) {}

  onModuleInit(): void {
    void this.workspaceService.cleanupStaleWorkspaces();
  }

  async streamTrialChat(
    files: Record<string, string>,
    messages: UIMessage[],
    res: Response,
  ): Promise<void> {
    if (!messages.length) {
      throw new BusinessException(BizCode.VALIDATION_ERROR, 'messages 不能为空');
    }

    const apiKey = this.configService.get<string>('OPENAI_API_KEY', '');
    if (!apiKey) {
      throw new BusinessException(
        BizCode.INTERNAL_ERROR,
        'OPENAI_API_KEY 未配置',
      );
    }

    // Phase 1：为本次试用创建临时工作区，供 Docker 只读挂载
    const workspace = await this.workspaceService.create(files);

    try {
      const enableThinking =
        this.configService.get<string>('SKILL_TRIAL_ENABLE_THINKING', 'false') ===
        'true';
      const thinkingBudgetRaw = this.configService.get<string>(
        'SKILL_TRIAL_THINKING_BUDGET',
      );
      const thinkingBudget = thinkingBudgetRaw
        ? Number.parseInt(thinkingBudgetRaw, 10)
        : undefined;

      const openai = createOpenAI({
        apiKey,
        baseURL: this.configService.get<string>(
          'OPENAI_BASE_URL',
          'https://api.openai.com/v1',
        ),
        fetch: createDashScopeFetch({
          enableThinking,
          thinkingBudget: Number.isFinite(thinkingBudget)
            ? thinkingBudget
            : undefined,
        }),
      });

      const modelId = this.configService.get<string>(
        'OPENAI_MODEL',
        'gpt-4o-mini',
      );
      const temperature = this.resolveTrialTemperature();
      const maxSteps = this.resolveMaxTrialSteps();
      const { system, preambleMessages } =
        this.skillPromptBuilder.buildTrialPrompt(files);
      const trialMessages = pickLatestTrialMessage(messages);

      // Phase 2：有 scripts/*.js 且脚本执行启用时，注入 run_script tool
      const hasScripts = this.skillFilesService.hasScripts(files);
      const scriptEnabled = this.scriptRunner.isEnabled();
      const tools =
        hasScripts && scriptEnabled
          ? {
              run_script: createRunScriptTool({
                workspace,
                skillFilesService: this.skillFilesService,
                scriptValidator: this.scriptValidator,
                scriptRunner: this.scriptRunner,
              }),
            }
          : undefined;

      if (hasScripts && !scriptEnabled) {
        this.logger.warn('Skill 含脚本但 SKILL_SCRIPT_ENABLED=false，跳过 tool 注册');
      }

      const result = streamText({
        model: openai(modelId),
        system,
        messages: [
          ...preambleMessages,
          ...(await convertToModelMessages(trialMessages)),
        ],
        tools,
        // 允许多轮：AI 判断 → 可选 run_script → 继续生成
        stopWhen: isStepCount(maxSteps),
        temperature,
        reasoning: enableThinking ? 'provider-default' : 'none',
      });

      await result.pipeUIMessageStreamToResponse(res, {
        sendReasoning: enableThinking,
      });
    } finally {
      await this.workspaceService.cleanup(workspace);
    }
  }

  private resolveTrialTemperature(): number {
    const raw = this.configService.get<string>('SKILL_TRIAL_TEMPERATURE', '0.7');
    const parsed = Number.parseFloat(raw);

    if (!Number.isFinite(parsed)) {
      return 0.7;
    }

    return Math.min(2, Math.max(0, parsed));
  }

  private resolveMaxTrialSteps(): number {
    const raw = this.configService.get<string>(
      'SKILL_TRIAL_MAX_STEPS',
      String(SKILL_LIMITS.script.maxTrialSteps),
    );
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed)
      ? parsed
      : SKILL_LIMITS.script.maxTrialSteps;
  }
}
