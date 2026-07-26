import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import { ImageProcessService } from './image-process.service';
import { CompressImageDto } from './dto/compress-image.dto';
import { QueryImageProcessDto } from './dto/query-image-process.dto';

/**
 * 图片压缩接口
 *
 * 核心流程：上传 → 压缩 → 原图/压缩图落存储 → 返回对比数据
 */
@Public()
@Controller('image-process')
export class ImageProcessController {
  constructor(private readonly imageProcessService: ImageProcessService) {}

  /**
   * 上传并压缩图片
   * form-data: file（必填）+ quality / maxWidth / maxHeight / format（可选）
   * 返回原图与压缩图的 URL、体积、尺寸，供前端做前后对比
   */
  @Post('compress')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  compress(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CompressImageDto,
    @CurrentUser() user: AuthUser,
  ) {
    if (!file) {
      throw new BadRequestException('请上传图片（form-data 字段名: file）');
    }
    return this.imageProcessService.compress(file, dto, user?.id ?? '0');
  }

  /** 当前用户的压缩任务列表（历史记录） */
  @Get()
  findAll(@Query() query: QueryImageProcessDto, @CurrentUser() user: AuthUser) {
    return this.imageProcessService.findAll(query, user.id);
  }

  /** 下载原图或压缩图（variant=original | compressed，默认 compressed） */
  @SkipTransform()
  @Get(':id/download')
  async download(
    @Param('id') id: string,
    @Query('variant') variant: string,
    @Res() res: Response,
  ) {
    const kind =
      variant === 'original' || variant === 'compressed'
        ? variant
        : 'compressed';
    const { buffer, contentType, fileName } =
      await this.imageProcessService.getDownloadPayload(id, kind);

    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      buildContentDisposition(fileName),
    );
    res.send(buffer);
  }

  /** 单条任务详情（前后对比页：原图 URL + 压缩图 URL + 元数据） */
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.imageProcessService.findOne(id, user.id);
  }

  /** 删除任务，并清理对象存储中的原图/压缩图 */
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.imageProcessService.remove(id, user.id);
  }
}

/** attachment 文件名：filename 仅 ASCII，中文走 filename* */
function buildContentDisposition(fileName: string): string {
  const utf8Name =
    fileName.replace(/[^\w\u4e00-\u9fff.-]+/g, '_').slice(0, 128) ||
    'download';
  const asciiName =
    utf8Name.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_') ||
    'download';
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(utf8Name)}`;
}
