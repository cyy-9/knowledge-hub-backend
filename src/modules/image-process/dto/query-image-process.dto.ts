import { IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

/** 压缩任务列表查询 */
export class QueryImageProcessDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 20;
}
