import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import ts from 'typescript';

const workspaceRoot = resolve(import.meta.dirname, '..');
const scanRoots = [join(workspaceRoot, 'apps', 'web'), join(workspaceRoot, 'packages')];
const fontDirectory = join(workspaceRoot, 'apps', 'web', 'app', 'fonts', 'material-symbols');
const fontPath = join(fontDirectory, 'MaterialSymbolsOutlined.woff2');
const manifestPath = join(fontDirectory, 'manifest.json');
const materialSymbolsCssUrl =
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200';
const browserUserAgent =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36';
const maximumFontBytes = 512 * 1024;
const iconNamePattern = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;
const shortIconNamePattern = /^[a-z][a-z0-9]{2,}$/;

const ignoredDirectoryNames = new Set(['.next', 'node_modules', '.git']);
const sourceFileExtensions = new Set(['.js', '.jsx', '.ts', '.tsx', '.json']);
const iconPropertyNames = new Set(['icon', 'iconName', 'symbolIcon', 'fallbackIcon', 'markerIcon']);

async function main() {
  const iconNames = await collectMaterialSymbolNames();
  if (iconNames.size === 0) {
    throw new Error('没有扫描到 Material Symbols 图标名，已停止覆盖现有字体。');
  }

  const sortedIconNames = [...iconNames].sort();
  if (process.argv.includes('--check')) {
    await validateMaterialSymbolManifest(sortedIconNames);
    console.log(`Material Symbols 清单校验通过，共 ${sortedIconNames.length} 个图标。`);
    return;
  }

  const requestUrl = `${materialSymbolsCssUrl}&icon_names=${sortedIconNames.join(',')}`;
  const css = await fetchText(requestUrl);
  const fontUrl = css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/)?.[1];
  if (!fontUrl || !css.includes("format('woff2')")) {
    throw new Error('Google Fonts 没有返回可用的 WOFF2 子集，请检查 User-Agent 或接口参数。');
  }

  const fontResponse = await fetch(fontUrl);
  if (!fontResponse.ok) {
    throw new Error(`下载 Material Symbols 字体失败：HTTP ${fontResponse.status}`);
  }
  const fontBytes = Buffer.from(await fontResponse.arrayBuffer());
  if (fontBytes.length > maximumFontBytes) {
    throw new Error(
      `生成的 Material Symbols 子集为 ${fontBytes.length} 字节，超过 ${maximumFontBytes} 字节上限；请检查扫描范围或拆分图标策略。`,
    );
  }

  await mkdir(fontDirectory, { recursive: true });
  await writeFile(fontPath, fontBytes);
  const manifest = JSON.stringify(
    {
      family: 'Material Symbols Outlined',
      axes: 'opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200',
      source: materialSymbolsCssUrl,
      iconCount: sortedIconNames.length,
      icons: sortedIconNames,
      fontBytes: fontBytes.length,
    },
    null,
    2,
  );
  await writeFile(manifestPath, `${manifest.replace(/\n/g, '\r\n')}\r\n`, 'utf8');

  console.log(
    `已同步 ${sortedIconNames.length} 个 Material Symbols 图标，字体大小 ${fontBytes.length} 字节。`,
  );
}

