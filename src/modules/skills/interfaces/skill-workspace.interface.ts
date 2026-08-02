/** 单次试用请求在磁盘上的临时 Skill 工作区 */
export interface SkillWorkspace {
  id: string;
  rootPath: string;
  files: Record<string, string>;
}
