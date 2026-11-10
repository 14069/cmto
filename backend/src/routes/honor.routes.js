import express from 'express';
import prisma from '../utils/prisma.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { auditLog } from '../middleware/audit.js';
import { getCriteria, saveCriteria, computeHonors, FIELDS, DEFAULT_CRITERIA } from '../services/honorService.js';
import { parseBoletim } from '../services/boletimParser.js';
import { buildHonorPdf } from '../services/honorPdf.js';

const router = express.Router();
router.use(authenticate);

const VIEW = authorize('ADMIN', 'COORD_DISCIPLINAR', 'COORD_PEDAGOGICO');
const EDIT = authorize('ADMIN', 'COORD_DISCIPLINAR');
const IMPORT = authorize('ADMIN', 'COORD_DISCIPLINAR', 'COORD_PEDAGOGICO');

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const yearOf = (req) => Number(req.query.year) || new Date().getFullYear();

// ---- critérios (Portaria) ----
router.get('/criteria', VIEW, async (req, res, next) => {
  try {
    const year = yearOf(req);
    res.json({ year, criteria: await getCriteria(year), defaults: DEFAULT_CRITERIA });
  } catch (err) { next(err); }
});

router.put('/criteria', EDIT, async (req, res, next) => {
  try {
    const year = yearOf(req);
    const old = await getCriteria(year);
    const criteria = await saveCriteria(year, req.body);
    await auditLog({ userId: req.user.id, action: 'UPDATE', entity: 'HonorCriteria', entityId: String(year), oldData: old, newData: criteria, req });
    res.json({ year, criteria });
  } catch (err) { next(err); }
});

// ---- prévia / cálculo ----
router.get('/', VIEW, async (req, res, next) => {
  try {
    const data = await computeHonors({ year: yearOf(req), classId: req.query.classId || null });
    res.json(data);
  } catch (err) { next(err); }
});

