import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const backendDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(backendDir, 'prisma', 'migrations');

if (existsSync(migrationsDir) && readdirSync(migrationsDir).some((name) =>
  existsSync(join(migrationsDir, name))
)) {
  throw new Error('Já existem migrations. Não será criada uma migration inicial por cima delas.');
}

const initialDir = join(migrationsDir, '0001_init');
mkdirSync(initialDir, { recursive: true });
const sql = execSync(
  'npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script',
  { cwd: backendDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
);
writeFileSync(join(initialDir, 'migration.sql'), sql, 'utf8');
writeFileSync(join(migrationsDir, 'migration_lock.toml'), 'provider = "postgresql"\n', 'utf8');
console.log('Migration inicial criada em prisma/migrations/0001_init. Revise e versione essa pasta no Git.');
