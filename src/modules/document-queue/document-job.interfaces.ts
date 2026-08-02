/** 向量化任务的入参，由生产者投递、消费者读取 */
export interface VectorizeDocumentJobData {
  documentId: string;
  fileKey: string;
  knowledgeBaseId: string;
  version: number;
}

/** 删除向量任务的入参（尚未实现） */
export interface DeleteDocumentVectorJobData {
  documentId: string;
  knowledgeBaseId: string;
}

/** 所有任务入参的联合类型 */
export type DocumentJobData =
  | VectorizeDocumentJobData
  | DeleteDocumentVectorJobData;

/** 向量化任务完成后的返回值，写入 Job result */
export interface VectorizeDocumentResult {
  documentId: string;
  chunkCount: number;
  vectorCount: number;
}
