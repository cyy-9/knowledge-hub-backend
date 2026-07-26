/** 统一 API 响应体 */
export interface ApiResponse<T = unknown> {
  /** 业务状态码，0 表示成功 */
  code: number;
  /** 提示信息 */
  message: string;
  /** 业务数据，失败时为 null */
  data: T | null;
}
