// Regras da Portaria de Condecorações (Medalhas e Alamares) — critérios configuráveis.
import prisma from '../utils/prisma.js';

// Valores da Portaria nº 001/2025 (editáveis na tela, para a portaria de cada ano).
export const DEFAULT_CRITERIA = {
  bimesters: 3,               // quantos bimestres entram na média pedagógica (Art. 2º)
  tolerance: 0.10,            // aproximação permitida na média pedagógica (Art. 3º)
  minNote: 6.0,               // "nenhuma nota menor que 6,0"
  minNoteMode: 'NOTAS',       // NOTAS = cada nota de cada bimestre | MEDIA_DISCIPLINA = média de cada disciplina
  discMedalMin: 9.0,          // Medalha de Mérito Disciplinar
  discAlamarMin: 10.0,        // Alamar de Mérito Disciplinar
  pedMedalMin: 8.0,           // Medalha de Mérito Intelectual
  pedAlamarMin: 9.0,          // Alamar de Mérito Intelectual
  pedAlamarMaxTmd: 1,         // Alamar intelectual: no máximo 1 TMD no ano
  deductionLimit: 1.0,        // não ter sido penalizado com desconto >= 1 ponto
  deductionMode: 'UNICO',     // UNICO = um único desconto >= limite | SOMA = soma dos descontos do ano
  duploPedMin: 9.0,           // Alamar Duplo
  duploDiscMin: 10.0,
};

// Ordem de apresentação (hierarquia do colégio): CIA -> turmas, na ordem em que a solenidade é conduzida.
export const HIERARQUIA = [
  { cia: '1º CIA', titulo: 'Turma Líder — 1º CIA', turmas: ['33.01', '33.02'] },
  { cia: '2º CIA', titulo: '2º CIA', turmas: ['23.01', '24.01'] },
  { cia: '3º CIA', titulo: '3º CIA', turmas: ['13.01', '13.02'] },
  { cia: '4º CIA', titulo: '4º CIA', turmas: ['92.01', '92.02', '82.01', '82.02'] },
  { cia: '5º CIA', titulo: '5º CIA', turmas: ['72.01', '62.01'] },
];
const codeOf = (name) => String(name || '').split('/')[0].trim();
export function posicaoDaTurma(name) {
  const code = codeOf(name);
  for (let i = 0; i < HIERARQUIA.length; i++) {
    const k = HIERARQUIA[i].turmas.indexOf(code);
    if (k >= 0) return { grupo: i, ordem: k, cia: HIERARQUIA[i].cia, titulo: HIERARQUIA[i].titulo };
  }
  return { grupo: HIERARQUIA.length, ordem: 0, cia: 'Outras turmas', titulo: 'Outras turmas' };   // turmas fora da lista vão no fim
}
export const ordenarTurmas = (list) => [...list].sort((a, b) => {
  const pa = posicaoDaTurma(a.name), pb = posicaoDaTurma(b.name);
  return pa.grupo - pb.grupo || pa.ordem - pb.ordem || String(a.name).localeCompare(String(b.name), 'pt-BR', { numeric: true });
});

const CONFIG_KEY = (year) => `honor_criteria_${year}`;
export const FIELDS = ['DISC_MEDALHA', 'DISC_ALAMAR', 'PED_MEDALHA', 'PED_ALAMAR'];

export async function getCriteria(year) {
  const row = await prisma.systemConfig.findUnique({ where: { key: CONFIG_KEY(year) } });
  let saved = {};
  try { saved = row ? JSON.parse(row.value) : {}; } catch { saved = {}; }
  return { ...DEFAULT_CRITERIA, ...saved };
}

