import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // 移除未定义的属性
      transform: true, // 自动转换请求体为 DTO 类型
    }),
  );

  app.enableCors();

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
