import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    UserModule,
    // secret / expiresIn 在 AuthService / Guard 签发或校验时分别传入
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  // 导出 JwtModule，供 AppModule 里全局 JwtAuthGuard 注入 JwtService
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
