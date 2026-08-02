import { IsObject } from 'class-validator';

/** Skill 文件快照：path → content，不落库 */
export class SkillFilesDto {
  @IsObject()
  files!: Record<string, string>;
}
