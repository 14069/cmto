import 'dotenv/config';
/**
 * Migra os registros do SQLite original para PostgreSQL via Prisma.
 * Execute somente depois de criar as tabelas PostgreSQL com `prisma migrate deploy`.
 * O banco de destino precisa estar vazio. O script não apaga nem altera o SQLite.
 */
import { PrismaClient as SqliteClient } from '../src/generated/sqlite-client/index.js';
import { PrismaClient as PostgresClient } from '@prisma/client';

const sourceUrl = process.env.SQLITE_SOURCE_URL;
const targetUrl = process.env.DATABASE_URL;
if (!sourceUrl) throw new Error('Defina SQLITE_SOURCE_URL apontando para o dev.db original.');
if (!targetUrl) throw new Error('Defina DATABASE_URL apontando para o PostgreSQL de destino.');

const source = new SqliteClient({ datasources: { db: { url: sourceUrl } } });
const target = new PostgresClient();

// Ordem respeita as chaves estrangeiras do schema atual.
const models = [
  'user', 'class', 'occurrenceCategory', 'student', 'classUser', 'userInvite',
  'occurrence', 'praise', 'tAC', 'dailyControl', 'dailyControlClass',
  'dailyControlAbsence', 'attachment', 'notification', 'scoreHistory',
  'systemConfig', 'auditLog', 'academicGrade', 'honorOverride',
];

const chunk = (items, size = 500) => {
  const result = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
};

try {
  const sourceCounts = {};
  const targetCounts = {};
  for (const model of models) {
    sourceCounts[model] = await source[model].count();
    targetCounts[model] = await target[model].count();
  }

  const occupied = Object.entries(targetCounts).filter(([, count]) => count > 0);
  if (occupied.length) {
    throw new Error(
      `Migração cancelada: o PostgreSQL não está vazio (${occupied.map(([name, count]) => `${name}=${count}`).join(', ')}). ` +
      'Não serão sobrescritos registros existentes.'
    );
  }

  console.log('Contagens encontradas no SQLite:');
  console.table(sourceCounts);
  console.log('Iniciando cópia transacional; o SQLite permanecerá intacto...');

  const finalCounts = await target.$transaction(async (tx) => {
    for (const model of models) {
      const rows = await source[model].findMany();
      for (const batch of chunk(rows)) {
        await tx[model].createMany({ data: batch });
      }
      console.log(`${model}: ${rows.length} registro(s) copiado(s)`);
    }

    const verified = {};
    for (const model of models) {
      verified[model] = await tx[model].count();
      if (verified[model] !== sourceCounts[model]) {
        throw new Error(`Divergência em ${model}: origem=${sourceCounts[model]}, destino=${verified[model]}`);
      }
    }
    return verified;
  }, { maxWait: 10000, timeout: 600000 });

  console.log('\nMigração concluída. Todas as 19 tabelas tiveram suas contagens conferidas.');
  console.table(finalCounts);
} catch (error) {
  console.error('\nFalha na migração:', error.message);
  process.exitCode = 1;
} finally {
  await source.$disconnect();
  await target.$disconnect();
}
