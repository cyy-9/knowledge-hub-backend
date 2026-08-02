import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DOCUMENT_QUEUE } from './document-queue.constants';
import { DocumentQueueService } from './document-queue.service';
import { DocumentQueueController } from './document-queue.controller';
import { DocumentProcessor } from './document.processor';
// import { DocumentVectorizationService } from './document-vectorization.service';

/**
 * 文档处理队列模块。
 * 注册 BullMQ 队列，并提供任务投递（Service）与消费（Processor）。
 */
@Module({
  imports: [
    BullModule.registerQueue({
      name: DOCUMENT_QUEUE,
    }),
  ],
  controllers: [DocumentQueueController],
  providers: [
    DocumentQueueService,
    DocumentProcessor,
    // DocumentVectorizationService,
  ],
  exports: [DocumentQueueService],
})
export class DocumentQueueModule {}
