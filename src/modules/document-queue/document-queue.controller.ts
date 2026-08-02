import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { DocumentQueueService } from './document-queue.service';

/**
 * 文档队列测试接口。
 * 用于手动投递任务、查询任务状态，验证 BullMQ 全流程。
 */
@Public()
@Controller('document-queue')
export class DocumentQueueController {
  constructor(private readonly documentQueueService: DocumentQueueService) {}

  /** 投递一条向量化任务到队列 */
  @Post('vectorize')
  async enqueueVectorize(
    @Body()
    data: {
      documentId: string;
      fileKey: string;
      knowledgeBaseId: string;
      version: number;
    },
  ) {
    const job = await this.documentQueueService.addVectorizeJob(data);
    return {
      jobId: job.id,
      name: job.name,
      data: job.data,
    };
  }

  /** 按 jobId 查询任务状态与进度 */
  @Get('jobs/:jobId')
  async getJob(@Param('jobId') jobId: string) {
    const job = await this.documentQueueService.getJob(jobId);
    if (!job) {
      return { jobId, found: false };
    }

    const state = await job.getState();
    return {
      jobId: job.id,
      found: true,
      name: job.name,
      state,
      progress: job.progress,
      data: job.data,
      returnvalue: job.returnvalue,
      failedReason: job.failedReason,
    };
  }
}
