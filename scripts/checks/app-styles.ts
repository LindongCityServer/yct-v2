import { readdirSync, readFileSync } from 'node:fs';

const stylesUrl = new URL('../../apps/web/app/styles/', import.meta.url);

/**
 * 读取按顺序拆分的全局样式。
 *
 * 2026-11 起 `apps/web/app/globals.css` 只剩一句拆分说明，实际规则在
 * `apps/web/app/styles/*.css` 中由 layout.tsx 逐个 import。校验脚本必须读
 * 拆分后的完整样式表，否则所有基于 globals.css 的断言都会静默失效。
 */
export function readAppStyles(): string {
  return readdirSync(stylesUrl)
    .filter((name) => name.endsWith('.css'))
    .sort()
    .map((name) => readFileSync(new URL(name, stylesUrl), 'utf8'))
    .join('\n');
}
