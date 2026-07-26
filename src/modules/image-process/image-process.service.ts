import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import sharp from 'sharp';
import { nextSnowflakeId } from '../../common/snowflake-id';
import { RustfsService } from '../storage/rustfs.service';
import { decodeUploadFilename } from '../document/parser/utils/markdown.util';
import { CompressFormat, CompressImageDto } from './dto/compress-image.dto';
import { QueryImageProcessDto } from './dto/query-image-process.dto';
import {
  ImageProcessEntity,
  ImageProcessStatus,
} from './entities/image-process.entity';

/** 解析后的压缩参数 */
interface ResolvedCompressOptions {
  quality: number;
  maxWidth?: number;
  maxHeight?: number;
  format: CompressFormat;
}

/** sharp 压缩结果 */
interface CompressedImage {
  buffer: Buffer;
  width: number;
  height: number;
  mime: string;
  fileName: string;
}

@Injectable()
export class ImageProcessService {
  private readonly logger = new Logger(ImageProcessService.name);

  private static readonly SUPPORTED_INPUT_MIMES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
  ]);

  constructor(
    @InjectEntityManager()
    private readonly em: EntityManager,
    private readonly rustfs: RustfsService,
  ) {}

  /** 上传 → 压缩 → 存原图/压缩图 → 落库 → 返回对比数据 */
  async compress(
    file: Express.Multer.File,
    dto: CompressImageDto,
    userId: string,
  ) {
    this.validateImageFile(file);
    if (!this.rustfs.isEnabled()) {
      throw new ServiceUnavailableException(
        'RustFS 未启用，无法上传与压缩图片',
      );
    }

    const options = this.resolveOptions(dto);
    const originalName = decodeUploadFilename(file.originalname);
    const originalMime = file.mimetype || 'application/octet-stream';
    const isGifInput = originalMime === 'image/gif';

    let meta: sharp.Metadata;
    try {
      // 动图 GIF 需 animated: true 才能读到 pages / 帧信息
      meta = await sharp(file.buffer, { animated: isGifInput }).metadata();
    } catch {
      throw new BadRequestException('无法解析图片文件');
    }

    if (!meta.width || !meta.height) {
      throw new BadRequestException('无法读取图片尺寸');
    }

    const frameCount = meta.pages ?? 1;
    const isAnimated = isGifInput && frameCount > 1;

    const uploadedKeys: string[] = [];

    try {
      const original = await this.rustfs.uploadBytesResult(file.buffer, {
        fileName: originalName,
        contentType: originalMime,
        prefix: 'images/original',
      });
      uploadedKeys.push(original.key);

      const compressed = await this.compressImage(
        file.buffer,
        originalName,
        options,
        isAnimated,
      );

      const compressedUpload = await this.rustfs.uploadBytesResult(
        compressed.buffer,
        {
          fileName: compressed.fileName,
          contentType: compressed.mime,
          prefix: 'images/compressed',
        },
      );
      uploadedKeys.push(compressedUpload.key);

      const originalSize = file.buffer.length;
      const compressedSize = compressed.buffer.length;
      const savedBytes = Math.max(0, originalSize - compressedSize);
      const savedRatio =
        originalSize > 0 ? Number((savedBytes / originalSize).toFixed(4)) : 0;

      const entity = this.em.create(ImageProcessEntity, {
        id: nextSnowflakeId(),
        userId,
        originalUrl: original.url,
        originalKey: original.key,
        originalSize,
        originalWidth: meta.width,
        originalHeight: meta.height,
        originalMime,
        originalName,
        compressedUrl: compressedUpload.url,
        compressedKey: compressedUpload.key,
        compressedSize,
        compressedWidth: compressed.width,
        compressedHeight: compressed.height,
        compressedMime: compressed.mime,
        quality: options.quality,
        maxWidth: options.maxWidth ?? null,
        maxHeight: options.maxHeight ?? null,
        outputFormat: options.format,
        savedBytes,
        savedRatio,
        status: ImageProcessStatus.Success,
        createBy: userId,
        updateBy: userId,
        deleted: false,
      });

      const saved = await this.em.save(entity);
      const vo = this.toCompareVo(saved);

      if (options.format === CompressFormat.Gif) {
        return {
          ...vo,
          animated: isAnimated,
          frames: frameCount,
        };
      }

      if (isAnimated) {
        this.logger.warn(
          `动图 GIF 已转为 ${options.format}，动画帧未保留（仅首帧）`,
        );
      }

      return vo;
    } catch (error) {
      await this.rustfs.deleteObjects(uploadedKeys);
      if (
        error instanceof BadRequestException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`图片压缩失败: ${message}`);
      throw new BadRequestException(`图片压缩失败: ${message}`);
    }
  }

  /** 分页查询当前用户的压缩任务 */
  findAll(_query: QueryImageProcessDto, _userId: string) {
    return 'TODO: list image process tasks';
  }

  /** 查询单条任务（前后对比） */
  findOne(_id: string, _userId: string) {
    return `TODO: get image process task #${_id}`;
  }

  /** 删除任务及存储文件 */
  remove(_id: string, _userId: string) {
    return `TODO: remove image process task #${_id}`;
  }

  /** 读取任务对应文件（供下载接口使用） */
  async getDownloadPayload(
    id: string,
    variant: 'original' | 'compressed' = 'compressed',
  ) {
    const entity = await this.em.findOne(ImageProcessEntity, {
      where: { id, deleted: false },
    });
    if (!entity) {
      throw new NotFoundException('压缩任务不存在');
    }

    const isOriginal = variant === 'original';
    const key = isOriginal ? entity.originalKey : entity.compressedKey;
    if (!key) {
      throw new NotFoundException('文件不存在');
    }

    const fileName = isOriginal
      ? entity.originalName || 'original'
      : this.buildOutputFileName(
          entity.originalName || 'image',
          (entity.outputFormat as CompressFormat) || CompressFormat.Webp,
        );
    const fallbackMime = isOriginal
      ? entity.originalMime
      : entity.compressedMime;

    const { buffer, contentType } = await this.rustfs.getObjectBuffer(key);
    return {
      buffer,
      contentType: contentType || fallbackMime || 'application/octet-stream',
      fileName,
    };
  }

  private validateImageFile(file: Express.Multer.File): void {
    if (!file.buffer?.length) {
      throw new BadRequestException('图片内容为空');
    }

    const mime = file.mimetype || '';
    if (!ImageProcessService.SUPPORTED_INPUT_MIMES.has(mime)) {
      throw new BadRequestException(
        `不支持的图片格式: ${mime || 'unknown'}，支持 jpeg/png/webp/gif`,
      );
    }
  }

  private resolveOptions(dto: CompressImageDto): ResolvedCompressOptions {
    const format = dto.format ?? CompressFormat.Webp;

    return {
      quality: dto.quality ?? 80,
      maxWidth: dto.maxWidth,
      maxHeight: dto.maxHeight,
      format,
    };
  }

  private async compressImage(
    buffer: Buffer,
    originalName: string,
    options: ResolvedCompressOptions,
    isAnimated: boolean,
  ): Promise<CompressedImage> {
    if (options.format === CompressFormat.Gif) {
      return this.compressGif(buffer, originalName, options, isAnimated);
    }

    // 非 GIF 输出：动图输入只处理首帧
    let pipeline = sharp(buffer, { animated: false }).rotate();

    if (options.maxWidth || options.maxHeight) {
      pipeline = pipeline.resize({
        width: options.maxWidth,
        height: options.maxHeight,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    switch (options.format) {
      case CompressFormat.Webp:
        pipeline = pipeline.webp({ quality: options.quality });
        break;
      case CompressFormat.Jpeg:
        pipeline = pipeline.jpeg({ quality: options.quality });
        break;
      case CompressFormat.Png:
        pipeline = pipeline.png({
          compressionLevel: this.mapPngCompressionLevel(options.quality),
        });
        break;
      default:
        throw new BadRequestException('暂不支持该输出格式');
    }

    try {
      const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

      return {
        buffer: data,
        width: info.width,
        height: info.height,
        mime: this.mimeForFormat(options.format),
        fileName: this.buildOutputFileName(originalName, options.format),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(`图片压缩处理失败: ${message}`);
    }
  }

  /**
   * GIF 输出：动图输入保留全部帧（animated: true）
   * 通过减色、effort、interFrameMaxError 控制体积
   */
  private async compressGif(
    buffer: Buffer,
    originalName: string,
    options: ResolvedCompressOptions,
    isAnimated: boolean,
  ): Promise<CompressedImage> {
    let pipeline = sharp(buffer, { animated: isAnimated }).rotate();

    if (options.maxWidth || options.maxHeight) {
      pipeline = pipeline.resize({
        width: options.maxWidth,
        height: options.maxHeight,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    pipeline = pipeline.gif({
      colours: this.mapGifColours(options.quality),
      effort: this.mapGifEffort(options.quality),
      dither: 1.0,
      reuse: true,
      interFrameMaxError: this.mapInterFrameMaxError(options.quality),
    });

    try {
      const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

      return {
        buffer: data,
        width: info.width,
        height: info.height,
        mime: 'image/gif',
        fileName: this.buildOutputFileName(originalName, CompressFormat.Gif),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(`GIF 压缩处理失败: ${message}`);
    }
  }

  /** PNG compressionLevel 0（快）~ 9（小），与 quality 反向映射 */
  private mapPngCompressionLevel(quality: number): number {
    return Math.min(9, Math.max(0, Math.round(9 - (quality / 100) * 9)));
  }

  /** GIF 调色板颜色数 2–256；quality 越低颜色越少、体积越小 */
  private mapGifColours(quality: number): number {
    return Math.min(256, Math.max(2, Math.round((quality / 100) * 256)));
  }

  /** GIF 编码 effort 1（快）~ 10（慢、palette 更准） */
  private mapGifEffort(quality: number): number {
    return Math.min(10, Math.max(1, Math.round((quality / 100) * 10)));
  }

  /**
   * 帧间允许的颜色误差 0（无损）~ 16（更小体积）
   * quality 越低容忍误差越大
   */
  private mapInterFrameMaxError(quality: number): number {
    return Math.min(16, Math.max(0, Math.round((1 - quality / 100) * 16)));
  }

  private mimeForFormat(format: CompressFormat): string {
    switch (format) {
      case CompressFormat.Jpeg:
        return 'image/jpeg';
      case CompressFormat.Png:
        return 'image/png';
      case CompressFormat.Gif:
        return 'image/gif';
      case CompressFormat.Webp:
      default:
        return 'image/webp';
    }
  }

  private buildOutputFileName(
    originalName: string,
    format: CompressFormat,
  ): string {
    const base = originalName.replace(/\.[^.]+$/, '') || 'image';
    const extMap: Record<CompressFormat, string> = {
      [CompressFormat.Jpeg]: '.jpg',
      [CompressFormat.Png]: '.png',
      [CompressFormat.Webp]: '.webp',
      [CompressFormat.Gif]: '.gif',
    };
    return `${base}${extMap[format]}`;
  }

  /** 对比页 VO，findOne 可复用 */
  private toCompareVo(entity: ImageProcessEntity) {
    return {
      id: entity.id,
      original: {
        url: entity.originalUrl,
        size: entity.originalSize,
        width: entity.originalWidth,
        height: entity.originalHeight,
        name: entity.originalName,
        mime: entity.originalMime,
      },
      compressed: {
        url: entity.compressedUrl,
        size: entity.compressedSize,
        width: entity.compressedWidth,
        height: entity.compressedHeight,
        mime: entity.compressedMime,
      },
      params: {
        quality: entity.quality,
        maxWidth: entity.maxWidth,
        maxHeight: entity.maxHeight,
        format: entity.outputFormat,
      },
      savedBytes: entity.savedBytes,
      savedRatio: entity.savedRatio,
      createdAt: entity.createdAt,
    };
  }
}
