import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function run(args) {
  execFileSync(npx, args, { stdio: 'inherit' });
}

if (!existsSync('dist')) {
  throw new Error('dist directory not found. Run the web build before cap:sync.');
}

if (!existsSync('ios/App')) {
  run(['cap', 'add', 'ios']);
}

run(['cap', 'sync', 'ios']);
console.log('Capacitor iOS sync complete');
