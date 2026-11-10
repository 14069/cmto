// Importa o histórico das fichas manuais (Word, uma por aluno) para o CMTO VI.
//
// Uso (na pasta backend, pode ficar com o PM2 ligado):
//   npm install adm-zip                                    (só na primeira vez)
//   node scripts/import-fichas.mjs "C:\caminho\Fichas"           -> TESTE (não grava nada)
//   node scripts/import-fichas.mjs "C:\caminho\Fichas" --apply   -> grava de verdade
//   (opcional) --nota-da-ficha : o conceito final do aluno passa a ser a "Nota" que consta na ficha
//   (opcional) --criar-alunos  : cria (sem matrícula, "SEM-MATRICULA-001"...) os alunos que têm ficha mas não estão no sistema
//   Linhas com data/valor estranho NÃO são descartadas: entram marcadas com "[REVISAR ...]" para editar depois.
//
// Regras:
//  - A ficha é ligada ao aluno pelo NOME + TURMA (sem acento, sem diferença de maiúsculas).
//  - Linha "TMD nnn/2026"            -> TMD (nível deduzido pelo valor), entra como ARQUIVADO.
//  - Linha "Suspensão ..."           -> Suspensão, entra como ARQUIVADA.
//  - Qualquer outra linha com nota 0 -> Anotação, entra como ARQUIVADA (só histórico:
//                                       não conta para a regra das 4 anotações).
//  - A nota da ficha é sempre um DESCONTO (0.70 e -0.70 descontam o mesmo).
//  - O conceito do aluno é recalculado: conceito atual - descontos (limites 0 a 10).
//  - Rodar duas vezes não duplica: o que já existe é ignorado.

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import prisma from '../src/utils/prisma.js';

const require = createRequire(import.meta.url);
let AdmZip;
try { AdmZip = require('adm-zip'); } catch {
  console.error('Falta instalar a biblioteca. Rode:  npm install adm-zip');
  process.exit(1);
}

// ---------- AJUSTES ----------
const r2 = (n) => Math.round(n * 100) / 100;
const SCHOOL_YEAR = 2026;
const IMPORTED_STATUS = 'ARQUIVADO';   // status dos registros importados
const MAX_SCORE = 10, MIN_SCORE = 0;
// Nível do TMD pelo valor descontado
const levelByValue = (v) => (v <= 0.40 ? 'LEVE' : v <= 0.60 ? 'MEDIA' : v <= 1.00 ? 'GRAVE' : 'GRAVISSIMO');
const CATEGORY_BY_LEVEL = {
  LEVE: 'Natureza Leve', MEDIA: 'Natureza Média', GRAVE: 'Natureza Grave',
  GRAVISSIMO: 'Natureza Gravíssima/Eliminatória',
};
// -----------------------------

const dir = process.argv[2];
const APPLY = process.argv.includes('--apply');
const USE_FICHA_SCORE = process.argv.includes('--nota-da-ficha');
const CREATE_STUDENTS = process.argv.includes('--criar-alunos');   // cria quem tem ficha mas não está no sistema   // conceito final = "Nota" que consta na ficha
if (!dir || dir.startsWith('--') || !fs.existsSync(dir)) {
  console.error('Informe a pasta das fichas: node scripts/import-fichas.mjs "C:\\caminho\\Fichas" [--apply]');
  process.exit(1);
}

// tudo que aparece na tela também vai para o arquivo import-fichas-relatorio.txt (na pasta onde você rodou)
const LOG = [];
const _log = console.log;
console.log = (...a) => { LOG.push(a.join(' ')); _log(...a); };
const writeReport = () => { try { fs.writeFileSync('import-fichas-relatorio.txt', LOG.join('\n') + '\n', 'utf8'); _log('\n(relatório salvo em import-fichas-relatorio.txt)'); } catch {} };

const norm = (s) =>
  String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// ---------- ler .docx ----------
const decode = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&amp;/g, '&');

