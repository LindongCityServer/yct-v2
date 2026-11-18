/**
 * 让 node:test 直接跑 .tsx 原语测试的轻量注册器。
 *
 * 背景：仓库当前没有测试框架，且沙箱环境无法运行 tsx（esbuild 子进程被拦截）。
 * 这里用已安装的 TypeScript 编译器 API 在加载阶段转译 .ts/.tsx，不引入额外依赖。
 *
 * 用法：
 *   node --import ./scripts/ui-test-register.mjs --test apps/web/components/ui/__tests__
 */
import { register } from 'node:module';

register('./ui-test-loader.mjs', import.meta.url);
