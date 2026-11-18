import { readFileSync } from 'node:fs';

let cachedVersion = '';

/** 机器人版本以同目录 package.json 为准，部署包和自检看到的是同一份。 */
export function getBotVersion() {
  if (cachedVersion) {
    return cachedVersion;
  }
  try {
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    );
    cachedVersion =
      typeof packageJson.version === 'string' && packageJson.version.trim()
        ? packageJson.version.trim()
        : '0.0.0';
  } catch {
    cachedVersion = '0.0.0';
  }
  return cachedVersion;
}