const paraText = (xml) =>
  [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)]
    .map((p) => decode([...p[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join('')))
    .join(' ')
    .replace(/\s+/g, ' ').trim();

const FIELD = {
  nome: /^nome(\s+d[oa]\s+(estudante|aluno|aluna))?$/i,
  turma: /^turma$/i,
  nota: /^nota(\s+(disciplinar|atual))?$/i,
};

function readFicha(file) {
  const xml = new AdmZip(file).readAsText('word/document.xml');
  const tables = [...xml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)].map((m) => m[0]);
  const outside = xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, '');

  const info = { nome: '', turma: '', nota: '' };
  const setField = (label, value) => {
    const l = label.replace(/[:\s]+$/, '').trim();
    for (const k of Object.keys(FIELD)) if (FIELD[k].test(l) && !info[k]) info[k] = value.trim();
  };

  // modelo 1: "Nome: FULANO" em parágrafos fora da tabela
  // (o mesmo parágrafo pode trazer "Nome: FULANO; Nota atual: 7.30" -> separa os campos)
  const paras = [...outside.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map((m) => paraText(m[0])).filter(Boolean);
  for (const p of paras) {
    const parts = p.split(/[;,\s]*(?=\b(?:nota(?:\s+(?:atual|disciplinar))?|turma|nome(?:\s+d[oa]\s+(?:estudante|aluno|aluna))?)\s*:)/i).filter(Boolean);
    for (const part of parts) {
      const m = part.match(/^([^:]{2,30}):\s*(.*)$/);
      if (m) setField(m[1], m[2].replace(/[;,\s]+$/, ''));
    }
  }
  // modelo antigo: o nome vem sozinho na primeira linha, sem "Nome:"
  const soNome = () => paras.find((p) => !p.includes(':') && !/^(ficha|registro|observa)/i.test(p) && p.length > 4);

  const rows = [];
  for (const t of tables) {
    for (const tr of t.matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)) {
      const cells = [...tr[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map((c) => paraText(c[0]));
      if (cells.every((c) => !c)) continue;
      // modelo 2: tabela de 2 colunas "Nome do estudante | FULANO"
      if (cells.length === 2 && Object.values(FIELD).some((re) => re.test(cells[0].replace(/[:\s]+$/, '')))) {
        setField(cells[0], cells[1]);
        continue;
      }
      if (cells.length < 2) continue;
      if (/^data$/i.test(cells[0]) && /nota/i.test(cells[cells.length - 1])) continue; // cabeçalho
      if (cells.length >= 3) rows.push({ data: cells[0], tipo: cells[1] || '', nota: cells[cells.length - 1] ?? '' });
    }
  }
  if (!info.nome) info.nome = soNome() || '';
  const notaFicha = info.nota ? parseFloat(info.nota.replace(',', '.')) : null;
  return { nome: info.nome, turma: info.turma, notaFicha: Number.isFinite(notaFicha) ? notaFicha : null, rows };
}

// ---------- interpretar linhas ----------
function parseDate(raw) {
  if (/^[\s\-–—_.]*$/.test(String(raw))) return null;
  let s = String(raw).trim().replace(/[.\-]/g, '/').replace(/\s+/g, '');
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) m = s.match(/^(\d{1,2})\/(\d{2})(\d{4})$/);           // 16/092026
  if (!m) m = s.match(/^(\d{1,2})(\d{2})\/(\d{4})$/);           // 1609/2026
  if (!m) { const y = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/); if (y) m = [y[0], y[1], y[2], '20' + y[3]]; }
  if (!m) { const y = s.match(/^(\d{1,2})\/(\d{1,2})$/); if (y) m = [y[0], y[1], y[2], String(SCHOOL_YEAR)]; }   // 31/03 -> 2026
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d, 12));
  return dt.getUTCMonth() === mo - 1 ? dt : null;
}

function parseNota(raw) {
  const s = String(raw).trim().replace(',', '.').replace(/[^\d.\-]/g, '');
  if (s === '') return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.abs(n) : null;
}

