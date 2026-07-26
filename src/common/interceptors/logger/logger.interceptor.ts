import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

/** HTTP 访问日志：记录成功请求的进入与完成；错误由 AllExceptionsFilter 统一输出 */
@Injectable()
export class LoggerInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const { method, originalUrl, ip } = request;
    const controller = context.getClass().name;
    const handler = context.getHandler().name;
    const handlerName = `${controller}.${handler}`;
    const clientIp = ip ?? 'unknown';
    const startedAt = Date.now();

    this.logger.log(
      `--> ${method} ${originalUrl} | ${handlerName} | ${clientIp}`,
    );

    return next.handle().pipe(
      tap(() => {
        const durationMs = Date.now() - startedAt;
        this.logger.log(
          `<-- ${method} ${originalUrl} ${response.statusCode} ${durationMs}ms | ${handlerName}`,
        );
      }),
    );
  }
}
