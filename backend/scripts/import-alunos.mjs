// Importa turmas e alunos de uma planilha Excel para o CMTO VI.
//
// Uso (na pasta backend, com o PM2 parado):
//   node scripts/import-alunos.mjs planilha.xlsx            -> TESTE (nao grava nada)
//   node scripts/import-alunos.mjs planilha.xlsx --apply    -> limpa e importa de verdade
//
// O que o --apply apaga: alunos, anotacoes/TMDs/suspensoes, elogios, TACs,
// historico de conceito, anexos, notificacoes e turmas que NAO estao na planilha.
// Mantem: usuarios, categorias, configuracoes, auditoria e turmas com o mesmo nome da planilha.

import 'dotenv/config';
import { createRequire } from 'module';
import prisma from '../src/utils/prisma.js';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

// ---------- AJUSTES ----------
const SCHOOL_YEAR = 2026;            // valor gravado em Class.schoolYear
const INITIAL_SCORE = 8.0;           // conceito inicial dos alunos
// -----------------------------

const file = process.argv[2];
const APPLY = process.argv.includes('--apply');
if (!file) {
  console.error('Informe a planilha: node scripts/import-alunos.mjs planilha.xlsx [--apply]');
  process.exit(1);
}

const norm = (s) =>
  String(s ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const text = (v) => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(Math.round(v) === v ? v : v).trim();
  return String(v).trim();
};

function parseDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !isNaN(v)) {
    return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate(), 12));
  }
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    return d ? new Date(Date.UTC(d.y, d.m - 1, d.d, 12)) : null;
  }
  const m = String(v).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m.map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, mo - 1, d, 12));
}

function parseGender(v) {
  const g = text(v).charAt(0).toUpperCase();
  return g === 'M' || g === 'F' ? g : null;
}

function parseShift(turma) {
  const t = norm(turma);
  if (/\bint\b/.test(t)) return 'INTEGRAL';
  if (/\bnot\b|noturno/.test(t)) return 'NOTURNO';
  if (/\bves\b|vespertino/.test(t)) return 'VESPERTINO';
  return 'MATUTINO';
}

// ---------- ler planilha ----------
const wb = XLSX.readFile(file, { cellDates: true });
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });

// acha a linha de cabecalho (a que tem "matricular"/"matricula" e "turma")
let headerIdx = rows.findIndex((r) => {
  const n = r.map(norm);
  return n.some((c) => c === 'matricular' || c === 'matricula') && n.some((c) => c.includes('turma'));
});
if (headerIdx < 0) {
  console.error('Nao achei a linha de cabecalho (precisa ter "Descricao Turma" e "Matricular").');
  console.error('Primeiras linhas lidas:', rows.slice(0, 3));
  process.exit(1);
}
const header = rows[headerIdx].map(norm);
const col = (pred) => header.findIndex(pred);

const C = {
  turma: col((h) => h.includes('descricao turma') || h === 'turma'),
  mat: col((h) => h === 'matricular' || h === 'matricula'),
  coletor: col((h) => h.includes('coletor')),
  nome: col((h) => ['nome', 'nome do estudante', 'nome do aluno', 'estudante', 'aluno'].includes(h)),
  nasc: col((h) => h.includes('nascimento')),
  sexo: col((h) => h === 'sexo'),
  chamada: col((h) => h.includes('chamada')),
  celular: col((h) => h.includes('celular') && !h.includes('respons')),
  email: col((h) => h === 'email' || h === 'e mail'),
  emailInst: col((h) => h.includes('institucional')),
  social: col((h) => h.includes('nome social')),
};

console.log('Colunas encontradas:');
for (const [k, v] of Object.entries(C)) console.log(`  ${k.padEnd(10)} ${v >= 0 ? `"${rows[headerIdx][v]}"` : '(nao encontrada)'}`);

if (C.nome < 0) {
  console.error('\nERRO: nao existe coluna com o NOME do aluno ("Nome", "Nome do Estudante"...).');
  console.error('Exporte a planilha de novo com o nome do estudante ligado.');
  process.exit(1);
}
if (C.turma < 0 || C.mat < 0) {
  console.error('\nERRO: faltam as colunas de turma ou matricula.');
  process.exit(1);
}

const get = (r, i) => (i >= 0 ? r[i] : '');

// ---------- montar dados ----------
const problems = [];
const candidates = [];
const idx = {
  sitMat: col((h) => h.includes('situacao da matricula')),
  sitTurma: col((h) => h.includes('situacao na turma')),
  saida: col((h) => h.includes('data de saida')),
};
let lastTurma = '';

rows.slice(headerIdx + 1).forEach((r, i) => {
  const line = headerIdx + i + 2; // numero da linha no Excel
  if (r.every((c) => text(c) === '')) return;

  const turma = text(get(r, C.turma)) || lastTurma; // repete turma se a celula vier vazia
  if (text(get(r, C.turma))) lastTurma = turma;
  const registration = text(get(r, C.mat));
  const name = text(get(r, C.nome));

  if (!turma) return problems.push(`Linha ${line}: sem turma`);
  if (!registration) return problems.push(`Linha ${line}: sem matricula (${name || 'sem nome'})`);
  if (!name) return problems.push(`Linha ${line}: sem nome (matricula ${registration})`);

  const rawBirth = get(r, C.nasc);
  const birthDate = parseDate(rawBirth);
  if (text(rawBirth) && !birthDate) problems.push(`Linha ${line}: data de nascimento invalida "${rawBirth}" (importado sem data)`);

  const chamada = parseInt(text(get(r, C.chamada)), 10);

  candidates.push({
    line,
    turma,
    registration,
    name,
    sitMat: text(get(r, idx.sitMat)),
    sitTurma: text(get(r, idx.sitTurma)),
    saida: text(get(r, idx.saida)),
    data: {
      registration,
      name,
      birthDate,
      gender: parseGender(get(r, C.sexo)),
      callNumber: Number.isFinite(chamada) ? chamada : null,
      phone: text(get(r, C.celular)) || null,
      email: text(get(r, C.email)) || null,
      institutionalEmail: text(get(r, C.emailInst)) || null,
      socialName: text(get(r, C.social)) || null,
      currentScore: INITIAL_SCORE,
    },
  });
});

