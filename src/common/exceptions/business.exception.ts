import { HttpException, HttpStatus } from '@nestjs/common';
import { BizCode } from '../constants/biz-code.enum';

/**
 * 业务异常，携带明确的业务状态码。
 * Service 层抛出此异常，由 AllExceptionsFilter 统一格式化为 ApiResponse。
 */
export class BusinessException extends HttpException {
  constructor(
    public readonly bizCode: BizCode,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super(message, status);
  }
}