const isEmptyDate = (d) => /^[\s\-–—_.]*$/.test(String(d));

// Linhas com algo estranho (sem data, data errada, valor errado) NÃO são descartadas:
// entram na ficha marcadas com "[REVISAR ...]" para você corrigir depois, pelo botão Editar do sistema.
function parseRow(r, problems, ctx) {
  const tipo = String(r.tipo).trim();
  if (!tipo) return null;
  const resumo = tipo.replace(/\s+/g, ' ').slice(0, 70);
  const flags = [];
  const raw = String(r.data).trim();
  const hojeMs = Date.now() + 86400000;

  // ----- data -----
  let date = parseDate(raw);
  if (!date || date.getTime() > hojeMs) {
    // tenta aproveitar dia/mês com o ano letivo (ex.: 24/08/2028 -> 24/08/2026); senão, usa a data de hoje
    let fix = null;
    const m = raw.match(/^(\d{1,2})\D+(\d{1,2})/);
    if (m) {
      const c = new Date(Date.UTC(SCHOOL_YEAR, Number(m[2]) - 1, Number(m[1]), 12));
      if (c.getUTCMonth() === Number(m[2]) - 1 && c.getTime() <= hojeMs) fix = c;
    }
    const n = new Date();
    date = fix || new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate(), 12));
    flags.push(`DATA — na ficha: ${isEmptyDate(raw) ? 'em branco' : `"${raw}"`}`);
  }

  // ----- nota -----
  let nota = parseNota(r.nota);
  if (nota === null) { flags.push(`VALOR — na ficha: "${r.nota}"`); nota = 0; }
  const prefixo = () => (flags.length ? `[REVISAR ${flags.join('; ')}] ` : '');

  if (/^tac\b/i.test(tipo)) {
    warn('tac', `${ctx}: "${tipo}" em ${r.data}`);
    return null;
  }
  if (/^tmd\b/i.test(tipo)) {
    const num = (tipo.match(/(\d+)\s*\/\s*(\d{2,4})\b/) || []);
    let numero = null;
    if (num[1]) numero = `${num[1]}/${num[2].length === 2 ? '20' + num[2] : num[2]}`;
    else { const n2 = tipo.match(/^tmd\s*(?:n[ºo°.]*\s*)?(\d+)/i); if (n2) numero = `${n2[1]}/${date.getUTCFullYear()}`; }
    if (nota === 0) { flags.push('VALOR — o desconto está 0 na ficha (nível provisório: Leve)'); }
    else if (nota > 2) { flags.push(`VALOR — na ficha: ${String(r.nota).trim()} (o máximo de um TMD é 2,00; parece ser o conceito e não o desconto)`); nota = 0; }
    const extra = tipo.replace(/^tmd\b\s*/i, '').replace(/\d+\s*\/\s*\d{2,4}\b/, '').replace(/^[\s:\-–nº°.]*\d*\s*/i, '').trim();
    const level = nota > 0 ? levelByValue(nota) : 'LEVE';
    return {
      type: 'TMD', tmdLevel: level, date, scoreImpact: -nota, flags, resumo,
      description: `${prefixo()}TMD nº ${numero || '(sem número)'} — importado da ficha manual${extra ? `. ${extra}` : ''}`,
    };
  }
  if (/^(termo\s+(de\s+)?)?suspens/i.test(tipo)) {
    if (nota > 2) { flags.push(`VALOR — na ficha: ${String(r.nota).trim()} (impossível para suspensão)`); nota = 0; }
    const days = (tipo.match(/(\d+)\s*(?:dias?|d\b)/i) || [])[1];
    const num = tipo.match(/(\d+)\s*\/\s*(\d{2,4})\b/);
    const desc = tipo.replace(/^(termo\s+(de\s+)?)?suspens[ãa]o\s*[:\-–]?\s*/i, '').replace(/\d+\s*\/\s*\d{2,4}\b/, '').replace(/^[\s:\-–nº°.]+/i, '').trim();
    return {
      type: 'SUSPENSAO', date, scoreImpact: -nota, flags, resumo,
      suspensionDays: days ? Math.min(5, Number(days)) : null,
      description: `${prefixo()}Suspensão${num ? ` nº ${num[1]}/${num[2].length === 2 ? '20' + num[2] : num[2]}` : ''} — importada da ficha manual${desc ? `. ${desc}` : ''}`,
    };
  }
  // anotação
  const desc = tipo.replace(/^\s*anota[cç][aã]o\s*[:;\-–]?\s*/i, '').trim();
  if (nota > 0) {
    flags.push(`VALOR — a ficha tem nota ${String(r.nota).trim()}, mas a linha não é TMD nem suspensão (importada sem desconto)`);
    nota = 0;
  }
  if (desc.length < 3) { problems.push(`${ctx}: anotação sem descrição em ${r.data} (linha ignorada)`); return null; }
  return { type: 'ANOTACAO', date, scoreImpact: 0, flags, resumo, description: `${prefixo()}${desc}` };
}

