import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentService } from './document.service';
import { DocumentController } from './document.controller';
import {
  DocumentContent,
  DocumentContentSchema,
} from './schemas/document-content.schema';
import { DocumentEntity } from './entities/document.entity';
import { FileParserService } from './parser/file-parser.service';

/**
 * 文档模块
 * - Postgres：文档元数据（DocumentEntity）
 * - Mongo：文档正文（DocumentContent）
 * - FileParserService：上传文件解析为 Markdown
 * - RustfsService 来自全局 StorageModule，此处无需再 import
 */
@Module({
  imports: [
    // 注册 Mongo 正文 schema，供 DocumentService 注入 Model
    MongooseModule.forFeature([
      { name: DocumentContent.name, schema: DocumentContentSchema },
    ]),
    // 注册 Postgres 实体，供 Repository / EntityManager 使用
    TypeOrmModule.forFeature([DocumentEntity]),
  ],
  controllers: [DocumentController],
  providers: [DocumentService, FileParserService],
  // 导出后，其他模块 import DocumentModule 即可注入这两个服务
  exports: [DocumentService, FileParserService],
})
export class DocumentModule {}
