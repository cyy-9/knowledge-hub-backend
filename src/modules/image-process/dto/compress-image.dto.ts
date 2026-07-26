import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

/** 压缩输出格式 */
export enum CompressFormat {
  Jpeg = 'jpeg',
  Webp = 'webp',
  Png = 'png',
  Gif = 'gif',
}

/**
 * 图片压缩参数（form-data 中与 file 一起提交）
 * 均为可选；不传则使用服务端默认值
 */
export class CompressImageDto {
  /** 压缩质量 1–100，默认 80 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  quality?: number;

  /** 最大宽度（等比缩放），不传则不限制 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxWidth?: number;

  /** 最大高度（等比缩放），不传则不限制 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxHeight?: number;

  /** 输出格式，默认 webp */
  @IsOptional()
  @IsEnum(CompressFormat)
  format?: CompressFormat;
}
