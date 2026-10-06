import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
for (const dir of ['src', 'scripts', 'tests']) for (const file of readdirSync(dir).filter(f => f.endsWith('.js'))) execFileSync(process.execPath, ['--check', `${dir}/${file}`], { stdio: 'inherit' });
await import('../src/contracts.js'); await import('../src/tools.js');
console.log('Source syntax and module imports pass');