// ---------- resolver matriculas repetidas ----------
// Regra: entre as linhas do mesmo aluno, vale a que tem Situacao na Turma = "Cursando";
// se empatar, a que nao tem "Data de saida"; se ainda empatar, a linha mais abaixo.
// Obs.: a planilha usa "-" nas celulas vazias, entao "-" conta como vazio.
const isBlank = (v) => ['', '-', '--', '—'].includes(String(v).trim());
const hasExit = (c) => !isBlank(c.saida);
const rank = (c) => (norm(c.sitTurma).includes('cursando') ? 0 : 1);
const groups = new Map();
for (const c of candidates) {
  if (!groups.has(c.registration)) groups.set(c.registration, []);
  groups.get(c.registration).push(c);
}
const students = [];
const decisions = [];
for (const list of groups.values()) {
  if (list.length === 1) {
    students.push(list[0]);
    if (rank(list[0]) !== 0) problems.push(`Aluno ${list[0].name} (${list[0].registration}): unica linha nao esta "Cursando" (${list[0].sitTurma || 'vazio'})`);
    continue;
  }
  const sorted = [...list].sort(
    (a, b) => rank(a) - rank(b) || Number(hasExit(a)) - Number(hasExit(b)) || b.line - a.line
  );
  const [keep, ...drop] = sorted;
  students.push(keep);
  decisions.push({ keep, drop });
  if (rank(keep) !== 0) problems.push(`Aluno ${keep.name} (${keep.registration}): nenhuma linha "Cursando", ficou a linha ${keep.line}`);
  if (list.filter((c) => rank(c) === 0).length > 1) problems.push(`Aluno ${keep.name} (${keep.registration}): mais de uma linha "Cursando", ficou a linha ${keep.line}`);
}
students.sort((a, b) => a.line - b.line);

const fmt = (c) => `linha ${c.line} | ${c.turma} | matricula: ${c.sitMat || '-'} | na turma: ${c.sitTurma || '-'} | saida: ${c.saida || '-'}`;
const countBy = (key) => {
  const m = {};
  for (const c of candidates) { const k = c[key] || '(vazio)'; m[k] = (m[k] || 0) + 1; }
  return m;
};

const turmas = [...new Set(students.map((s) => s.turma))];

// ---------- resumo ----------
const count = async () => ({
  alunos: await prisma.student.count(),
  ocorrencias: await prisma.occurrence.count(),
  elogios: await prisma.praise.count(),
  tacs: await prisma.tAC.count(),
  turmas: await prisma.class.count(),
});
const before = await count();

console.log('\n=== SITUACAO ATUAL DO BANCO ===');
console.log(before);
console.log('\n=== PLANILHA ===');
console.log(`Turmas: ${turmas.length} -> ${turmas.join(' | ')}`);
console.log(`Linhas lidas: ${candidates.length} | Alunos unicos a importar: ${students.length}`);
console.log('Situacao da Matricula (todas as linhas):', countBy('sitMat'));
console.log('Situacao na Turma (todas as linhas):', countBy('sitTurma'));
console.log(`\nMatriculas repetidas resolvidas: ${decisions.length}`);
decisions.forEach((d) => {
  console.log(`  ${d.keep.name} (${d.keep.registration})`);
  console.log(`    FICA:   ${fmt(d.keep)}`);
  d.drop.forEach((x) => console.log(`    SAI:    ${fmt(x)}`));
});
console.log(`Problemas: ${problems.length}`);
problems.forEach((p) => console.log('  - ' + p));
console.log('\nExemplo (3 primeiros):');
students.slice(0, 3).forEach((s) => console.log(' ', s.turma, '|', s.data.registration, '|', s.data.name, '|', s.data.birthDate?.toISOString().slice(0, 10), '|', s.data.gender));

if (!APPLY) {
  console.log('\nMODO TESTE: nada foi gravado. Se estiver certo, rode de novo com --apply');
  await prisma.$disconnect();
  process.exit(0);
}

// ---------- gravar ----------
await prisma.$transaction(
  async (tx) => {
    await tx.scoreHistory.deleteMany();
    await tx.attachment.deleteMany();
    await tx.occurrence.deleteMany();
    await tx.praise.deleteMany();
    await tx.tAC.deleteMany();
    await tx.notification.deleteMany();
    await tx.student.deleteMany();
    await tx.class.deleteMany({ where: { name: { notIn: turmas } } });

    const classId = {};
    for (const name of turmas) {
      let c = await tx.class.findFirst({ where: { name } });
      if (!c) {
        c = await tx.class.create({
          data: { name, schoolYear: SCHOOL_YEAR, shift: parseShift(name), active: true },
        });
      }
      classId[name] = c.id;
    }

    for (const s of students) {
      await tx.student.create({ data: { ...s.data, classId: classId[s.turma] } });
    }
  },
  { timeout: 300000, maxWait: 60000 }
);

console.log('\n=== CONCLUIDO ===');
console.log(await count());
await prisma.$disconnect();
