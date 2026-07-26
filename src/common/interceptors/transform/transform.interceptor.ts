import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, map } from 'rxjs';
import { ApiResponse } from '../../interfaces/api-response.interface';
import { BizCode } from '../../constants/biz-code.enum';
import { SKIP_TRANSFORM_KEY } from '../../decorators/skip-transform.decorator';

/**
 * 全局成功响应拦截器。
 * Controller 直接 return 的业务数据会被自动包装为 { code: 0, message: 'success', data }。
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T>> {
    const skipTransform = this.reflector.getAllAndOverride<boolean>(
      SKIP_TRANSFORM_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (skipTransform) {
      return next.handle() as Observable<ApiResponse<T>>;
    }

    return next.handle().pipe(
      map((data) => ({
        code: BizCode.SUCCESS,
        message: 'success',
        data: data ?? null,
      })),
    );
  }
}
