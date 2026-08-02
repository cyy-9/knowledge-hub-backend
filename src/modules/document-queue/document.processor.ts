import { Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  DOCUMENT_JOB,
  DOCUMENT_QUEUE,
  DocumentJobName,
} from './document-queue.constants';
import {
  VectorizeDocumentJobData,
  VectorizeDocumentResult,
} from './document-job.interfaces';
// import { DocumentVectorizationService } from './document-vectorization.service';

/**
 * 文档队列消费者（Worker）。
 * 监听 document-processing 队列，按任务类型分发处理逻辑。
 */
@Processor(DOCUMENT_QUEUE, {
  // 同一时刻最多并行处理 3 个任务
  concurrency: 3,
})
export class DocumentProcessor extends WorkerHost {
  private readonly logger = new Logger(DocumentProcessor.name);

  // constructor(
  //   private readonly vectorizationService: DocumentVectorizationService,
  // ) {
  //   super();
  // }

  constructor() {
    super();
  }

  /** BullMQ Worker 入口，根据 job.name 路由到具体处理方法 */
  async process(
    job: Job<
      VectorizeDocumentJobData,
      VectorizeDocumentResult,
      DocumentJobName
    >,
  ): Promise<VectorizeDocumentResult> {
    switch (job.name) {
      case DOCUMENT_JOB.VECTORIZE:
        return this.vectorizeDocument(job);

      default:
        throw new Error(`不支持的任务类型：${job.name}`);
    }
  }

  /** 执行文档向量化流水线 */
  private async vectorizeDocument(
    job: Job<VectorizeDocumentJobData, VectorizeDocumentResult>,
  ): Promise<VectorizeDocumentResult> {
    const { documentId, fileKey, knowledgeBaseId, version } = job.data;

    this.logger.log(`开始处理文档：${documentId}`);

    await job.updateProgress(10);

    // --- 以下为向量化具体实现，依赖 DocumentVectorizationService，尚未就绪 ---
    // const fileContent = await this.vectorizationService.downloadFile(fileKey);
    //
    // await job.updateProgress(30);
    //
    // const chunks = await this.vectorizationService.splitDocument(fileContent);
    //
    // await job.updateProgress(50);
    //
    // const vectors = await this.vectorizationService.createEmbeddings(chunks);
    //
    // await job.updateProgress(80);
    //
    // await this.vectorizationService.saveVectors({
    //   documentId,
    //   knowledgeBaseId,
    //   version,
    //   chunks,
    //   vectors,
    // });
    //
    // await job.updateProgress(100);
    //
    // return {
    //   documentId,
    //   chunkCount: chunks.length,
    //   vectorCount: vectors.length,
    // };

    // 临时占位：模拟处理耗时，用于验证队列投递 → 消费 → 进度更新 → 完成 全流程
    this.logger.log(
      `[测试模式] 跳过向量化，fileKey=${fileKey}，knowledgeBaseId=${knowledgeBaseId}，version=${version}`,
    );
    await job.updateProgress(50);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await job.updateProgress(100);

    return {
      documentId,
      chunkCount: 0,
      vectorCount: 0,
    };
  }

  /** 任务从 waiting 进入 active 时触发 */
  @OnWorkerEvent('active')
  onActive(job: Job): void {
    this.logger.log(`任务开始执行：${job.id}，类型：${job.name}`);
  }

  /** 任务成功完成时触发，result 即 process 方法的返回值 */
  @OnWorkerEvent('completed')
  onCompleted(job: Job, result: VectorizeDocumentResult | undefined): void {
    this.logger.log(
      `任务执行完成：${job.id}，向量数量：${result?.vectorCount ?? 0}`,
    );
  }

  /** 任务失败且重试耗尽时触发 */
  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error): void {
    this.logger.error(
      `任务执行失败：${job?.id ?? 'unknown'}，${error.message}`,
      error.stack,
    );
  }
}