// ---------- semelhança de nomes ----------
const STOP = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
const keyOfName = (n) => norm(n).split(' ').filter((t) => t && !STOP.has(t)).join(' ');
function lev(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 4) return 99;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
function similarity(a, b) {
  const ta = new Set(keyOfName(a).split(' ')), tb = new Set(keyOfName(b).split(' '));
  const inter = [...ta].filter((t) => tb.has(t)).length;
  const dice = (2 * inter) / (ta.size + tb.size || 1);
  const ka = keyOfName(a), kb = keyOfName(b);
  const edit = 1 - lev(ka, kb) / Math.max(ka.length, kb.length, 1);
  return Math.max(dice, edit);
}
// nome a partir do nome do arquivo: "13_lucas_guerra.docx" -> "lucas guerra"
const nameFromFile = (f) => path.basename(f).replace(/\.docx$/i, '').replace(/^\s*\d+[_\s.-]+/, '').replace(/[_]+/g, ' ').trim();

// ---------- carregar dados ----------
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(d, e.name))
    : (/\.docx$/i.test(e.name) && !e.name.startsWith('~$') ? [path.join(d, e.name)] : []));
const files = walk(dir);
if (!files.length) { console.error('Nenhum .docx encontrado em', dir); process.exit(1); }

const students = await prisma.student.findMany({ include: { class: { select: { name: true } } } });
const byName = new Map();      // nome exato (sem acento)
const byKey = new Map();       // ignorando da/de/do/das/dos/e
const add = (m, k, s) => { if (!m.has(k)) m.set(k, []); m.get(k).push(s); };
for (const s of students) { add(byName, norm(s.name), s); add(byKey, keyOfName(s.name), s); }
const admin = await prisma.user.findFirst({ where: { role: 'ADMIN', active: true }, orderBy: { createdAt: 'asc' } });
if (!admin) { console.error('Nenhum usuário ADMIN ativo para constar como autor.'); process.exit(1); }
const cats = await prisma.occurrenceCategory.findMany();
const catId = (level) => cats.find((c) => c.name === CATEGORY_BY_LEVEL[level])?.id || null;

const key2 = (i) => `${i.type}|${new Date(i.date).toISOString().slice(0, 10)}|${i.description}`;
const problems = [];
const warnings = [];
const warn = (cat, msg) => warnings.push({ cat, msg });
const unmatched = [];
const novos = new Map();   // alunos a criar (--criar-alunos)
const revisar = [];        // linhas importadas com [REVISAR]
const classes = await prisma.class.findMany();
const turmaTrocas = [];   // ficha numa turma, aluno em outra no sistema
const plans = [];   // { student, ficha, items }
// escolhe o aluno entre os candidatos (pela turma, se houver mais de um)
const pick = (cands, turma) => {
  if (cands.length === 1) return cands[0];
  if (cands.length > 1) return cands.find((s) => norm(s.class.name) === norm(turma)) || 'ambiguo';
  return null;
};

