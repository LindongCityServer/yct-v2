import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(currentDir, 'check-runtime-config.ps1');
const forwardedArgs = process.argv.slice(2).filter((value) => value !== '--');

const result = spawnSync(
  'powershell',
  ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...forwardedArgs],
  {
    cwd: process.cwd(),
    stdio: 'inherit',
  },
);

if (typeof result.status === 'number') {
  process.exit(result.status);
}

process.exit(1);
