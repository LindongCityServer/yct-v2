import vm from 'node:vm';

export function evaluateLegacyDataFile<TValue>(source: string, exportExpression: string): TValue {
  const normalizedSource = source
    .replace(/\bexport\s+default\s+/g, 'const __legacy_default__ = ')
    .replace(/\bexport\s+(?=const|let|var|function|class)/g, '')
    .replace(/\bexport\s*\{[^}]*\}\s*;?/g, '');

  const script = new vm.Script(`
    "use strict";
    ${normalizedSource}
    ;(${exportExpression});
  `);

  const context = vm.createContext(Object.freeze({}));
  return script.runInContext(context, {
    timeout: 2000,
    displayErrors: true,
  }) as TValue;
}
