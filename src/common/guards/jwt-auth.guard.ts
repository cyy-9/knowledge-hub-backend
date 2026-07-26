import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthUser } from '../decorators/current-user.decorator';

/** Access JWT 载荷（Guard 只验 access，暂不比对 tokenVersion） */
interface AccessPayload {
  sub: string;
  ver: number;
  type: string;
}

/**
 * 全局登录守卫：默认要求 Access Token。
 * 标了 @Public() 的接口直接放行。
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly accessSecret: string;

  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    config: ConfigService,
  ) {
    this.accessSecret = config.get<string>(
      'JWT_ACCESS_SECRET',
      'dev-access-secret',
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 公开接口跳过
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const token = this.extractBearer(req);
    if (!token) {
      throw new UnauthorizedException('未登录或 Token 缺失');
    }

    let payload: AccessPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessPayload>(token, {
        secret: this.accessSecret,
      });
    } catch {
      throw new UnauthorizedException('Access Token 无效或已过期');
    }

    if (payload.type !== 'access' || !payload.sub) {
      throw new UnauthorizedException('Access Token 无效或已过期');
    }

    // 暂不比对 tokenVersion；后续需要强制下线时再加
    req.user = { id: payload.sub, ver: payload.ver };
    return true;
  }

  private extractBearer(req: Request): string | null {
    const header = req.headers.authorization;
    if (!header) return null;
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) return null;
    return token;
  }
}