// ---- ajuste manual de uma célula (true = concede, false = retira, null = volta ao automático) ----
router.put('/override', EDIT, async (req, res, next) => {
  try {
    const { studentId, field, value } = req.body || {};
    const year = Number(req.body?.year) || yearOf(req);
    if (!studentId || ![...FIELDS, 'DOURADO'].includes(field)) return res.status(400).json({ error: 'Dados inválidos' });
    const where = { studentId_schoolYear_field: { studentId, schoolYear: year, field } };
    if (value === null || value === undefined) {
      await prisma.honorOverride.deleteMany({ where: { studentId, schoolYear: year, field } });
    } else {
      await prisma.honorOverride.upsert({
        where,
        update: { value: !!value, updatedById: req.user.id },
        create: { studentId, schoolYear: year, field, value: !!value, updatedById: req.user.id },
      });
    }
    await auditLog({ userId: req.user.id, action: 'UPDATE', entity: 'HonorOverride', entityId: studentId, newData: { year, field, value }, req });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ---- importar o boletim (PDF) ----
// POST com o PDF no corpo (Content-Type: application/pdf).  ?apply=1 grava; sem isso só mostra a prévia.
router.post('/import-boletim', IMPORT, express.raw({ type: () => true, limit: '80mb' }), async (req, res, next) => {
  try {
    if (!Buffer.isBuffer(req.body) || req.body.length < 100) return res.status(400).json({ error: 'Envie o PDF do boletim' });
    let parsed;
    try { parsed = await parseBoletim(req.body); } catch (e) { return res.status(400).json({ error: `Não consegui ler o PDF: ${e.message}` }); }
    if (!parsed.alunos.length) return res.status(400).json({ error: 'Nenhum boletim encontrado no PDF', avisos: parsed.avisos });

    const students = await prisma.student.findMany({ where: { status: 'ATIVO' }, include: { class: { select: { name: true } } } });
    const byReg = new Map(students.map((s) => [String(s.registration).trim(), s]));
    const byNameTurma = new Map(students.map((s) => [`${norm(s.name)}|${norm(s.class.name)}`, s]));
    const byName = new Map();
    for (const s of students) { const k = norm(s.name); byName.set(k, byName.has(k) ? null : s); }

    // 1) liga cada página do boletim a um aluno do sistema
    const cand = new Map();           // studentId -> [{student, a}]
    const unmatchedMap = new Map();   // dedupe: o mesmo aluno pode ter várias páginas (turma + itinerário)
    for (const a of parsed.alunos) {
      const s = byReg.get(a.matricula) || byNameTurma.get(`${norm(a.nome)}|${norm(a.turma)}`) || byName.get(norm(a.nome)) || null;
      if (!s) {
        const k = a.matricula || norm(a.nome);
        const u = unmatchedMap.get(k) || { nome: a.nome, matricula: a.matricula, turma: [] };
        if (!u.turma.includes(a.turma)) u.turma.push(a.turma);
        unmatchedMap.set(k, u);
        continue;
      }
      if (!cand.has(s.id)) cand.set(s.id, []);
      cand.get(s.id).push({ student: s, a });
    }
    const unmatched = [...unmatchedMap.values()].map((u) => ({ ...u, turma: u.turma.join(' + ') }));

    // 2) se o aluno tem mais de uma página, fica a da turma dele no sistema (senão a com mais disciplinas)
    const matched = [];
    const duplicados = [];
    for (const list of cand.values()) {
      let pick = list[0];
      if (list.length > 1) {
        const cls = norm(list[0].student.class.name);
        const nDisc = (x) => x.a.disciplinas.filter((d) => d.notas.some((n) => n != null)).length;
        pick = list.find((x) => norm(x.a.turma) === cls) || [...list].sort((x, y) => nDisc(y) - nDisc(x))[0];
        duplicados.push(`${pick.student.name}: ${list.length} boletins (${list.map((x) => x.a.turma).join(', ')}) — usei o da turma ${pick.a.turma}`);
      }
      const a = pick.a;
      const bims = [];
      for (let b = 1; b <= 4; b++) {
        const subj = {};
        for (const d of a.disciplinas) if (d.notas[b - 1] != null) subj[d.disciplina] = d.notas[b - 1];
        const vals = Object.values(subj);
        if (!vals.length) continue;
        bims.push({
          bimester: b, subjects: subj, subjectCount: vals.length,
          average: vals.reduce((x, y) => x + y, 0) / vals.length, minGrade: Math.min(...vals),
        });
      }
      matched.push({ student: pick.student, boletim: a, bims });
    }

    const years = [...new Set(parsed.alunos.map((a) => a.ano).filter(Boolean))];
    const year = years.length === 1 ? years[0] : yearOf(req);
    const porBimestre = [1, 2, 3, 4].map((b) => matched.filter((m) => m.bims.some((x) => x.bimester === b)).length);

    // 3) disciplinas lançadas a menos: compara dentro da própria turma (cada série tem um nº diferente de disciplinas)
    const incompletos = [];
    const byTurma = new Map();
    for (const m of matched) { const k = m.boletim.turma; if (!byTurma.has(k)) byTurma.set(k, []); byTurma.get(k).push(m); }
    const mode = (arr) => { const c = new Map(); arr.forEach((v) => c.set(v, (c.get(v) || 0) + 1)); return [...c.entries()].sort((x, y) => y[1] - x[1] || y[0] - x[0])[0]?.[0] || 0; };
    const lacunas = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const list of byTurma.values()) {
      const expected = Math.max(0, ...[1, 2, 3, 4].map((b) => mode(list.map((m) => m.bims.find((x) => x.bimester === b)?.subjectCount || 0).filter(Boolean))));
      for (const m of list) for (const b of [1, 2, 3, 4]) {
        const g = m.bims.find((x) => x.bimester === b);
        if (g && g.subjectCount < expected) lacunas[b]++;
      }
    }
    for (const b of [1, 2, 3, 4]) if (lacunas[b]) incompletos.push(`${b}º bimestre: ${lacunas[b]} aluno(s) com menos disciplinas lançadas do que o normal da turma — a média desses fica provisória (marcada em âmbar na tela)`);
    if (duplicados.length) incompletos.push(`${duplicados.length} aluno(s) com mais de um boletim no PDF (ex.: turma + itinerário):\n   ${duplicados.slice(0, 15).join('\n   ')}${duplicados.length > 15 ? '\n   …' : ''}`);

    const summary = {
      year, aplicado: false, paginas: parsed.alunos.length, ligados: matched.length, semAluno: unmatched,
      porBimestre, avisos: [...parsed.avisos, ...incompletos],
    };

    if (req.query.apply === '1') {
      await prisma.$transaction(async (tx) => {
        for (const m of matched) {
          for (const g of m.bims) {
            const data = { average: g.average, minGrade: g.minGrade, subjectCount: g.subjectCount, subjects: JSON.stringify(g.subjects), importedAt: new Date() };
            await tx.academicGrade.upsert({
              where: { studentId_schoolYear_bimester: { studentId: m.student.id, schoolYear: year, bimester: g.bimester } },
              update: data,
              create: { studentId: m.student.id, schoolYear: year, bimester: g.bimester, ...data },
            });
          }
        }
      }, { timeout: 120000, maxWait: 30000 });
      summary.aplicado = true;
      await auditLog({ userId: req.user.id, action: 'IMPORT', entity: 'AcademicGrade', entityId: String(year), newData: { alunos: matched.length, semAluno: unmatched.length }, req });
    }
    res.json(summary);
  } catch (err) { next(err); }
});

// ---- PDF da solenidade ----
router.get('/pdf', EDIT, async (req, res, next) => {
  try {
    const year = yearOf(req);
    const { turmas } = await computeHonors({ year, classId: req.query.classId || null });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="condecoracao-${year}.pdf"`);
    buildHonorPdf(res, { year, turmas });
    await auditLog({ userId: req.user.id, action: 'EXPORT', entity: 'HonorPdf', entityId: String(year), req });
  } catch (err) { next(err); }
});

export default router;