for (const file of files) {
  const base = path.relative(dir, file);
  let ficha;
  try { ficha = readFicha(file); } catch (e) { problems.push(`${base}: não consegui abrir (${e.message})`); continue; }

  // nome ausente ou truncado ("p") -> usa o nome do arquivo
  const fileNome = nameFromFile(file);
  if ((!ficha.nome || ficha.nome.trim().length < 6 || ficha.nome.trim().split(/\s+/).length < 2) && fileNome.split(/\s+/).length >= 2) {
    warn('nome', `${base}: nome na ficha ${ficha.nome ? `"${ficha.nome}" (incompleto)` : 'vazio'} — usei o nome do arquivo: "${fileNome}"`);
    ficha.nome = fileNome;
  } else if (!ficha.nome) { problems.push(`${base}: sem nome na ficha`); continue; }
  else if (similarity(fileNome, ficha.nome) < 0.5) {
    warn('nome', `${base}: o arquivo se chama "${fileNome}" mas a ficha é de "${ficha.nome}" — arquivo com o conteúdo errado?`);
  }

  // 1) nome exato  2) ignorando da/de/do  3) parecido na mesma turma (até 2 letras de diferença)
  let student = pick(byName.get(norm(ficha.nome)) || [], ficha.turma);
  if (!student) {
    const s2 = pick(byKey.get(keyOfName(ficha.nome)) || [], ficha.turma);
    if (s2 && s2 !== 'ambiguo') { student = s2; warn('nome', `${base}: ligado a "${s2.name}" (diferença só em da/de/do/e)`); }
  }
  if (!student) {
    const fk = keyOfName(ficha.nome);
    const mesmaTurma = students.filter((s) => norm(s.class.name) === norm(ficha.turma));
    const near = mesmaTurma.map((s) => ({ s, d: lev(keyOfName(s.name), fk) })).filter((x) => x.d <= 2).sort((a, b) => a.d - b.d);
    if (near.length && (near.length === 1 || near[0].d < near[1].d)) {
      student = near[0].s;
      warn('nome', `${base}: ligado por nome PARECIDO — ficha "${ficha.nome}" ↔ sistema "${student.name}" (confira!)`);
    }
  }
  if (student === 'ambiguo') {
    const n = (byName.get(norm(ficha.nome)) || []).length;
    problems.push(`${base}: ${n} alunos com o nome "${ficha.nome}" e nenhum na turma "${ficha.turma}"`); continue;
  }
  if (!student && CREATE_STUDENTS) {
    const cls = classes.find((c) => norm(c.name) === norm(ficha.turma));
    if (cls) {
      const k = `${norm(ficha.nome)}|${cls.id}`;
      if (!novos.has(k)) {
        const sug = students.map((s) => ({ s, sim: similarity(s.name, ficha.nome) + (s.classId === cls.id ? 0.15 : 0) }))
          .filter((x) => x.sim >= 0.6).sort((a, b) => b.sim - a.sim).slice(0, 3).map((x) => `${x.s.name} (${x.s.class.name.split('/')[0]})`);
        novos.set(k, { id: `NEW:${novos.size + 1}`, _new: true, name: ficha.nome.trim(), classId: cls.id, class: { name: cls.name }, currentScore: 8.0, sug });
      }
      student = novos.get(k);
    }
  }
  if (!student) {
    const sug = students
      .map((s) => ({ s, sim: similarity(s.name, ficha.nome) + (norm(s.class.name) === norm(ficha.turma) ? 0.15 : 0) }))
      .filter((x) => x.sim >= 0.6).sort((a, b) => b.sim - a.sim).slice(0, 3)
      .map((x) => `${x.s.name} (${x.s.class.name.split('/')[0]})`);
    unmatched.push({ base, nome: ficha.nome, turma: ficha.turma, sug });
    continue;
  }
  if (ficha.turma && norm(student.class.name) !== norm(ficha.turma)) {
    turmaTrocas.push({ nome: student.name, de: ficha.turma.split('/')[0], para: student.class.name.split('/')[0] });
  }

  const items = [];
  let lastData = '';
  for (let r of ficha.rows) {
    if (isEmptyDate(r.data)) {
      if (lastData && String(r.tipo).trim()) {   // célula de data mesclada no Word: usa a data da linha de cima
        warn('data', `${base}: linha sem data usou ${lastData} (da linha de cima): "${String(r.tipo).replace(/\s+/g, ' ').slice(0, 60)}"`);
        r = { ...r, data: lastData };
      }
    } else lastData = r.data;
    const it = parseRow(r, problems, `${base}`);
    if (it) {
      if (it.flags?.length) revisar.push(`${student.name} [${student.class.name.split('/')[0]}] — ${base}: ${it.flags.join('; ')} → "${it.resumo}"`);
      const y = it.date.getUTCFullYear();
      if (y !== SCHOOL_YEAR) warn('data', `${base}: data ${r.data} fora de ${SCHOOL_YEAR} (${it.type}: "${it.description.slice(0, 50)}") — conferir`);
      items.push(it);
    }
  }
  items.sort((a, b) => a.date - b.date);
  plans.push({ student, ficha, items, base, notaFicha: ficha.notaFicha });
}

