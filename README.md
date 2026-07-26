# knowledge-hub-backend

Agent 知识库后端项目。

---

## 双 Token 登录（笔记）

### 模型

| Token | 形态 | 存哪 | 寿命（默认） |
|-------|------|------|--------------|
| **Access** | JWT（`type=access`，含 `sub` / `ver`） | 不落库；前端内存或短期存储，请求头带 `Authorization: Bearer ...` | `JWT_ACCESS_EXPIRES`（如 2h） |
| **Refresh** | JWT（`type=refresh`，含 `sub` / `ver` / `jti`） | 明文只发给客户端一次；服务端 Redis：`auth:refresh:{jti}` | `JWT_REFRESH_EXPIRES`（如 7d），Redis TTL 对齐 `JWT_REFRESH_TTL_SECONDS` |

- `jti`：本次 Refresh 会话的唯一 ID（雪花），用来在 Redis 里定位会话。
- `ver`：对应用户表 `kh_user.token_version`。改密 / 强制下线时 +1，旧 Token 的 `ver` 对不上即失效。
- 同一用户可多端同时在线（每次登录一条 Redis 会话）；`logout` 只删当前这条 `jti`。

### 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/auth/register` | 只建账号，**不**发 Token；成功后再调 login |
| `POST` | `/auth/login` | 验密 → 写 Redis → 返回 `accessToken` + `refreshToken` |
| `POST` | `/auth/refresh` | 校验 Refresh + Redis → **旋转**（删旧发新）→ 新双 Token |
| `POST` | `/auth/logout` | 用 `refreshToken` 删 Redis 会话（幂等） |

业务接口默认走全局 `JwtAuthGuard`（验 Access 签名 / 过期 / `type=access`，**暂不**比对 `token_version`）。公开接口标 `@Public()`：`/auth/register|login|refresh|logout`、根路径 `GET /`。Controller 可用 `@CurrentUser()` 取 `{ id, ver }`。


### 流程

```
注册 ──► POST /auth/register ──► 仅返回用户基本信息
         │
登录 ──► POST /auth/login
         │         校验密码
         │         签发 Access + Refresh(jti)
         │         Redis SET auth:refresh:{jti} = { userId, ver } + TTL
         │         更新 last_login_at / ip
         ▼
业务 ──► 请求头带 Access ──► Guard 验 JWT（+ ver）
         │
Access 过期
         │
刷新 ──► POST /auth/refresh { refreshToken }
         │         验 Refresh JWT
         │         Redis 有该 jti？无 → 401 重登
         │         有 → DEL 旧 jti（旋转）→ 再签发新一对
         ▼
登出 ──► POST /auth/logout { refreshToken }
         │         DEL auth:refresh:{jti}
         │         Access 靠短过期自然失效（可不入黑名单）
```

### 强制失效（踢人 / 改密）

1. `kh_user.token_version = token_version + 1` → 旧 Access / 旧 Refresh 的 `ver` 全部失效  
2. （建议）删除该用户在 Redis 中的全部 Refresh 会话 → Refresh 立刻不能再刷  

说明：服务端「踢掉」只是凭证失效；前端要等下次调接口收到 401（或 refresh 失败）再跳登录页。

### 前端存 Token（建议）

- Access：内存（或短期 sessionStorage）+ `Authorization` 头  
- Refresh：优先 **HttpOnly Cookie**；若暂存前端，慎用长期 localStorage（XSS 可被读走）  
- 本地删掉 Refresh ≠ 服务端已登出；没有 Refresh 时无法精确调 `logout` 删会话，只能靠 TTL / `token_version` 失效  

### 相关配置（`.env`）

```
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
JWT_ACCESS_EXPIRES=2h
JWT_REFRESH_EXPIRES=7d
JWT_REFRESH_TTL_SECONDS=604800
```

生产环境务必更换 secret。
