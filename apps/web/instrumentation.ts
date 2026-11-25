/**
 * Next.js 服务启动钩子。
 *
 * 这里**不要** import `qq-bot-material` / `material-renderer` 等带原生模块的链路：
 * Next dev 会为 Edge / 浏览器 instrumentation 再编译一次该入口，webpack 会把
 * `@resvg/resvg-js` 的 `.node` 二进制当成浏览器模块处理，启动时直接报
 * “Node.js binary module ... is not supported in the browser”。
 *
 * 物料候选池仍由 `/api/qq-bot/materials/render` 首次请求惰性预热，不影响出图。
 */
export async function register(): Promise<void> {
  // 启动阶段不再做任何原生模块导入。
}