export async function saveCriteria(year, input) {
  const clean = {};
  for (const [k, def] of Object.entries(DEFAULT_CRITERIA)) {
    const v = input?.[k];
    if (typeof def === 'number') {
      const n = Number(String(v).replace(',', '.'));
      clean[k] = Number.isFinite(n) ? n : def;
    } else {
      clean[k] = v ?? def;
    }
  }
  if (!['NOTAS', 'MEDIA_DISCIPLINA'].includes(clean.minNoteMode)) clean.minNoteMode = DEFAULT_CRITERIA.minNoteMode;
  if (!['UNICO', 'SOMA'].includes(clean.deductionMode)) clean.deductionMode = DEFAULT_CRITERIA.deductionMode;
  clean.bimesters = Math.min(4, Math.max(1, Math.round(clean.bimesters)));
  await prisma.systemConfig.upsert({
    where: { key: CONFIG_KEY(year) },
    update: { value: JSON.stringify(clean) },
    create: { key: CONFIG_KEY(year), value: JSON.stringify(clean), description: `Critérios de condecoração ${year}` },
  });
  return clean;
}

const r2 = (n) => (n == null ? null : Math.round(n * 100) / 100);
const EPS = 1e-9;

// ---------------------------------------------------------------- cálculo de um aluno
export function evaluateStudent({ student, grades, occurrences, overrides, criteria: c }) {
  // ---- disciplinar
  const disc = student.currentScore;
  const pen = occurrences.filter((o) => ['TMD', 'SUSPENSAO'].includes(o.type) && o.scoreImpact < 0);
  const maxDeduction = pen.reduce((m, o) => Math.max(m, Math.abs(o.scoreImpact)), 0);
  const totalDeduction = pen.reduce((s, o) => s + Math.abs(o.scoreImpact), 0);
  const tmdCount = occurrences.filter((o) => o.type === 'TMD').length;
  const dedValue = c.deductionMode === 'SOMA' ? totalDeduction : maxDeduction;
  const dedOk = dedValue < c.deductionLimit - EPS;

  // ---- pedagógico
  const byBim = new Map(grades.map((g) => [g.bimester, g]));
  const bims = [];
  for (let b = 1; b <= c.bimesters; b++) bims.push(byBim.get(b) || null);
  const missing = bims.map((g, i) => (g && g.average != null ? null : i + 1)).filter(Boolean);
  const counts = grades.map((g) => g.subjectCount || 0);
  const maxCount = Math.max(0, ...counts);
  const incomplete = bims.map((g, i) => (g && g.subjectCount < maxCount ? i + 1 : null)).filter(Boolean);
  const hasPed = missing.length === 0;
  const pedAvg = hasPed ? bims.reduce((s, g) => s + g.average, 0) / bims.length : null;

  let minNote = null;
  if (hasPed) {
    if (c.minNoteMode === 'MEDIA_DISCIPLINA') {
      const sums = new Map();
      for (const g of bims) {
        let subj = {};
        try { subj = JSON.parse(g.subjects || '{}'); } catch { /* vazio */ }
        for (const [d, n] of Object.entries(subj)) { const a = sums.get(d) || []; a.push(n); sums.set(d, a); }
      }
      const meds = [...sums.values()].map((a) => a.reduce((s, x) => s + x, 0) / a.length);
      minNote = meds.length ? Math.min(...meds) : null;
    } else {
      const mins = bims.map((g) => g.minGrade).filter((x) => x != null);
      minNote = mins.length ? Math.min(...mins) : null;
    }
  }
  const noteOk = hasPed && minNote != null && minNote >= c.minNote - EPS;
  const pedOk = (min) => hasPed && pedAvg + c.tolerance >= min - EPS;

  // ---- critérios (com o motivo quando não atinge)
  const why = { DISC_MEDALHA: [], DISC_ALAMAR: [], PED_MEDALHA: [], PED_ALAMAR: [], DUPLO: [] };
  const dedMsg = c.deductionMode === 'SOMA'
    ? `descontos do ano somam ${r2(totalDeduction)} (limite < ${c.deductionLimit})`
    : `teve desconto de ${r2(maxDeduction)} ponto(s) (limite < ${c.deductionLimit})`;
  const pedMsg = (min) => (!hasPed ? `sem notas do ${missing.join('º, ')}º bimestre` : `média pedagógica ${r2(pedAvg)} < ${min}${c.tolerance ? ` (tolerância ${c.tolerance})` : ''}`);

  const discMedal = disc >= c.discMedalMin - EPS && dedOk;
  if (disc < c.discMedalMin - EPS) why.DISC_MEDALHA.push(`conceito ${r2(disc)} < ${c.discMedalMin}`);
  if (!dedOk) why.DISC_MEDALHA.push(dedMsg);

  const discAlamar = disc >= c.discAlamarMin - EPS && dedOk;
  if (disc < c.discAlamarMin - EPS) why.DISC_ALAMAR.push(`conceito ${r2(disc)} < ${c.discAlamarMin}`);
  if (!dedOk) why.DISC_ALAMAR.push(dedMsg);

  const pedMedal = pedOk(c.pedMedalMin) && noteOk && dedOk;
  if (!pedOk(c.pedMedalMin)) why.PED_MEDALHA.push(pedMsg(c.pedMedalMin));
  if (hasPed && !noteOk) why.PED_MEDALHA.push(`nota ${r2(minNote)} abaixo de ${c.minNote}`);
  if (!dedOk) why.PED_MEDALHA.push(dedMsg);

  const pedAlamar = pedOk(c.pedAlamarMin) && noteOk && tmdCount <= c.pedAlamarMaxTmd;
  if (!pedOk(c.pedAlamarMin)) why.PED_ALAMAR.push(pedMsg(c.pedAlamarMin));
  if (hasPed && !noteOk) why.PED_ALAMAR.push(`nota ${r2(minNote)} abaixo de ${c.minNote}`);
  if (tmdCount > c.pedAlamarMaxTmd) why.PED_ALAMAR.push(`${tmdCount} TMD(s) no ano (máximo ${c.pedAlamarMaxTmd})`);

  const duplo = pedOk(c.duploPedMin) && noteOk && disc >= c.duploDiscMin - EPS && dedOk;

  const auto = {
    DISC_MEDALHA: discMedal,
    DISC_ALAMAR: discAlamar || duplo,
    PED_MEDALHA: pedMedal,
    PED_ALAMAR: pedAlamar || duplo,
  };
  const ov = {};
  for (const o of overrides) ov[o.field] = o.value;
  const final = {};
  for (const f of FIELDS) final[f] = f in ov ? ov[f] : auto[f];

  return {
    studentId: student.id,
    registration: student.registration,
    name: student.name,
    callNumber: student.callNumber ?? null,
    disc: r2(disc), maxDeduction: r2(maxDeduction), totalDeduction: r2(totalDeduction), tmdCount,
    ped: {
      bimesters: bims.map((g) => (g && g.average != null ? r2(g.average) : null)),
      counts: bims.map((g) => (g ? g.subjectCount : 0)),
      avg: r2(pedAvg), minNote: r2(minNote), missing, incomplete,
    },
    duplo,
    auto, overrides: ov, final,
    dourado: !!ov.DOURADO,
    why,
  };
}