// duas fichas do mesmo aluno: junta numa só e descarta linhas idênticas
{
  const merged = new Map();
  for (const p of plans) {
    const cur = merged.get(p.student.id);
    if (!cur) { merged.set(p.student.id, p); continue; }
    if (cur.notaFicha == null) cur.notaFicha = p.notaFicha;
    warn('dup', `${p.student.name}: duas fichas (${cur.base} e ${p.base}) — juntei e descartei os registros repetidos`);
    const seen = new Set(cur.items.map((i) => key2(i)));
    for (const i of p.items) if (!seen.has(key2(i))) { cur.items.push(i); seen.add(key2(i)); }
    cur.items.sort((a, b) => a.date - b.date);
  }
  plans.length = 0; plans.push(...merged.values());
}

// remove o que já foi importado antes
const already = await prisma.occurrence.findMany({
  where: { studentId: { in: plans.map((p) => p.student.id) } },
  select: { studentId: true, type: true, occurredAt: true, description: true },
});
const key = (sid, i) => `${sid}|${i.type}|${new Date(i.date).toISOString().slice(0, 10)}|${i.description}`;
const have = new Set(already.map((o) => key(o.studentId, { type: o.type, date: o.occurredAt, description: o.description })));
// aluno novo sem nada a importar: não cria
for (let i = plans.length - 1; i >= 0; i--) if (plans[i].student._new && !plans[i].items.length) plans.splice(i, 1);
let skippedDup = 0;
for (const p of plans) {
  const before = p.items.length;
  p.items = p.items.filter((i) => !have.has(key(p.student.id, i)));
  skippedDup += before - p.items.length;
}

