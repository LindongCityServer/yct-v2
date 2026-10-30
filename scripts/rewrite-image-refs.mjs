import { copyFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// 把图片转换后的扩展名变化同步到运行时 store / 内容 Markdown。
// 默认 dry-run，只统计会替换多少处；--apply 才写回（并保留 .bak 备份）。
// 用法：
//   node scripts/rewrite-image-refs.mjs --map .yct-data/webp-map.json `
//     --store .yct-data/content-store.json --store .yct-data/content-asset-store.json `
//     --store .yct-data/poi-submission-store.json
const options = parseArgs(process.argv.slice(2));

if (!options.mapFiles.length) {
  throw new Error('缺少 --map 参数：请指向 convert-images-webp.mjs 生成的映射文件。');
}

const mapping = [];
for (const mapFile of options.mapFiles) {
  const rawMap = JSON.parse(await readFile(path.resolve(mapFile), 'utf8'));
  mapping.push(...(rawMap.mapping ?? []));
}

const entries = mapping
  .map((item) => ({
    fromPath: normalize(item.from),
    toPath: normalize(item.to),
    before: item.before,
    after: item.after,
  }))
  .sort((left, right) => right.fromPath.length - left.fromPath.length)
  .map((entry) => {
    const source = `(?<![A-Za-z0-9_-])${escapeRegExp(entry.fromPath)}(?![A-Za-z0-9_-])`;
    return {
      ...entry,
      pattern: new RegExp(source, 'g'),
      testPattern: new RegExp(source),
    };
  });

if (!entries.length) {
  throw new Error('映射文件里没有可用的转换记录。');
}

const summary = [];

for (const storePath of options.stores) {
  const absolutePath = path.resolve(storePath);
  let raw;
  try {
    raw = await readFile(absolutePath, 'utf8');
  } catch {
    summary.push({ store: storePath, status: 'missing' });
    continue;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    summary.push({
      store: storePath,
      status: `parse-failed: ${error instanceof Error ? error.message : String(error)}`,
    });
    continue;
  }

  const stats = { strings: 0, mime: 0, sizeBytes: 0 };
  const next = rewriteValue(data, stats, 0);

  summary.push({
    store: storePath,
    status: 'ok',
    replacements: stats.strings,
    mimeUpdates: stats.mime,
    sizeUpdates: stats.sizeBytes,
  });

  if (options.apply && stats.strings > 0) {
    await copyFile(absolutePath, `${absolutePath}.bak`);
    await writeFile(absolutePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  }
}

console.log('');
console.log(`模式：${options.apply ? 'apply' : 'dry-run'}`);
for (const item of summary) {
  if (item.status !== 'ok') {
    console.log(`  ${item.store} → ${item.status}`);
    continue;
  }
  console.log(
    `  ${item.store} → 替换 ${item.replacements} 处，mime ${item.mimeUpdates} 处，` +
      `体积字段 ${item.sizeUpdates} 处`,
  );
}
if (!options.apply) {
  console.log('');
  console.log('这是预演，没有改动任何文件。确认后再追加 --apply。');
}

function rewriteValue(value, stats, depth) {
  if (depth > 24) {
    return value;
  }
  if (typeof value === 'string') {
    const resolved = rewriteString(value);
    if (resolved !== value) {
      stats.strings += 1;
    }
    return resolved;
  }
  if (Array.isArray(value)) {
    return value.map((item) => rewriteValue(item, stats, depth + 1));
  }
  if (value && typeof value === 'object') {
    const next = {};
    for (const [key, item] of Object.entries(value)) {
      next[key] = rewriteValue(item, stats, depth + 1);
    }

    // 扩展名变了，同一条记录的 fileName / MIME / 体积也要跟着变，
    // 否则后台按 store 读元数据时会与磁盘上的文件不一致。
    const publicPath = typeof value.publicPath === 'string' ? value.publicPath : '';
    const matched = publicPath
      ? entries.find((entry) => entry.testPattern.test(publicPath))
      : undefined;
    if (matched) {
      if (typeof value.fileName === 'string') {
        next.fileName = path.posix.basename(matched.toPath);
      }
      if (Object.hasOwn(value, 'mimeType')) {
        next.mimeType = 'image/webp';
        stats.mime += 1;
      }
      if (Object.hasOwn(value, 'sizeBytes') && matched.after) {
        next.sizeBytes = matched.after;
        stats.sizeBytes += 1;
      }
    }
    return next;
  }
  return value;
}

function rewriteString(value) {
  let result = value;
  for (const entry of entries) {
    if (!result.includes(entry.fromPath)) {
      continue;
    }
    result = result.replace(entry.pattern, entry.toPath);
  }
  return result;
}

function parseArgs(argv) {
  const parsed = { mapFiles: [], stores: [], apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = argv[index + 1];
    switch (flag) {
      case '--map':
        parsed.mapFiles.push(next);
        index += 1;
        break;
      case '--store':
        parsed.stores.push(next);
        index += 1;
        break;
      case '--apply':
        parsed.apply = true;
        break;
      default:
        throw new Error(`未知参数：${flag}`);
    }
  }
  if (!parsed.stores.length) {
    parsed.stores = [
      '.yct-data/content-store.json',
      '.yct-data/content-asset-store.json',
      '.yct-data/poi-submission-store.json',
    ];
  }
  return parsed;
}

function normalize(value) {
  return String(value).split('\\').join('/');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
