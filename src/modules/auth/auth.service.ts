import { HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { BizCode } from '../../common/constants/biz-code.enum';
import { BusinessException } from '../../common/exceptions/business.exception';
import { nextSnowflakeId } from '../../common/snowflake-id';
import { RedisService } from '../redis/redis.service';
import { UserService } from '../user/user.service';
import { UserEntity, UserStatus } from '../user/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

/** Access / Refresh JWT 载荷 */
interface TokenPayload {
  sub: string;
  ver: number;
  type: 'access' | 'refresh';
  jti?: string;
}

/** Redis 中的 Refresh 会话 */
interface RefreshSession {
  userId: string;
  ver: number;
}

/**
 * 双 Token 鉴权：
 * - Access：短时 JWT，不落库
 * - Refresh：长时 JWT（含 jti），会话存 Redis，用一次即旋转
 */
@Injectable()
export class AuthService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessExpires: JwtSignOptions['expiresIn'];
  private readonly refreshExpires: JwtSignOptions['expiresIn'];
  private readonly refreshTtlSec: number;

  constructor(
    private readonly users: UserService,
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    this.accessSecret = config.get<string>('JWT_ACCESS_SECRET', 'dev-access-secret');
    this.refreshSecret = config.get<string>(
      'JWT_REFRESH_SECRET',
      'dev-refresh-secret',
    );
    this.accessExpires = config.get<string>(
      'JWT_ACCESS_EXPIRES',
      '2h',
    ) as JwtSignOptions['expiresIn'];
    this.refreshExpires = config.get<string>(
      'JWT_REFRESH_EXPIRES',
      '7d',
    ) as JwtSignOptions['expiresIn'];
    this.refreshTtlSec = parseInt(
      config.get<string>('JWT_REFRESH_TTL_SECONDS', '604800'),
      10,
    );
  }

  /**
   * 注册（方案 A）：只创建账号，不签发 Token。
   * 前端注册成功后再调 /auth/login。
   */
  async register(dto: RegisterDto) {
    const existed = await this.users.findByUsername(dto.username);
    if (existed) {
      throw new BusinessException(
        BizCode.VALIDATION_ERROR,
        '用户名已存在',
        HttpStatus.BAD_REQUEST,
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.users.create({
      username: dto.username,
      passwordHash,
      nickname: dto.nickname,
    });

    // 不返回 passwordHash
    return {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
    };
  }

  /** 登录：验密 → 写 Redis 会话 → 返回双 Token */
  async login(dto: LoginDto, ip?: string) {
    const user = await this.users.findByUsername(dto.username);
    if (!user || user.status !== UserStatus.Active) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    const matched = await bcrypt.compare(dto.password, user.passwordHash);
    if (!matched) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    await this.users.touchLogin(user.id, ip);
    return this.issueTokens(user);
  }

  /** 刷新：校验 Refresh + Redis → 删除旧会话 → 签发新对（旋转） */
  async refresh(refreshToken: string) {
    const payload = await this.verifyRefresh(refreshToken);
    const key = this.refreshKey(payload.jti!);
    const session = await this.redis.get<RefreshSession>(key);

    // Redis 无记录 = 已过期 / 已登出 / 已被旋转
    if (!session || session.userId !== payload.sub) {
      throw new UnauthorizedException('Refresh Token 无效或已过期');
    }

    // 先删旧会话，再发新 Token（旋转）
    await this.redis.del(key);

    const user = await this.users.findActiveById(payload.sub);
    if (!user || user.tokenVersion !== payload.ver) {
      throw new UnauthorizedException('Refresh Token 无效或已过期');
    }

    return this.issueTokens(user);
  }

  /** 登出：删除 Redis 中该 Refresh 会话（幂等） */
  async logout(refreshToken: string) {
    try {
      const payload = await this.verifyRefresh(refreshToken);
      if (payload.jti) {
        await this.redis.del(this.refreshKey(payload.jti));
      }
    } catch {
      // Token 已失效也视为登出成功
    }
    return { ok: true };
  }

  /** 签发 Access + Refresh，并把 Refresh 会话写入 Redis */
  private async issueTokens(user: UserEntity) {
    const jti = nextSnowflakeId();
    const base = { sub: user.id, ver: user.tokenVersion };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { ...base, type: 'access' } satisfies TokenPayload,
        { secret: this.accessSecret, expiresIn: this.accessExpires },
      ),
      this.jwt.signAsync(
        { ...base, type: 'refresh', jti } satisfies TokenPayload,
        { secret: this.refreshSecret, expiresIn: this.refreshExpires },
      ),
    ]);

    await this.redis.set(
      this.refreshKey(jti),
      { userId: user.id, ver: user.tokenVersion } satisfies RefreshSession,
      this.refreshTtlSec,
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: this.accessExpires,
      tokenType: 'Bearer',
    };
  }

  /** 校验 Refresh JWT，并确保 type / jti 合法 */
  private async verifyRefresh(token: string): Promise<TokenPayload> {
    let payload: TokenPayload;
    try {
      payload = await this.jwt.verifyAsync<TokenPayload>(token, {
        secret: this.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Refresh Token 无效或已过期');
    }

    if (payload.type !== 'refresh' || !payload.jti || !payload.sub) {
      throw new UnauthorizedException('Refresh Token 无效或已过期');
    }
    return payload;
  }

  private refreshKey(jti: string) {
    return `auth:refresh:${jti}`;
  }
}