// ---------- resumo ----------
let nAnot = 0, nTmd = 0, nSusp = 0;
console.log('\n=== FICHAS ===');
let vazias = 0;
for (const p of plans) {
  if (!p.items.length && p.notaFicha == null) { vazias++; continue; }
  const anot = p.items.filter((i) => i.type === 'ANOTACAO').length;
  const tmd = p.items.filter((i) => i.type === 'TMD');
  const susp = p.items.filter((i) => i.type === 'SUSPENSAO');
  nAnot += anot; nTmd += tmd.length; nSusp += susp.length;
  const desc = p.items.reduce((s, i) => s + i.scoreImpact, 0);
  p.newScore = r2(Math.min(MAX_SCORE, Math.max(MIN_SCORE, p.student.currentScore + desc)));
  if (p.notaFicha != null && Math.abs(p.notaFicha - p.newScore) > 0.005) {
    if (USE_FICHA_SCORE) {
      warn('nota', `${p.student.name}: descontos dão ${p.newScore.toFixed(2)}, mas a ficha diz ${p.notaFicha.toFixed(2)} — vai ficar com ${Math.min(MAX_SCORE, Math.max(MIN_SCORE, p.notaFicha)).toFixed(2)} (--nota-da-ficha)`);
      p.newScore = Math.min(MAX_SCORE, Math.max(MIN_SCORE, p.notaFicha));
      p.useFicha = true;
    } else {
      warn('nota', `${p.student.name}: a ficha diz Nota ${p.notaFicha.toFixed(2)}, mas os descontos dão ${p.newScore.toFixed(2)} (use --nota-da-ficha para valer a nota da ficha)`);
    }
  }
  console.log(
    `${p.student._new ? '(NOVO) ' : ''}${p.student.name} [${p.student.class.name}] -> ${anot} anotação(ões), ${tmd.length} TMD` +
    (tmd.length ? ` (${tmd.map((t) => `${t.scoreImpact.toFixed(2)} ${t.tmdLevel}`).join(', ')})` : '') +
    `, ${susp.length} suspensão | conceito ${p.student.currentScore.toFixed(2)} -> ${p.newScore.toFixed(2)}`
  );
}
if (vazias) console.log(`(${vazias} ficha(s) sem nenhum registro — nada a importar)`);
console.log(`\nFichas lidas: ${files.length} | ligadas a alunos: ${plans.length} | sem aluno: ${unmatched.length}`);
console.log(`A importar: ${nAnot} anotações, ${nTmd} TMDs, ${nSusp} suspensões (status ${IMPORTED_STATUS})`);
const suspSemDias = plans.flatMap((p) => p.items).filter((i) => i.type === 'SUSPENSAO' && !i.suspensionDays).length;
if (suspSemDias) console.log(`Obs.: ${suspSemDias} suspensão(ões) sem número de dias (a ficha só traz o número do documento); entram sem dias.`);
if (skippedDup) console.log(`Ignorados por já existirem no sistema: ${skippedDup}`);

const novosUsados = plans.filter((p) => p.student._new).map((p) => p.student);
if (novosUsados.length) {
  console.log(`\n=== ALUNOS QUE SERÃO CRIADOS (${novosUsados.length}) — têm ficha mas não estão no sistema; entram SEM matrícula (SEM-MATRICULA-nnn), conceito 8,00 ===`);
  for (const n of novosUsados) console.log(`  ${n.name} [${n.class.name.split('/')[0]}]${n.sug.length ? `   (parecidos já cadastrados: ${n.sug.join(' | ')})` : ''}`);
  console.log('  -> confira se não é só um nome escrito diferente de alguém que já está no sistema.');
}
if (unmatched.length) {
  console.log(`\n=== FICHAS SEM ALUNO NO SISTEMA (${unmatched.length}) — nada foi importado delas${CREATE_STUDENTS ? '' : ' (use --criar-alunos para cadastrá-los)'} ===`);
  for (const u of unmatched) {
    console.log(`  ${u.base}\n    nome: ${u.nome} | turma: ${u.turma}`);
    if (u.sug.length) console.log(`    parecidos: ${u.sug.join(' | ')}`);
  }
}
if (turmaTrocas.length) {
  console.log(`\n=== TURMA DA FICHA ≠ TURMA NO SISTEMA (${turmaTrocas.length}) — ligados pelo nome; vale a turma do sistema ===`);
  const g = new Map();
  for (const t of turmaTrocas) { const k = `ficha ${t.de} → sistema ${t.para}`; if (!g.has(k)) g.set(k, []); g.get(k).push(t.nome); }
  for (const [k, v] of g) console.log(`  ${k} (${v.length}): ${v.join('; ')}`);
}
const SECOES = [
  ['nome', 'NOMES — ligações automáticas e arquivos suspeitos (confira)'],
  ['dup', 'ALUNOS COM MAIS DE UMA FICHA'],
  ['tac', 'TAC encontrados nas fichas — NÃO importados (cadastre pela aba TAC do sistema)'],
  ['data', 'DATAS'],
  ['nota', 'NOTA DA FICHA ≠ DESCONTOS'],
];
for (const [cat, titulo] of SECOES) {
  const w = warnings.filter((x) => x.cat === cat);
  if (!w.length) continue;
  console.log(`\n=== ${titulo} (${w.length}) ===`);
  w.forEach((x) => console.log('  - ' + x.msg));
}
if (revisar.length) {
  console.log(`\n=== IMPORTADOS PARA REVISAR (${revisar.length}) — entram marcados com "[REVISAR ...]" no início da descrição; corrija depois no sistema (botão Editar na ficha do aluno) ===`);
  revisar.forEach((x) => console.log('  - ' + x));
}
if (problems.length) { console.log(`\n=== NÃO IMPORTADAS (${problems.length}) ===`); problems.forEach((p) => console.log('  - ' + p)); }

