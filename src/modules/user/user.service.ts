import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { nextSnowflakeId } from '../../common/snowflake-id';
import { UserEntity, UserStatus } from './entities/user.entity';

/** 创建用户入参（password 已在外层哈希） */
export interface CreateUserInput {
  username: string;
  passwordHash: string;
  nickname?: string;
}

/** 用户数据访问：供 Auth 等模块通过 UserService 使用，不直接暴露 Repository */
@Injectable()
export class UserService {
  constructor(
    @InjectEntityManager()
    private readonly em: EntityManager,
  ) {}

  /** 按用户名查未删除用户 */
  async findByUsername(username: string): Promise<UserEntity | null> {
    return this.em.findOne(UserEntity, {
      where: { username, deleted: false },
    });
  }

  /** 按 ID 查状态正常且未删除的用户 */
  async findActiveById(id: string): Promise<UserEntity | null> {
    return this.em.findOne(UserEntity, {
      where: { id, deleted: false, status: UserStatus.Active },
    });
  }

  /** 创建用户 */
  async create(input: CreateUserInput): Promise<UserEntity> {
    const user = this.em.create(UserEntity, {
      id: nextSnowflakeId(),
      username: input.username,
      passwordHash: input.passwordHash,
      nickname: input.nickname ?? null,
      status: UserStatus.Active,
      tokenVersion: 0,
      deleted: false,
    });
    return this.em.save(user);
  }

  /** 更新最近登录时间 / IP */
  async touchLogin(id: string, ip?: string): Promise<void> {
    await this.em.update(UserEntity, id, {
      lastLoginAt: new Date(),
      lastLoginIp: ip ?? null,
    });
  }
}
