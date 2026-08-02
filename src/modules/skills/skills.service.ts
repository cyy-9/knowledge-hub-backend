import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import type { UIMessage } from 'ai';
import type { SkillValidationResult } from './interfaces/validation-result.interface';
import { SkillFilesService } from './skill-files.service';
import { SkillTrialService } from './skill-trial.service';
import { SkillValidateService } from './skill-validate.service';

@Injectable()
export class SkillsService {
  constructor(
    private readonly skillFilesService: SkillFilesService,
    private readonly skillValidateService: SkillValidateService,
    private readonly skillTrialService: SkillTrialService,
  ) {}

  validate(files: Record<string, string>): SkillValidationResult {
    const normalized = this.skillFilesService.normalizeFiles(files);
    return this.skillValidateService.validate(normalized);
  }

  async trialChat(
    files: Record<string, string>,
    messages: UIMessage[],
    res: Response,
  ): Promise<void> {
    const normalized = this.skillFilesService.normalizeFiles(files);
    this.skillFilesService.assertHasSkillMd(normalized);
    await this.skillTrialService.streamTrialChat(normalized, messages, res);
  }
}
