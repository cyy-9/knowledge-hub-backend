import { IsArray } from 'class-validator';
import type { UIMessage } from 'ai';
import { SkillFilesDto } from './skill-files.dto';

export class TrialChatDto extends SkillFilesDto {
  @IsArray()
  messages!: UIMessage[];
}
