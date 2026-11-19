# ─── 基础镜像：安装依赖 ─────────────────────────────────────────
FROM node:trixie-slim AS base

# 设置工作目录
WORKDIR /app

# 安装依赖（production + dev）
COPY package.json package-lock.json ./
# 使用 ci 保证锁文件一致性
RUN npm ci

# ─── 构建阶段：Next.js 构建 ───────────────────────────────────────
FROM base AS builder

# 拷贝全部源码
COPY . .

RUN cat package.json

# 执行 Next.js 构建（确保 package.json 中有 "build": "next build"）
RUN npm run build

# ─── 运行阶段：Standalone 输出 ────────────────────────────────────
FROM node:trixie-slim AS runner

WORKDIR /app

# 生产环境变量
ENV NODE_ENV=production
ENV PORT=3000
# Next.js standalone 的 server.js 用 process.env.HOSTNAME 作为监听地址。
# 容器运行时 HOSTNAME 通常被设成容器 id / 平台内部名字，不一定能解析，
# 会导致启动时 getaddrinfo ENOTFOUND 直接退出（表现为 502 / Application failed to respond）。
ENV HOSTNAME=0.0.0.0

# 拷贝构建产物
# public 静态资源
COPY --from=builder /app/public ./public
# standalone 输出目录（包含 server.js 和 package.json）
COPY --from=builder /app/.next/standalone ./
# Next.js 静态文件
COPY --from=builder /app/.next/static ./.next/static

# 开放端口
EXPOSE 3000

# 启动（在 shell 里强制覆盖 HOSTNAME，避免运行时注入的值把监听地址带偏）
CMD ["sh", "-c", "HOSTNAME=0.0.0.0 exec node server.js"]
