import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = dirname(fileURLToPath(import.meta.url));
for (const folder of ['server', 'client']) {
  const path = join(root, folder, '.env');
  if (existsSync(path)) { console.log(`${folder}/.env already exists; kept it.`); continue; }
  let env = readFileSync(join(root, folder, '.env.example'), 'utf8');
  env = env.replace('replace-with-a-long-random-secret', randomBytes(32).toString('hex'))
    .replace('replace-with-a-different-long-random-secret', randomBytes(32).toString('hex'));
  writeFileSync(path, env, { mode: 0o600 });
  console.log(`Created ${folder}/.env`);
}
console.log('Set MONGO_URI and optionally GEMINI_API_KEY in server/.env. Then follow README.md.');
