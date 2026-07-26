import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigintTransformer } from '../../../common/transformers/bigint.transformer';

/** 用户状态 */
export enum UserStatus {
  /** 正常 */
  Active = 0,
  /** 禁用 */
  Disabled = 1,
  /** 锁定 */
  Locked = 2,
}

/** 用户（PostgreSQL kh_user） */
@Entity('kh_user')
export class UserEntity {
  /** 雪花 ID */
  @PrimaryColumn({ type: 'bigint', transformer: bigintTransformer })
  id: string;

  /** 登录名 */
  @Column({ type: 'varchar', unique: true })
  username: string;

  /** 邮箱 */
  @Column({ type: 'varchar', unique: true, nullable: true })
  email?: string | null;

  /** 密码哈希（bcrypt / argon2） */
  @Column({ name: 'password_hash', type: 'varchar' })
  passwordHash: string;

  /** 展示名 */
  @Column({ type: 'varchar', nullable: true })
  nickname?: string | null;

  /** 头像 URL */
  @Column({ type: 'varchar', nullable: true })
  avatar?: string | null;

  /** 状态：0 正常 / 1 禁用 / 2 锁定 */
  @Column({ type: 'smallint', default: UserStatus.Active })
  status: UserStatus;

  /** 最近登录时间 */
  @Column({ name: 'last_login_at', type: 'timestamp', nullable: true })
  lastLoginAt?: Date | null;

  /** 最近登录 IP */
  @Column({ name: 'last_login_ip', type: 'varchar', nullable: true })
  lastLoginIp?: string | null;

  /**
   * Token 版本号。
   * 改密 / 强制下线时递增；Access JWT 携带 ver，不一致则视为失效。
   */
  @Column({ name: 'token_version', type: 'int', default: 0 })
  tokenVersion: number;

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
