import { Global, Module } from '@nestjs/common';
import { RustfsService } from './rustfs.service';

/**
 * 对象存储模块（RustFS / S3 兼容）
 * @Global：全应用可直接注入 RustfsService，无需各业务模块再 imports
 */
@Global()
@Module({
  providers: [RustfsService],
  exports: [RustfsService],
})
export class StorageModule {}
