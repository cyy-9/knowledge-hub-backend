import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** Guard 写入 request.user 后的当前用户摘要 */
export interface AuthUser {
  id: string;
  ver: number;
}

/** 取当前登录用户，需配合 JwtAuthGuard */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    return req.user;
  },
);
