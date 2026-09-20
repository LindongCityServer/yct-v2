import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const web = join(root, 'apps/web');
const devDirectory = join(web, 'app/dev/controls');
const outputPath = join(devDirectory, 'controls-inventory.json');
const registry = JSON.parse(await readFile(join(devDirectory, 'controls-registry.json'), 'utf8'));
const modules = new Map();
const normalize = (value) => value.replaceAll('\\', '/');
const relativePath = (value) => normalize(relative(root, value));
const nativeControls = new Set([
  'a',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  'details',
  'dialog',
  'progress',
  'meter',
  'fieldset',
]);

async function scan(directory) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name, 'en'),
  )) {
    if (['node_modules', '.next', 'fonts'].includes(entry.name)) continue;
    const file = join(directory, entry.name);
    if (entry.isDirectory()) await scan(file);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      const source = await readFile(file, 'utf8');
      const ast = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
        /\.[jt]sx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      modules.set(file, { ast, dependencies: new Set(), controls: [], ids: [] });
    }
  }
}

// 只取可能产生属性值的分支，不把条件表达式中的业务字符串误认为类名。
function values(node) {
  if (!node) return [];
  if (ts.isStringLiteralLike(node)) return [node.text];
  if (ts.isJsxExpression(node)) return values(node.expression);
  if (ts.isConditionalExpression(node))
    return [...values(node.whenTrue), ...values(node.whenFalse)];
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) return values(node.expression);
  if (ts.isBinaryExpression(node))
    return node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
      ? values(node.right)
      : [...values(node.left), ...values(node.right)];
  if (ts.isTemplateExpression(node))
    return [
      node.head.text,
      ...node.templateSpans.flatMap((span) => [...values(span.expression), span.literal.text]),
    ];
  if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap(values);
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression))
    return values(node.expression.expression);
  return [];
}

function resolveDependency(file, specifier) {
  if (!specifier.startsWith('.')) return undefined;
  const base = resolve(dirname(file), specifier);
  return [
    base,
    ...['.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts'].map((suffix) => base + suffix),
  ].find((candidate) => modules.has(candidate));
}

function ownerOf(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isFunctionDeclaration(parent) && parent.name) return parent.name.text;
    if (
      ts.isVariableDeclaration(parent) &&
      ts.isIdentifier(parent.name) &&
      /^[A-Z]/.test(parent.name.text)
    )
      return parent.name.text;
  }
  return 'default';
}

await scan(join(web, 'app'));
await scan(join(web, 'components'));
await scan(join(web, 'lib'));

