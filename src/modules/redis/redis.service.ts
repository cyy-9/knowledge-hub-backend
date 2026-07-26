import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type RedisClientType } from 'redis';

/** Redis 客户端封装：连接管理 + 常用 KV 操作 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: RedisClientType | null = null;
  private keyPrefix = 'knowledge-hub:';

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const host = this.config.get<string>('REDIS_HOST', 'localhost');
    const port = parseInt(this.config.get<string>('REDIS_PORT', '6379'), 10);
    const password = this.config.get<string>('REDIS_PASSWORD') || undefined;
    const database = parseInt(this.config.get<string>('REDIS_DB', '0'), 10);
    this.keyPrefix = this.config.get<string>(
      'REDIS_KEY_PREFIX',
      'knowledge-hub:',
    );

    this.client = createClient({
      socket: { host, port },
      password,
      database,
    });

    this.client.on('error', (err) => {
      this.logger.error(
        `Redis 客户端错误: ${err instanceof Error ? err.message : err}`,
      );
    });

    await this.client.connect();
    this.logger.log(
      `Redis 已连接: ${host}:${port}, db=${database}, prefix=${this.keyPrefix}`,
    );
  }

  async onModuleDestroy() {
    if (!this.client) return;
    await this.client.quit();
    this.client = null;
    this.logger.log('Redis 连接已关闭');
  }

  /** 探测连通性 */
  async ping(): Promise<string> {
    return this.getClient().ping();
  }

  /**
   * 写入字符串；value 为对象时自动 JSON.stringify
   * @param ttlSeconds 过期秒数，不传则不过期
   */
  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const client = this.getClient();
    const payload = typeof value === 'string' ? value : JSON.stringify(value);
    const fullKey = this.prefix(key);

    if (ttlSeconds != null && ttlSeconds > 0) {
      await client.set(fullKey, payload, { EX: ttlSeconds });
      return;
    }

    await client.set(fullKey, payload);
  }

  /**
   * 读取；默认返回字符串。
   * 传入泛型时尝试 JSON.parse，失败则原样返回字符串。
   */
  async get<T = string>(key: string): Promise<T | null> {
    const raw = await this.getClient().get(this.prefix(key));
    if (raw == null) return null;

    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as T;
    }
  }

  /** 删除一个或多个 key，返回实际删除数量 */
  async del(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    return this.getClient().del(keys.map((k) => this.prefix(k)));
  }

  /** key 是否存在 */
  async exists(key: string): Promise<boolean> {
    const count = await this.getClient().exists(this.prefix(key));
    return count > 0;
  }

  /** 设置过期时间（秒） */
  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.getClient().expire(this.prefix(key), ttlSeconds);
    return result === 1;
  }

  /** 自增；key 不存在时从 0 开始 */
  async incr(key: string): Promise<number> {
    return this.getClient().incr(this.prefix(key));
  }

  private getClient(): RedisClientType {
    if (!this.client?.isOpen) {
      throw new ServiceUnavailableException('Redis 未连接或已断开');
    }
    return this.client;
  }

  private prefix(key: string): string {
    return `${this.keyPrefix}${key}`;
  }
}
