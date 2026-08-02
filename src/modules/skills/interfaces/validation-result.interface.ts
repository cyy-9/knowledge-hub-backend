export interface SkillValidationMeta {
  name: string | null;
  description: string | null;
  lineCount: number;
  fileCount: number;
}

export interface SkillValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  meta: SkillValidationMeta | null;
}
