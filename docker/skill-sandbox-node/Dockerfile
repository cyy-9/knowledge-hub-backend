# Skill 脚本沙箱镜像（Phase 1）
# 最小 Node 运行时，用于隔离执行 scripts/*.js
FROM node:24-alpine

WORKDIR /skill

# 非 root 运行
USER node

# 默认入口由 docker run 传入：node <script-path> [args...]
CMD ["node", "--version"]
