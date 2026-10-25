/**
 * 清洗 MasterGo 导出的 SVG。
 *
 * MasterGo 导出时会把轮廓蒙版写成 `mask-type:luminance` + 纯黑矩形，
 * 并且常常把「下部背景」矩形绘制到内容之后、把顶层裁切固定成头部组件的尺寸。
 * 这三点会让浏览器/服务端渲染器只看到一块纯色。
 *
 * 用法：
 *   node scripts/clean-mastergo-svg.mjs <输入.svg> <输出.svg>
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  throw new Error('用法：node scripts/clean-mastergo-svg.mjs <输入.svg> <输出.svg>');
}

const source = readFileSync(inputPath, 'utf8');
const viewBoxMatch = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(source);
if (!viewBoxMatch) {
  throw new Error('未找到 viewBox="0 0 <宽> <高>"，无法确定画板尺寸。');
}
const [, viewBoxWidth, viewBoxHeight] = viewBoxMatch;

let cleaned = source
  // 1. 移除蒙版引用与定义：MasterGo 的轮廓蒙版导出后内容会被整层抹掉。
  .replaceAll(/\s*mask="url\(#[^"]+\)"/g, '')
  .replace(/<mask\b[^>]*>[\s\S]*?<\/mask>/g, '')
  // 2. 顶层裁切展开到整个 viewBox：MasterGo 会沿用头部组件的 0 0 128 46。
  .replace(
    /(<clipPath id="master_svg0_[^"]+"><rect x="0" y="0" width=")[\d.]+(" height=")[\d.]+(")/g,
    `$1${viewBoxWidth}$2${viewBoxHeight}$3`,
  );

// 3. 移除绘制在内容之后、覆盖下半张画板的纯色背景矩形。
cleaned = cleaned.replace(/<rect\b[^>]*\/>/g, (rect) => {
  const x = readNumberAttribute(rect, 'x');
  const y = readNumberAttribute(rect, 'y');
  const width = readNumberAttribute(rect, 'width');
  const height = readNumberAttribute(rect, 'height');
  const hasFill = /\sfill="#[0-9a-fA-F]{3,8}"/.test(rect);
  const coversLowerHalf =
    x === 0 &&
    Math.abs(width - Number(viewBoxWidth)) < 0.01 &&
    y > 0 &&
    y + height >= Number(viewBoxHeight) * 0.5;
  return hasFill && coversLowerHalf ? '' : rect;
});

// 4. 顶部改成「一段弧 + 三条直角边」的拱形：MasterGo 导出的圆角矩形顶棚会被裁成平顶。
const roundedTopPath =
  'M-6 35C-5.9999999999999964 15.670033755922226 9.670033755922237 -1.962109585316772e-15 29.000000000000004 0L99 0C118.32996624407777 0 134 15.670033755922233 134 35L134 70C134 70 134 70 134 70L-6 70C-6 70 -6 70 -6 70Z';
const archTopPath = `M0 35A76.014 76.014 0 0 1 ${viewBoxWidth} 35L${viewBoxWidth} 70L0 70Z`;
cleaned = cleaned.replaceAll(roundedTopPath, archTopPath);

// 5. 去掉设计稿里水平排列的「公交车站」文字：拱形上已经用弧形文字表达，
//    这层水平文字会被站名白框遮住一半，导出后会在白框上沿露出残影。
cleaned = cleaned.replace(/<path\b[^>]*fill="#FFFFFF"[^>]*\/>/g, (path) => {
  if (/\stransform=/.test(path)) {
    return path;
  }
  const data = /\sd="([^"]+)"/.exec(path)?.[1];
  if (!data) {
    return path;
  }
  const bounds = readPathBounds(data);
  const isHorizontalCaption =
    bounds.minX < 40 && bounds.maxX > 90 && bounds.minY > 30 && bounds.maxY < 50;
  return isHorizontalCaption ? '' : path;
});

writeFileSync(outputPath, cleaned, 'utf8');

const removedMasks = (source.match(/<mask\b/g) ?? []).length;
console.log(
  `已清洗 ${inputPath}\n  viewBox: ${viewBoxWidth} × ${viewBoxHeight}\n  移除蒙版: ${removedMasks} 个\n  输出: ${outputPath}`,
);

function readNumberAttribute(tag, name) {
  const match = new RegExp(`\\s${name}="(-?[\\d.]+)"`).exec(tag);
  return match ? Number(match[1]) : Number.NaN;
}

/** 粗略求 path 的包围盒，只用于识别「横跨画板的中文标语」这类大块路径。 */
function readPathBounds(data) {
  const numbers = (data.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const xs = [];
  const ys = [];
  numbers.forEach((value, index) => (index % 2 === 0 ? xs : ys).push(value));
  if (!xs.length || !ys.length) {
    return { maxX: Number.NaN, maxY: Number.NaN, minX: Number.NaN, minY: Number.NaN };
  }
  return {
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
    minX: Math.min(...xs),
    minY: Math.min(...ys),
  };
}
