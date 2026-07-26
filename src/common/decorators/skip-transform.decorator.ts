import { SetMetadata } from '@nestjs/common';

export const SKIP_TRANSFORM_KEY = 'skipTransform';

/** 跳过全局 TransformInterceptor，用于 SSE 等直接写响应的接口 */
export const SkipTransform = () => SetMetadata(SKIP_TRANSFORM_KEY, true);
