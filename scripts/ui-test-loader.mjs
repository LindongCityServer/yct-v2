import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const compilerOptions = {
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ES2022,
  jsx: ts.JsxEmit.ReactJSX,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  isolatedModules: true,
  esModuleInterop: true,
  allowSyntheticDefaultImports: true,
};

function transpile(url, source) {
  const result = ts.transpileModule(source, {
    compilerOptions,
    fileName: fileURLToPath(url),
  });
  return result.outputText;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !/\.(?:[cm]?[jt]sx?|json|css)$/.test(specifier)) {
    const base = new URL(specifier, context.parentURL);
    for (const suffix of ['.tsx', '.ts', '/index.tsx', '/index.ts']) {
      const candidate = new URL(base.href + suffix);
      if (existsSync(fileURLToPath(candidate))) return nextResolve(candidate.href, context);
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (/\.(?:ts|tsx)$/.test(new URL(url).pathname)) {
    const source = await readFile(new URL(url), 'utf8');
    return { format: 'module', source: transpile(url, source), shortCircuit: true };
  }
  return nextLoad(url, context);
}
