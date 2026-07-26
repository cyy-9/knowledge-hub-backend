import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** 跳过全局 JwtAuthGuard，用于登录/注册等公开接口 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
