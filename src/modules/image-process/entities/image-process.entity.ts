import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigintTransformer } from '../../../common/transformers/bigint.transformer';

/** 压缩任务状态 */
export enum ImageProcessStatus {
  /** 成功 */
  Success = 0,
  /** 失败 */
  Failed = 1,
  /** 处理中（预留异步压缩） */
  Processing = 2,
}

/** 图片压缩任务（PostgreSQL kh_image_process） */
@Entity('kh_image_process')
export class ImageProcessEntity {
  /** 雪花 ID */
  @PrimaryColumn({ type: 'bigint', transformer: bigintTransformer })
  id: string;

  /** 发起人 ID */
  @Column({
    name: 'user_id',
    type: 'bigint',
    transformer: bigintTransformer,
  })
  userId: string;

  /** 原图访问 URL */
  @Column({ name: 'original_url', type: 'varchar', nullable: true })
  originalUrl?: string | null;

  /** 原图对象存储 key（删除用） */
  @Column({ name: 'original_key', type: 'varchar', nullable: true })
  originalKey?: string | null;

  /** 原图体积（字节） */
  @Column({ name: 'original_size', type: 'int', default: 0 })
  originalSize: number;

  /** 原图宽度（px） */
  @Column({ name: 'original_width', type: 'int', default: 0 })
  originalWidth: number;

  /** 原图高度（px） */
  @Column({ name: 'original_height', type: 'int', default: 0 })
  originalHeight: number;

  /** 原图 MIME */
  @Column({ name: 'original_mime', type: 'varchar', nullable: true })
  originalMime?: string | null;

  /** 上传时的原始文件名 */
  @Column({ name: 'original_name', type: 'varchar', nullable: true })
  originalName?: string | null;

  /** 压缩图访问 URL */
  @Column({ name: 'compressed_url', type: 'varchar', nullable: true })
  compressedUrl?: string | null;

  /** 压缩图对象存储 key */
  @Column({ name: 'compressed_key', type: 'varchar', nullable: true })
  compressedKey?: string | null;

  /** 压缩图体积（字节） */
  @Column({ name: 'compressed_size', type: 'int', default: 0 })
  compressedSize: number;

  /** 压缩图宽度（px） */
  @Column({ name: 'compressed_width', type: 'int', default: 0 })
  compressedWidth: number;

  /** 压缩图高度（px） */
  @Column({ name: 'compressed_height', type: 'int', default: 0 })
  compressedHeight: number;

  /** 压缩图 MIME */
  @Column({ name: 'compressed_mime', type: 'varchar', nullable: true })
  compressedMime?: string | null;

  /** 压缩质量 1–100 */
  @Column({ type: 'smallint', default: 80 })
  quality: number;

  /** 最大宽度（px），未限制则为 null */
  @Column({ name: 'max_width', type: 'int', nullable: true })
  maxWidth?: number | null;

  /** 最大高度（px），未限制则为 null */
  @Column({ name: 'max_height', type: 'int', nullable: true })
  maxHeight?: number | null;

  /** 输出格式：jpeg / webp / png */
  @Column({ name: 'output_format', type: 'varchar', default: 'webp' })
  outputFormat: string;

  /** 节省字节数 */
  @Column({ name: 'saved_bytes', type: 'int', default: 0 })
  savedBytes: number;

  /** 节省比例 0–1 */
  @Column({ name: 'saved_ratio', type: 'real', default: 0 })
  savedRatio: number;

  /** 任务状态 */
  @Column({ type: 'smallint', default: ImageProcessStatus.Success })
  status: ImageProcessStatus;

  /** 失败原因 */
  @Column({ name: 'error_message', type: 'varchar', nullable: true })
  errorMessage?: string | null;

  /** 创建时间 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  /** 更新时间 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  /** 创建人 ID */
  @Column({
    name: 'create_by',
    type: 'bigint',
    nullable: true,
    transformer: bigintTransformer,
  })
  createBy?: string | null;

  /** 更新人 ID */
  @Column({
    name: 'update_by',
    type: 'bigint',
    nullable: true,
    transformer: bigintTransformer,
  })
  updateBy?: string | null;

  /** 逻辑删除 */
  @Column({ type: 'boolean', default: false })
  deleted: boolean;
}
