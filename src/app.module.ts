import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DocumentModule } from './modules/document/document.module';
import { LoggerInterceptor } from './common/interceptors/logger/logger.interceptor';
import { TransformInterceptor } from './common/interceptors/transform/transform.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { StorageModule } from './modules/storage/storage.module';
import { RedisModule } from './modules/redis/redis.module';
import { UserModule } from './modules/user/user.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { ImageProcessModule } from './modules/image-process/image-process.module';
import { DocumentQueueModule } from './modules/document-queue/document-queue.module';
import { SkillsModule } from './modules/skills/skills.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres' as const,
        host: configService.get<string>('POSTGRES_HOST', 'localhost'),
        port: parseInt(configService.get<string>('POSTGRES_PORT', '5432'), 10),
        username: configService.get<string>('POSTGRES_USER', 'postgres'),
        password: configService.get<string>('POSTGRES_PASSWORD', 'postgres'),
        database: configService.get<string>('POSTGRES_DB', 'knowledge_hub'),
        synchronize:
          configService.get<string>('POSTGRES_SYNCHRONIZE') === 'true',
        autoLoadEntities: true,
      }),
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const host = configService.get<string>('MONGODB_HOST', 'localhost');
        const port = parseInt(
          configService.get<string>('MONGODB_PORT', '27017'),
          10,
        );
        const username = configService.get<string>('MONGODB_USER', 'mongodb');
        const password = configService.get<string>(
          'MONGODB_PASSWORD',
          'mongodb',
        );
        const database = configService.get<string>(
          'MONGODB_DB',
          'knowledge_hub',
        );

        return {
          uri: `mongodb://${username}:${password}@${host}:${port}/${database}?authSource=admin`,
        };
      },
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST', '127.0.0.1'),
          port: configService.get<number>('REDIS_PORT', 6379),
          password: configService.get<string>('REDIS_PASSWORD') || undefined,
          db: configService.get<number>('REDIS_DB', 0),
        },
        // BullMQ 在 Redis 中生成的键前缀
        prefix: 'knowledge-hub-bullmq',
        // 所有队列的默认任务配置
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 3000,
          },
          // 成功任务保留最近 1000 条或最多 24 小时
          removeOnComplete: {
            age: 24 * 60 * 60,
            count: 1000,
          },
          // 失败任务保留最近 5000 条或最多 7 天
          removeOnFail: {
            age: 7 * 24 * 60 * 60,
            count: 5000,
          },
        },
      }),
    }),
    DocumentModule,
    StorageModule,
    RedisModule,
    UserModule,
    AuthModule,
    ImageProcessModule,
    DocumentQueueModule,
    SkillsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggerInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
