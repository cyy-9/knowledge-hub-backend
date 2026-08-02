/** BullMQ 队列名称，与 Redis 中实际队列键对应 */
export const DOCUMENT_QUEUE = 'document-processing';

/** 队列支持的任务类型枚举 */
export const DOCUMENT_JOB = {
  /** 文档向量化：下载 → 分块 → embedding → 入库 */
  VECTORIZE: 'vectorize-document',
  /** 删除文档向量（尚未实现 Processor 分支） */
  DELETE_VECTOR: 'delete-document-vector',
} as const;

/** 任务名称联合类型，用于 Queue / Job 泛型约束 */
export type DocumentJobName = (typeof DOCUMENT_JOB)[keyof typeof DOCUMENT_JOB];
