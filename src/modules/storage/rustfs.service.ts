import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { extname } from 'path';

export interface UploadBytesOptions {
  /** 原始文件名，用于生成对象 key 与扩展名 */
  fileName: string;
  /** MIME 类型，写入 S3 ContentType */
  contentType: string;
  /** 对象 key 前缀，默认 documents */
  prefix?: string;
}

/** 上传结果（含 key，供删除等操作使用） */
export interface UploadBytesResult {
  url: string;
  key: string;
  size: number;
}

/** GetObject 读取结果 */
export interface GetObjectBufferResult {
  buffer: Buffer;
  contentType: string;
}

/** RustFS 文件存储（S3 兼容） */
@Injectable()
export class RustfsService implements OnModuleInit {
  private readonly logger = new Logger(RustfsService.name);
  /** AWS SDK S3 客户端；未启用时为 null */
  private client: S3Client | null = null;
  /** 是否允许上传（读自 RUSTFS_ENABLED） */
  private enabled = false;
  /** 目标 bucket 名 */
  private bucket = '';
  /** 对外访问 URL 前缀（无尾斜杠） */
  private publicBaseUrl = '';

  constructor(private readonly config: ConfigService) {}

  /** 模块启动时读取 .env，初始化 S3 客户端并尝试确保 bucket 存在 */
  onModuleInit() {
    this.enabled =
      this.config.get<string>('RUSTFS_ENABLED', 'true').toLowerCase() !==
      'false';

    if (!this.enabled) {
      this.logger.warn('RustFS 已禁用（RUSTFS_ENABLED=false），文件上传将跳过');
      return;
    }

    const endpoint = this.config.get<string>(
      'RUSTFS_ENDPOINT',
      'http://localhost:9000',
    );
    const accessKey = this.config.get<string>(
      'RUSTFS_ACCESS_KEY',
      'rustfsadmin',
    );
    const secretKey = this.config.get<string>(
      'RUSTFS_SECRET_KEY',
      'rustfsadmin',
    );
    const region = this.config.get<string>('RUSTFS_REGION', 'us-east-1');
    this.bucket = this.config.get<string>('RUSTFS_BUCKET', 'knowledge-hub');
    // 未单独配置公网地址时，回退为 endpoint
    this.publicBaseUrl = (
      this.config.get<string>('RUSTFS_PUBLIC_URL') || endpoint
    ).replace(/\/$/, '');

    this.client = new S3Client({
      endpoint,
      region,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
      // 路径风格：/{bucket}/{key}，兼容 MinIO / RustFS
      forcePathStyle: true,
    });

    this.logger.log(
      `RustFS 已配置: endpoint=${endpoint}, bucket=${this.bucket}, public=${this.publicBaseUrl}`,
    );

    // 异步预热 bucket，失败不阻塞启动，首次上传时会再试
    void this.ensureBucket().catch((err) => {
      this.logger.warn(
        `RustFS 初始化 bucket 失败（首次上传时会重试）: ${err instanceof Error ? err.message : err}`,
      );
    });
  }

  /** 是否已启用且客户端就绪（业务侧上传前可据此跳过） */
  isEnabled(): boolean {
    return this.enabled && this.client != null;
  }

  /** 上传字节，返回可访问 URL（兼容仅需 URL 的调用方） */
  async uploadBytes(
    bytes: Buffer | Uint8Array,
    options: UploadBytesOptions,
  ): Promise<string> {
    const result = await this.uploadBytesResult(bytes, options);
    return result.url;
  }

  /** 上传字节，返回 URL + key + size（需删除对象时使用） */
  async uploadBytesResult(
    bytes: Buffer | Uint8Array,
    options: UploadBytesOptions,
  ): Promise<UploadBytesResult> {
    if (!this.isEnabled() || !this.client) {
      throw new ServiceUnavailableException(
        'RustFS 未启用或未配置，无法上传文件',
      );
    }

    await this.ensureBucket();

    // key 形态：{prefix}/{yyyy}/{mm}/{dd}/{safeName}-{uuid}{ext}
    const prefix = (options.prefix ?? 'documents').replace(/^\/+|\/+$/g, '');
    const ext = extname(options.fileName) || guessExt(options.contentType);
    const safeBase = sanitizeBaseName(options.fileName);
    const key = `${prefix}/${formatDatePath()}/${safeBase}-${randomUUID()}${ext}`;
    const body = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: options.contentType,
        ContentLength: body.length,
      }),
    );

    const url = `${this.publicBaseUrl}/${this.bucket}/${key}`;
    this.logger.log(
      `RustFS 上传成功: key=${key}, size=${body.length}, url=${url}`,
    );

    return { url, key, size: body.length };
  }

  /** 按 key 读取对象字节（下载 / 代理访问） */
  async getObjectBuffer(key: string): Promise<GetObjectBufferResult> {
    if (!key || !this.isEnabled() || !this.client) {
      throw new ServiceUnavailableException(
        'RustFS 未启用或未配置，无法读取文件',
      );
    }

    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );

    if (!response.Body) {
      throw new ServiceUnavailableException('对象存储返回空内容');
    }

    const bytes = await response.Body.transformToByteArray();
    return {
      buffer: Buffer.from(bytes),
      contentType: response.ContentType || 'application/octet-stream',
    };
  }

  /** 删除对象（失败回滚 / 任务删除时使用；未启用时静默跳过） */
  async deleteObject(key: string): Promise<void> {
    if (!key || !this.isEnabled() || !this.client) return;

    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    this.logger.log(`RustFS 已删除: key=${key}`);
  }

  /** 批量删除，忽略单个失败 */
  async deleteObjects(keys: string[]): Promise<void> {
    const unique = [...new Set(keys.filter(Boolean))];
    await Promise.allSettled(unique.map((key) => this.deleteObject(key)));
  }

  /** HeadBucket 探测；不存在则 CreateBucket（忽略并发下「已存在」错误） */
  private async ensureBucket(): Promise<void> {
    if (!this.client) return;

    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return;
    } catch {
      // bucket 不存在则创建
    }

    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`RustFS bucket 已创建: ${this.bucket}`);
    } catch (err) {
      // 并发创建时可能已存在
      const message = err instanceof Error ? err.message : String(err);
      if (
        !/BucketAlreadyOwnedByYou|BucketAlreadyExists|already exists/i.test(
          message,
        )
      ) {
        throw err;
      }
    }
  }
}

/** 按上传日生成路径片段 yyyy/mm/dd，便于按日浏览对象 */
function formatDatePath(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

/** 去掉扩展名后清洗文件名：保留中英文/数字/._- ，最长 64 字符 */
function sanitizeBaseName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '') || 'file';
  return base.replace(/[^\w\u4e00-\u9fff.-]+/g, '_').slice(0, 64);
}

/** 无扩展名时，根据 MIME 猜一个后缀 */
function guessExt(contentType: string): string {
  switch (contentType) {
    case 'image/png':
      return '.png';
    case 'image/jpeg':
      return '.jpg';
    case 'image/webp':
      return '.webp';
    case 'image/gif':
      return '.gif';
    case 'application/pdf':
      return '.pdf';
    default:
      return '';
  }
}