for (const [file, record] of modules) {
  const { ast } = record;
  const grouped = new Map();
  function visit(node) {
    let specifier;
    if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly)
      specifier = node.moduleSpecifier;
    if (ts.isExportDeclaration(node) && !node.isTypeOnly) specifier = node.moduleSpecifier;
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)
      specifier = node.arguments[0];
    if (specifier && ts.isStringLiteral(specifier)) {
      const dependency = resolveDependency(file, specifier.text);
      if (dependency) record.dependencies.add(dependency);
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const element = node.tagName.getText(ast);
      const attributes = new Map(
        node.attributes.properties
          .filter(ts.isJsxAttribute)
          .map((attribute) => [attribute.name.getText(ast), attribute.initializer]),
      );
      const classNames = [
        ...new Set(
          values(attributes.get('className'))
            .flatMap((value) => value.split(/\s+/))
            .filter(Boolean),
        ),
      ].sort();
      const roles = values(attributes.get('role'));
      record.ids.push(...values(attributes.get('id')));
      const component = /^[A-Z]/.test(element);
      if (nativeControls.has(element) || component || classNames.length || roles.length) {
        const types = values(attributes.get('type'));
        const owner = ownerOf(node);
        const states = [...attributes.keys()]
          .filter((name) =>
            [
              'disabled',
              'readOnly',
              'required',
              'checked',
              'aria-busy',
              'aria-invalid',
              'aria-expanded',
              'aria-selected',
              'aria-pressed',
            ].includes(name),
          )
          .sort();
        const kind = component ? 'component' : nativeControls.has(element) ? 'control' : 'surface';
        const key = JSON.stringify([owner, element, classNames, roles, types, states]);
        const line = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
        const previous = grouped.get(key);
        if (previous) previous.lines.push(line);
        else
          grouped.set(key, {
            owner,
            element,
            kind,
            classes: classNames,
            roles,
            types,
            states,
            lines: [line],
          });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  record.controls = [...grouped.values()];
}

function reachable(seeds) {
  const visited = new Set();
  function walk(file) {
    if (visited.has(file) || !modules.has(file)) return;
    visited.add(file);
    for (const dependency of modules.get(file).dependencies) walk(dependency);
  }
  seeds.forEach(walk);
  return visited;
}

const app = join(web, 'app');
const businessPages = [...modules.keys()]
  .filter((file) => file.startsWith(app + '/') || file.startsWith(app + '\\'))
  .filter(
    (file) => file.endsWith('page.tsx') && !relativePath(file).startsWith('apps/web/app/dev/'),
  );
const routes = businessPages
  .map((file) => {
    const seeds = [file];
    for (let directory = dirname(file); directory.startsWith(app); directory = dirname(directory)) {
      for (const name of [
        'layout.tsx',
        'template.tsx',
        'loading.tsx',
        'error.tsx',
        'not-found.tsx',
      ]) {
        const boundary = join(directory, name);
        if (modules.has(boundary)) seeds.push(boundary);
      }
      if (directory === app) break;
    }
    const pathname = normalize(relative(app, dirname(file)))
      .split('/')
      .filter((segment) => segment && !/^\(.*\)$/.test(segment))
      .join('/');
    return {
      path: '/' + pathname,
      source: relativePath(file),
      files: [...reachable(seeds)]
        .filter((item) => modules.get(item).controls.length)
        .map(relativePath)
        .sort(),
    };
  })
  .sort((a, b) => a.path.localeCompare(b.path, 'en'));

const previewFiles = reachable([join(devDirectory, 'page.tsx')]);
const productionFiles = new Set(routes.flatMap((route) => route.files));
const sectionIds = new Set(registry.sections.map((section) => section.id));
if (sectionIds.size !== registry.sections.length) throw new Error('展示板分区 ID 重复');
for (const section of registry.sections) {
  const count = [...previewFiles].reduce(
    (total, file) => total + modules.get(file).ids.filter((id) => id === section.id).length,
    0,
  );
  if (count !== 1) throw new Error(`展示板分区必须有且仅有一个真实锚点：${section.id}`);
}
const inputTypes = (files) =>
  new Set(
    [...files].flatMap((file) =>
      modules
        .get(file)
        .controls.filter((control) => control.element === 'input')
        .flatMap((control) => (control.types.length ? control.types : ['text'])),
    ),
  );
const previewInputTypes = inputTypes(previewFiles);
const missingInputTypes = [
  ...inputTypes([...productionFiles].map((file) => join(root, file))),
].filter((type) => !previewInputTypes.has(type));
if (missingInputTypes.length)
  throw new Error(`展示板缺少原生输入类型：${missingInputTypes.join(', ')}`);
for (const preview of registry.sharedPreviews) {
  const file = join(root, preview.source);
  if (!modules.has(file) || !sectionIds.has(preview.section))
    throw new Error(`共享预览登记无效：${preview.component}`);
  if (!previewFiles.has(file) || !productionFiles.has(preview.source))
    throw new Error(`共享控件必须同时被业务页和展示板引用：${preview.component}`);
  const isUsed = (files) =>
    [...files].some((candidate) =>
      modules.get(candidate)?.controls.some((control) => control.element === preview.component),
    );
  if (
    !isUsed(previewFiles) ||
    !isUsed([...productionFiles].map((candidate) => join(root, candidate)))
  )
    throw new Error(`共享控件没有真实渲染入口：${preview.component}`);
  for (const className of preview.exclusiveClasses ?? []) {
    for (const [candidate, record] of modules) {
      if (candidate === file) continue;
      if (
        record.controls.some(
          (control) => control.kind !== 'component' && control.classes.includes(className),
        )
      )
        throw new Error(`禁止复制共享控件 ${className}：${relativePath(candidate)}`);
    }
  }
}

const files = [...modules]
  .filter(
    ([file, record]) =>
      record.controls.length && !relativePath(file).startsWith('apps/web/app/dev/'),
  )
  .map(([file, record]) => ({
    source: relativePath(file),
    routes: routes
      .filter((route) => route.files.includes(relativePath(file)))
      .map((route) => route.path),
    controls: record.controls,
  }))
  .sort((a, b) => a.source.localeCompare(b.source, 'en'));
const result = { version: 1, routes, files };
const serialized = JSON.stringify(result, null, 2) + '\n';
if (process.argv.includes('--check')) {
  let current;
  try {
    current = JSON.parse(await readFile(outputPath, 'utf8'));
  } catch {
    throw new Error('控件清单缺失，请运行 pnpm ui:controls:sync');
  }
  if (JSON.stringify(current) !== JSON.stringify(result))
    throw new Error('控件清单与源码不一致，请运行 pnpm ui:controls:sync 并检查新增控件的预览状态');
} else {
  await writeFile(outputPath, serialized, 'utf8');
}
console.log(
  `控件清单${process.argv.includes('--check') ? '校验通过' : '已更新'}：${routes.length} 个页面，${files.length} 个源码文件，${files.reduce((count, file) => count + file.controls.length, 0)} 组源码节点。`,
);
