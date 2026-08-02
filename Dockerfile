# ----------------------------
# 1. 安装依赖
# ----------------------------
  FROM node:24.13.0-bookworm-slim AS dependencies

  WORKDIR /app
  
  COPY package.json package-lock.json ./
  
  RUN npm ci
  
  
  # ----------------------------
  # 2. 构建 NestJS
  # ----------------------------
  FROM dependencies AS builder
  
  WORKDIR /app
  
  COPY . .
  
  RUN npm run build
  
  # 删除 devDependencies，只保留生产依赖
  RUN npm prune --omit=dev
  
  
  # ----------------------------
  # 3. 运行阶段
  # ----------------------------
  FROM node:24.13.0-bookworm-slim AS runner
  
  WORKDIR /app
  
  ENV NODE_ENV=production
  
  COPY --from=builder --chown=node:node /app/package.json ./
  COPY --from=builder --chown=node:node /app/package-lock.json ./
  COPY --from=builder --chown=node:node /app/node_modules ./node_modules
  COPY --from=builder --chown=node:node /app/dist ./dist
  
  USER node
  
  EXPOSE 3001
  
  CMD ["node", "dist/main.js"]