// ---------------------------------------------------------------- turma(s)
export async function computeHonors({ year, classId = null }) {
  const criteria = await getCriteria(year);
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));
  const classes = await prisma.class.findMany({
    where: { active: true, ...(classId ? { id: classId } : {}) },
    orderBy: { name: 'asc' },
    include: {
      students: {
        where: { status: 'ATIVO' },
        orderBy: { name: 'asc' },
        include: {
          academicGrades: { where: { schoolYear: year } },
          honorOverrides: { where: { schoolYear: year } },
          occurrences: {
            where: { status: { in: ['APROVADO', 'ARQUIVADO', 'AUTO_GERADO'] }, occurredAt: { gte: start, lt: end } },
            select: { type: true, scoreImpact: true },
          },
        },
      },
    },
  });
  const turmas = ordenarTurmas(classes).map((cl) => ({
    classId: cl.id,
    name: cl.name,
    cia: posicaoDaTurma(cl.name).cia,
    ciaTitulo: posicaoDaTurma(cl.name).titulo,
    students: cl.students.map((s) => evaluateStudent({
      student: s, grades: s.academicGrades, occurrences: s.occurrences, overrides: s.honorOverrides, criteria,
    })),
  }));
  const todas = ordenarTurmas(await prisma.class.findMany({ where: { active: true }, select: { id: true, name: true } }))
    .map((c) => ({ classId: c.id, name: c.name, cia: posicaoDaTurma(c.name).cia }));
  return { year, criteria, turmas, opcoes: todas };
}
