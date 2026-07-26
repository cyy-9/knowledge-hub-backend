/**
 * 业务状态码。
 * 约定：0 为成功；40xxx 客户端错误；50xxx 服务端错误。
 */
export enum BizCode {
  SUCCESS = 0,

  VALIDATION_ERROR = 40001,
  UNAUTHORIZED = 40101,
  FORBIDDEN = 40301,
  NOT_FOUND = 40401,

  INTERNAL_ERROR = 50000,
}
