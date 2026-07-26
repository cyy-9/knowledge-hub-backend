import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

/**
 * Redis 基础设施模块
 * @Global：全应用可直接注入 RedisService，无需各业务模块再 imports
 */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
