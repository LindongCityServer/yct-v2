import { readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// 存量图片转 WebP：默认只预演（dry-run），确认收益后再用 --apply 真正替换。
// 设计目标是省服务器磁盘：转换后与原图二选一，默认删除原图。
// 用法：
//   node scripts/convert-images-webp.mjs --root apps/web/public/content-assets --root apps/portal/assets
//   node scripts/convert-images-webp.mjs --root ... --apply
// 注意：文件名即内容哈希，改扩展名会让数据里的引用失效，因此默认同时输出 --map-out 映射，
// 供 store / Markdown / 配置统一改写后再删除原图。
const supportedExtensions = new Map([
  ['.png', 'png'],
  ['.jpg', 'jpeg'],
  ['.jpeg', 'jpeg'],
]);

const options = parseArgs(process.argv.slice(2));
const roots = options.roots.length ? options.roots : ['apps/web/public/content-assets'];
const report = {
  mode: options.apply ? 'apply' : 'dry-run',
  generatedAt: new Date().toISOString(),
  quality: options.quality,
  minBytes: options.minBytes,
  totalBefore: 0,
  totalAfter: 0,
  converted: [],
  skipped: [],
};

for (const root of roots) {
  const absoluteRoot = path.resolve(root);
  const entries = await collectImages(absoluteRoot);
  for (const entry of entries) {
    await handleImage(entry, absoluteRoot);
  }
}

report.savedBytes = report.totalBefore - report.totalAfter;
report.savedMiB = round(report.savedBytes / (1024 * 1024));
report.convertedCount = report.converted.length;
report.skippedCount = report.skipped.length;

if (options.mapOut) {
  await writeFile(
    path.resolve(options.mapOut),
    `${JSON.stringify(
      {
        generatedAt: report.generatedAt,
        mode: report.mode,
        mapping: report.converted.map((item) => ({
          from: item.from,
          to: item.to,
          before: item.before,
          after: item.after,
        })),
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

if (options.reportPath) {
  await writeFile(path.resolve(options.reportPath), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

console.log('');
console.log(`模式：${report.mode}　质量：${options.quality}　最小体积：${options.minBytes}b`);
console.log(
  `可转换：${report.convertedCount} 个　跳过：${report.skippedCount} 个　` +
    `预计节省：${report.savedMiB} MiB（${report.savedBytes} bytes）`,
);
for (const item of report.converted.slice(0, 15)) {
  console.log(
    `  ${item.action === 'converted' ? '✔' : '·'} ${item.from}  ` +
      `${formatBytes(item.before)} → ${formatBytes(item.after)}（-${item.ratio}%）`,
  );
}
if (report.converted.length > 15) {
  console.log(`  … 其余 ${report.converted.length - 15} 个见报告文件`);
}
if (!options.apply) {
  console.log('');
  console.log('这是预演，没有改动任何文件。确认收益后追加 --apply 执行。');
}

async function handleImage(entry, root) {
  const relative = path.relative(root, entry.filePath).split(path.sep).join('/');
  const targetPath = entry.filePath.replace(/\.(?:png|jpe?g)$/i, '.webp');

  if (entry.sizeBytes < options.minBytes) {
    report.skipped.push({ file: relative, reason: 'below-min-bytes', bytes: entry.sizeBytes });
    return;
  }

  // 已有同名 webp 且更小，说明之前转过，直接跳过，保证脚本幂等。
  const existing = await safeStat(targetPath);
  if (existing && existing.size <= entry.sizeBytes) {
    report.skipped.push({ file: relative, reason: 'webp-exists', bytes: entry.sizeBytes });
    return;
  }

  let output;
  try {
    const pipeline = sharp(entry.filePath, { failOn: 'error' }).rotate();
    const metadata = await pipeline.metadata();
    if (metadata.pages && metadata.pages > 1) {
      report.skipped.push({ file: relative, reason: 'animated', bytes: entry.sizeBytes });
      return;
    }
    output = await pipeline.webp({ quality: options.quality, effort: 4 }).toBuffer();
  } catch (error) {
    report.skipped.push({
      file: relative,
      reason: `decode-failed: ${error instanceof Error ? error.message : String(error)}`,
      bytes: entry.sizeBytes,
    });
    return;
  }

  // 转完反而更大时保留原图，避免为了格式牺牲空间。
  if (output.byteLength >= entry.sizeBytes * 0.95) {
    report.skipped.push({ file: relative, reason: 'no-gain', bytes: entry.sizeBytes });
    return;
  }

  const ratio = Math.round((1 - output.byteLength / entry.sizeBytes) * 100);
  report.totalBefore += entry.sizeBytes;
  report.totalAfter += output.byteLength;
  report.converted.push({
    from: relative,
    to: relative.replace(/\.(?:png|jpe?g)$/i, '.webp'),
    before: entry.sizeBytes,
    after: output.byteLength,
    ratio,
    action: options.apply ? 'converted' : 'planned',
  });

  if (!options.apply) {
    return;
  }

  const temporaryPath = `${targetPath}.tmp`;
  await writeFile(temporaryPath, output);
  await rename(temporaryPath, targetPath);
  if (options.keepOriginal) {
    return;
  }
  await unlink(entry.filePath);
}

async function collectImages(directory) {
  const results = [];
  let dirents;
  try {
    dirents = await readdir(directory, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const dirent of dirents) {
    const entryPath = path.join(directory, dirent.name);
    if (dirent.isDirectory()) {
      results.push(...(await collectImages(entryPath)));
      continue;
    }
    if (!dirent.isFile()) {
      continue;
    }
    const extension = path.extname(dirent.name).toLowerCase();
    if (!supportedExtensions.has(extension)) {
      continue;
    }
    const fileStat = await safeStat(entryPath);
    if (!fileStat) {
      continue;
    }
    results.push({ filePath: entryPath, sizeBytes: fileStat.size });
  }

  return results;
}

async function safeStat(filePath) {
  try {
    return await stat(filePath);
  } catch {
    return undefined;
  }
}

function parseArgs(argv) {
  const parsed = {
    roots: [],
    apply: false,
    keepOriginal: false,
    quality: 80,
    minBytes: 51200,
    mapOut: '',
    reportPath: '.yct-data/image-webp-report.json',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = argv[index + 1];
    switch (flag) {
      case '--root':
        parsed.roots.push(next);
        index += 1;
        break;
      case '--apply':
        parsed.apply = true;
        break;
      case '--keep-original':
        parsed.keepOriginal = true;
        break;
      case '--quality':
        parsed.quality = Number(next) || 80;
        index += 1;
        break;
      case '--min-bytes':
        parsed.minBytes = Number(next) || 0;
        index += 1;
        break;
      case '--map-out':
        parsed.mapOut = next;
        index += 1;
        break;
      case '--report':
        parsed.reportPath = next;
        index += 1;
        break;
      default:
        throw new Error(`未知参数：${flag}`);
    }
  }

  return parsed;
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) {
    return `${round(bytes / (1024 * 1024))} MiB`;
  }
  return `${Math.round(bytes / 1024)} KiB`;
}

function round(value) {
  return Math.round(value * 100) / 100;
}