async function validateMaterialSymbolManifest(sortedIconNames) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(
      `Material Symbols manifest.json 不可读，请先运行 pnpm icons:material-symbols:sync；${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const expected = JSON.stringify(sortedIconNames);
  const actual = JSON.stringify(Array.isArray(manifest.icons) ? manifest.icons : []);
  if (expected !== actual) {
    const expectedSet = new Set(sortedIconNames);
    const actualSet = new Set(Array.isArray(manifest.icons) ? manifest.icons : []);
    const missing = sortedIconNames.filter((iconName) => !actualSet.has(iconName));
    const extra = [...actualSet].filter((iconName) => !expectedSet.has(iconName));
    throw new Error(
      `Material Symbols 清单与源码不一致。缺少：${missing.join(', ') || '无'}；多余：${extra.join(', ') || '无'}。请运行 pnpm icons:material-symbols:sync。`,
    );
  }

  const fontStats = await stat(fontPath);
  if (manifest.fontBytes !== fontStats.size) {
    throw new Error(
      `Material Symbols 字体大小与 manifest.json 不一致（文件 ${fontStats.size}，清单 ${manifest.fontBytes}），请重新同步。`,
    );
  }
}

async function collectMaterialSymbolNames() {
  const names = new Set();
  for (const root of scanRoots) {
    await scanDirectory(root, names);
  }
  return names;
}

async function scanDirectory(directory, names) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignoredDirectoryNames.has(entry.name)) {
      continue;
    }
    const filePath = join(directory, entry.name);
    if (filePath === manifestPath) {
      continue;
    }
    if (entry.isDirectory()) {
      await scanDirectory(filePath, names);
      continue;
    }
    if (!sourceFileExtensions.has(extname(entry.name).toLowerCase())) {
      continue;
    }

    const source = await readFile(filePath, 'utf8');
    if (entry.name.endsWith('.json')) {
      collectJsonIconNames(source, filePath, names);
    } else {
      collectTypeScriptIconNames(source, filePath, names);
    }

    // 现有 SVG 资产也属于 Material Symbols 的可复用图标来源。
    if (entry.name.endsWith('.svg') && iconNamePattern.test(basename(entry.name, '.svg'))) {
      names.add(basename(entry.name, '.svg'));
    }
  }
}

function collectTypeScriptIconNames(source, filePath, names) {
  const scriptKind =
    filePath.endsWith('.tsx') || filePath.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );

  function visit(node) {
    if (ts.isJsxElement(node)) {
      if (hasMaterialSymbolClass(node.openingElement)) {
        collectJsxIconChildren(node.children, names);
      }
      collectJsxIconAttributes(node.openingElement.attributes, names);
    } else if (ts.isJsxSelfClosingElement(node)) {
      if (isMaterialSymbolComponent(node)) {
        collectJsxAttributeValue(node.attributes, 'name', names);
      }
      collectJsxIconAttributes(node.attributes, names);
    }

    if (ts.isPropertyAssignment(node) && isIconPropertyName(node.name)) {
      collectStaticIconStrings(node.initializer, names);
    }
    if (ts.isVariableDeclaration(node) && isIconVariableName(node.name)) {
      collectStaticIconStrings(node.initializer, names);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

function collectJsonIconNames(source, filePath, names) {
  try {
    const value = JSON.parse(source);
    collectJsonIconValue(value, false, names);
  } catch (error) {
    throw new Error(
      `无法解析图标扫描用 JSON：${filePath}；${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function collectJsonIconValue(value, inIconField, names) {
  if (typeof value === 'string') {
    if (inIconField) {
      addIconName(value, names);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectJsonIconValue(item, inIconField, names);
    }
    return;
  }
  if (!value || typeof value !== 'object') {
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    collectJsonIconValue(item, isIconPropertyNameText(key), names);
  }
}

function hasMaterialSymbolClass(element) {
  return element.attributes.properties.some((attribute) => {
    if (!ts.isJsxAttribute(attribute) || attribute.name.text !== 'className') {
      return false;
    }
    return attribute.initializer?.getText().includes('material-symbols-outlined') ?? false;
  });
}

function isMaterialSymbolComponent(element) {
  return element.tagName.getText() === 'MaterialSymbol';
}

function collectJsxAttributeValue(attributes, attributeName, names) {
  for (const attribute of attributes.properties) {
    if (!ts.isJsxAttribute(attribute) || attribute.name.text !== attributeName) {
      continue;
    }
    if (attribute.initializer) {
      collectStaticIconStrings(attribute.initializer, names);
    }
  }
}

function collectJsxIconAttributes(attributes, names) {
  for (const attribute of attributes.properties) {
    if (!ts.isJsxAttribute(attribute) || !isIconPropertyNameText(attribute.name.text)) {
      continue;
    }
    if (attribute.initializer) {
      collectStaticIconStrings(attribute.initializer, names);
    }
  }
}

function collectJsxIconChildren(children, names) {
  for (const child of children) {
    if (ts.isJsxText(child)) {
      for (const token of child.text.split(/\s+/u)) {
        addIconName(token, names);
      }
      continue;
    }
    if (ts.isJsxExpression(child)) {
      collectStaticIconStrings(child.expression, names);
      continue;
    }
    if (ts.isJsxElement(child)) {
      collectJsxIconChildren(child.children, names);
    }
  }
}

function collectStaticIconStrings(node, names) {
  if (!node) {
    return;
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    addIconName(node.text, names);
    return;
  }
  ts.forEachChild(node, (child) => collectStaticIconStrings(child, names));
}

function isIconPropertyName(node) {
  return ts.isIdentifier(node) || ts.isStringLiteral(node)
    ? isIconPropertyNameText(node.text)
    : false;
}

function isIconPropertyNameText(value) {
  return iconPropertyNames.has(value);
}

function isIconVariableName(node) {
  if (!ts.isIdentifier(node)) {
    return false;
  }
  return /(?:icon|symbol)/iu.test(node.text);
}

function addIconName(value, names) {
  const candidate = value.trim().toLowerCase();
  if (iconNamePattern.test(candidate) || shortIconNamePattern.test(candidate)) {
    names.add(candidate);
  }
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'User-Agent': browserUserAgent } });
  if (!response.ok) {
    throw new Error(`请求 Google Fonts 子集失败：HTTP ${response.status}`);
  }
  return response.text();
}

await main();