if (!APPLY) {
  console.log('\nMODO TESTE: nada foi gravado. Se estiver certo, rode de novo com --apply');
  writeReport();
  await prisma.$disconnect();
  process.exit(0);
}

// ---------- gravar ----------
let created = 0;
let createdStudents = 0;
await prisma.$transaction(async (tx) => {
  let seq = (await tx.student.count({ where: { registration: { startsWith: 'SEM-MATRICULA-' } } }));
  for (const p of plans) {
    if (p.student._new) {
      let reg;
      do { reg = `SEM-MATRICULA-${String(++seq).padStart(3, '0')}`; } while (await tx.student.findUnique({ where: { registration: reg } }));
      const novo = await tx.student.create({ data: { registration: reg, name: p.student.name, classId: p.student.classId, currentScore: 8.0 } });
      p.student = { ...p.student, id: novo.id, _new: false };
      createdStudents++;
    }
    let score = p.student.currentScore;
    for (const it of p.items) {
      const occ = await tx.occurrence.create({
        data: {
          studentId: p.student.id,
          type: it.type,
          tmdLevel: it.type === 'TMD' ? it.tmdLevel : null,
          suspensionDays: it.type === 'SUSPENSAO' ? it.suspensionDays : null,
          categoryId: it.type === 'TMD' ? catId(it.tmdLevel) : null,
          occurredAt: it.date,
          description: it.description,
          scoreImpact: it.scoreImpact,
          status: IMPORTED_STATUS,
          createdById: admin.id,
        },
      });
      created++;
      if (it.scoreImpact !== 0) {
        const next = r2(Math.min(MAX_SCORE, Math.max(MIN_SCORE, score + it.scoreImpact)));
        await tx.scoreHistory.create({
          data: {
            studentId: p.student.id, previousScore: score, newScore: next, delta: next - score,
            reason: `Importado da ficha manual: ${it.description.substring(0, 80)}`,
            occurrenceId: occ.id, createdAt: it.date,
          },
        });
        score = next;
      }
    }
    if (p.useFicha && Math.abs(score - p.newScore) > 0.0001) {
      await tx.scoreHistory.create({
        data: {
          studentId: p.student.id, previousScore: score, newScore: p.newScore, delta: p.newScore - score,
          reason: 'Ajuste para a nota registrada na ficha manual',
          createdAt: new Date(),
        },
      });
      score = p.newScore;
    }
    if (score !== p.student.currentScore) {
      await tx.student.update({ where: { id: p.student.id }, data: { currentScore: score } });
    }
  }
  await tx.auditLog.create({
    data: {
      userId: admin.id, action: 'IMPORT', entity: 'Occurrence', entityId: 'fichas-manuais',
      newData: JSON.stringify({ fichas: plans.length, ocorrencias: created, alunosCriados: createdStudents }),
    },
  });
}, { timeout: 300000, maxWait: 60000 });

console.log(`\n=== CONCLUIDO === ${created} ocorrências importadas${createdStudents ? `, ${createdStudents} alunos criados` : ''}.`);
writeReport();
await prisma.$disconnect();
