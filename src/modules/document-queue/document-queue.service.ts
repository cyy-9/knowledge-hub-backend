import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import {
  DOCUMENT_JOB,
  DOCUMENT_QUEUE,
  DocumentJobName,
} from './document-queue.constants';
import {
  VectorizeDocumentJobData,
  VectorizeDocumentResult,
} from './document-job.interfaces';

/**
 * 文档队列生产者。
 * 负责向 BullMQ 队列投递任务，供 DocumentProcessor 异步消费。
 */
@Injectable()
export class DocumentQueueService {
  constructor(
    @InjectQueue(DOCUMENT_QUEUE)
    private readonly documentQueue: Queue<
      VectorizeDocumentJobData,
      VectorizeDocumentResult,
      DocumentJobName
    >,
  ) {}

  /**
   * 创建文档向量化任务。
   */
  async addVectorizeJob(
    data: VectorizeDocumentJobData,
  ): Promise<Job<VectorizeDocumentJobData, VectorizeDocumentResult>> {
    return this.documentQueue.add(DOCUMENT_JOB.VECTORIZE, data, {
      /**
       * 相同文档、相同版本不重复创建任务。
       *
       * 不建议在 BullMQ jobId 中使用冒号。
       */
      jobId: `vectorize-${data.documentId}-${data.version}`,

      attempts: 3,

      backoff: {
        type: 'exponential',
        delay: 5000,
      },

      // 数值越小优先级越高
      priority: 5,
    });
  }

  /** 按 jobId 查询任务，可用于轮询进度或状态 */
  async getJob(jobId: string) {
    return this.documentQueue.getJob(jobId);
  }
}
