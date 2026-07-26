import { IsString } from 'class-validator';

/** 刷新 / 登出共用：只需 refreshToken */
export class RefreshTokenDto {
  @IsString()
  refreshToken: string;
}
