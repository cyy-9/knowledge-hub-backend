import { IsOptional, IsString, MinLength } from 'class-validator';

/** 注册（方案 A：只建账号，不签发 Token） */
export class RegisterDto {
  @IsString()
  @MinLength(3)
  username: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  nickname?: string;
}
