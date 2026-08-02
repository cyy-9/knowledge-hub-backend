import { Module } from '@nestjs/common';
import { SkillFilesService } from './skill-files.service';
import { SkillPromptBuilder } from './skill-prompt.builder';
import { SkillScriptRunnerService } from './skill-script-runner.service';
import { SkillScriptValidatorService } from './skill-script-validator.service';
import { SkillTrialService } from './skill-trial.service';
import { SkillValidateService } from './skill-validate.service';
import { SkillWorkspaceService } from './skill-workspace.service';
import { SkillsController } from './skills.controller';
import { SkillsService } from './skills.service';

@Module({
  controllers: [SkillsController],
  providers: [
    SkillsService,
    SkillFilesService,
    SkillValidateService,
    SkillPromptBuilder,
    SkillTrialService,
    // Phase 1 + 2：脚本临时工作区、校验与 Docker 执行
    SkillWorkspaceService,
    SkillScriptValidatorService,
    SkillScriptRunnerService,
  ],
})
export class SkillsModule {}
