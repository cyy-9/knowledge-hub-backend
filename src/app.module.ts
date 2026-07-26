import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { TypeOrmModule } from '@nestjs/typeorm';
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
    DocumentModule,
    StorageModule,
    RedisModule,
    UserModule,
    AuthModule,
    ImageProcessModule,
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
