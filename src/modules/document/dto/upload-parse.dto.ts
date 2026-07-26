import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

/** 上传解析接口的可选表单字段 */
export class UploadParseDto {
  /** 分类 ID */
  @IsOptional()
  @IsString()
  categoryId?: string;

  /** 团队 ID */
  @IsOptional()
  @IsString()
  teamId?: string;

  /** 作者 ID */
  @IsOptional()
  @IsString()
  authorId?: string;

  /** 标签（逗号分隔） */
  @IsOptional()
  @IsString()
  tags?: string;

  /** 备注 */
  @IsOptional()
  @IsString()
  remark?: string;

  /** 创建人 ID */
  @IsOptional()
  @IsString()
  createBy?: string;

  /** 是否公开（form-data 常为字符串，需转成 boolean） */
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true' || value === '1') return true;
    if (value === false || value === 'false' || value === '0') return false;
    return value;
  })
  @IsBoolean()
  isPublic?: boolean;
}
