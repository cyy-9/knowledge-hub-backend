import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { BizCode } from '../constants/biz-code.enum';
import { BusinessException } from '../exceptions/business.exception';
import { ApiResponse } from '../interfaces/api-response.interface';

/**
 * 全局异常过滤器。
 * 将 BusinessException、ValidationPipe 校验错误、未知异常统一格式化为 ApiResponse，
 * 同时保留对应的 HTTP 状态码（400/401/404/500）。
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const { status, code, message } = this.parseException(exception);

    // Guard / Pipe / Service 等抛出的错误统一在此记录（含 Guard 401）
    if (status >= 400) {
      this.logger.error(
        `${request.method} ${request.originalUrl} ${status} | code=${code} | ${message}`,
      );
    }

    const body: ApiResponse<null> = {
      code,
      message,
      data: null,
    };

    response.status(status).json(body);
  }

  private parseException(exception: unknown): {
    status: number;
    code: BizCode;
    message: string;
  } {
    if (exception instanceof BusinessException) {
      return {
        status: exception.getStatus(),
        code: exception.bizCode,
        message: this.extractMessage(exception.getResponse()),
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();

      return {
        status,
        code: this.mapHttpStatusToBizCode(status),
        message: this.extractMessage(exception.getResponse()),
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: BizCode.INTERNAL_ERROR,
      message: 'Internal server error',
    };
  }

  private extractMessage(response: string | object): string {
    if (typeof response === 'string') {
      return response;
    }

    if (typeof response === 'object' && response !== null) {
      const { message } = response as { message?: string | string[] };

      if (Array.isArray(message)) {
        return message.join('; ');
      }

      if (typeof message === 'string') {
        return message;
      }
    }

    return 'Internal server error';
  }

  private mapHttpStatusToBizCode(status: number): BizCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return BizCode.VALIDATION_ERROR;
      case HttpStatus.UNAUTHORIZED:
        return BizCode.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return BizCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return BizCode.NOT_FOUND;
      default:
        return BizCode.INTERNAL_ERROR;
    }
  }
}
