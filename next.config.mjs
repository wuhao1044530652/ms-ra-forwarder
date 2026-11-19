/** @type {import('next').NextConfig} */
const nextConfig = {
    // standalone 只用于 Docker / 自托管（Dockerfile 依赖它生成 server.js）。
    // 在 Vercel 上必须关闭：standalone 会改变构建产物的结构，Vercel 的路由层匹配不到页面，
    // 表现为构建成功、状态 READY，但访问任何路径都是 404 NOT_FOUND。
    // Vercel 构建时会注入 VERCEL=1，据此自动区分两种部署环境。
    ...(process.env.VERCEL ? {} : { output: "standalone" }),
};

export default nextConfig;
