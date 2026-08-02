import { Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import { TrialChatDto } from './dto/trial-chat.dto';
import { ValidateSkillDto } from './dto/validate-skill.dto';
import { SkillsService } from './skills.service';

/**
 * Skill Playground 无状态接口
 * - 不保存 Skill 内容
 * - 请求体携带 files 快照
 */
@Public()
@Controller('skills')
export class SkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  /** POST /skills/validate — 规范校验 */
  @Post('validate')
  validate(@Body() dto: ValidateSkillDto) {
    return this.skillsService.validate(dto.files);
  }

  /** POST /skills/trial/chat — AI 试用（SSE） */
  @SkipTransform()
  @Post('trial/chat')
  async trialChat(
    @Body() dto: TrialChatDto,
    @Res() res: Response,
  ): Promise<void> {
    try {
      await this.skillsService.trialChat(dto.files, dto.messages, res);
    } catch (error) {
      if (!res.headersSent) {
        throw error;
      }
    }
  }
}
