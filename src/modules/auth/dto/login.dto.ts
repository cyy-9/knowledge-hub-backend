import { IsString, MinLength } from 'class-validator';

/** 登录 */
export class LoginDto {
  @IsString()
  username: string;

  @IsString()
  @MinLength(6)
  password: string;
}
