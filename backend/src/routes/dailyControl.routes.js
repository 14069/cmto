import express from 'express';
import { z } from 'zod';
import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import prisma from '../utils/prisma.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { auditLog } from '../middleware/audit.js';

const router = express.Router();
router.use(authenticate);

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGO = join(__dirname, '../assets/brasao.png');
const ROLES = ['ADMIN', 'COORD_DISCIPLINAR', 'COORD_PEDAGOGICO', 'MONITOR'];
const canUse = authorize(...ROLES);

// Mesma sequência institucional usada na Condecoração e no modelo físico.
const CLASS_SEQUENCE = [
  '33.01', '33.02', '23.01', '24.01',
  '13.01', '13.02', '92.01', '92.02',
  '82.01', '82.02', '72.01', '62.01',
];

function classSequenceIndex(name) {
  const value = String(name || '').trim().toUpperCase();
  const index = CLASS_SEQUENCE.findIndex((code) =>
    value === code || value.startsWith(`${code}/`) || value.startsWith(`${code} `) || value.startsWith(`${code}-`)
  );
  return index === -1 ? CLASS_SEQUENCE.length : index;
}

function compareClassNames(a, b) {
  const ai = classSequenceIndex(a);
  const bi = classSequenceIndex(b);
  if (ai !== bi) return ai - bi;
  return String(a || '').localeCompare(String(b || ''), 'pt-BR', { numeric: true, sensitivity: 'base' });
}

function sortClassesBySequence(rows = [], field = 'name') {
  return [...rows].sort((a, b) => compareClassNames(a?.[field], b?.[field]));
}

function sortAbsencesBySequence(rows = []) {
  return [...rows].sort((a, b) => {
    const classCmp = compareClassNames(a.className, b.className);
    if (classCmp) return classCmp;
    const aCall = a.callNumber == null ? Number.MAX_SAFE_INTEGER : Number(a.callNumber);
    const bCall = b.callNumber == null ? Number.MAX_SAFE_INTEGER : Number(b.callNumber);
    if (aCall !== bCall) return aCall - bCall;
    return String(a.studentName || '').localeCompare(String(b.studentName || ''), 'pt-BR', { sensitivity: 'base' });
  });
}

const optionalText = z.string().max(250).optional().nullable();
const dailyControlSchema = z.object({
  controlDate: z.string().min(10),
  chiefGeneral: optionalText,
  chiefGeneralClass: optionalText,
  deputyChief: optionalText,
  deputyChiefClass: optionalText,
  observations: z.string().max(4000).optional().nullable(),
  absentStudentIds: z.array(z.string()).default([]),
});

function cleanText(value) {
  const v = String(value ?? '').trim();
  return v || null;
}

function normalizeDate(value) {
  const raw = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function fmtDate(value) {
  return new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function totals(classes = []) {
  return classes.reduce((acc, row) => ({
    effective: acc.effective + row.effective,
    present: acc.present + row.present,
    absent: acc.absent + row.absent,
  }), { effective: 0, present: 0, absent: 0 });
}

async function currentSchoolSnapshot(absentStudentIds = []) {
  const rawClasses = await prisma.class.findMany({
    where: { active: true },
    include: {
      students: {
        where: { status: 'ATIVO' },
        select: { id: true, name: true, registration: true, callNumber: true },
        orderBy: [{ callNumber: 'asc' }, { name: 'asc' }],
      },
    },
  });
  const classes = sortClassesBySequence(rawClasses);

  const allStudents = classes.flatMap((c) => c.students.map((s) => ({ ...s, classId: c.id, className: c.name })));
  const validIds = new Set(allStudents.map((s) => s.id));
  const absentSet = new Set(absentStudentIds.filter((id) => validIds.has(id)));

  const classRows = classes.map((c) => {
    const absent = c.students.filter((s) => absentSet.has(s.id)).length;
    const effective = c.students.length;
    return {
      classId: c.id,
      className: c.name,
      effective,
      present: Math.max(0, effective - absent),
      absent,
    };
  });

  const absenceRows = allStudents
    .filter((s) => absentSet.has(s.id))
    .map((s) => ({
      studentId: s.id,
      studentName: s.name,
      registration: s.registration || null,
      callNumber: s.callNumber ?? null,
      className: s.className,
    }));

  return { classes, classRows, absenceRows };
}

function serializeControl(control) {
  const orderedClasses = sortClassesBySequence(control.classes || [], 'className');
  const orderedAbsences = sortAbsencesBySequence(control.absences || []);
  const sum = totals(orderedClasses);
  return { ...control, classes: orderedClasses, absences: orderedAbsences, totals: sum };
}

// Dados atuais das turmas/alunos para montar a chamada do dia.
router.get('/setup', canUse, async (req, res, next) => {
  try {
    const classes = await prisma.class.findMany({
      where: { active: true },
      include: {
        students: {
          where: { status: 'ATIVO' },
          select: { id: true, name: true, registration: true, callNumber: true },
          orderBy: [{ callNumber: 'asc' }, { name: 'asc' }],
        },
      },
    });
    res.json(sortClassesBySequence(classes));
  } catch (err) { next(err); }
});

router.get('/', canUse, async (req, res, next) => {
  try {
    const controls = await prisma.dailyControl.findMany({
      include: {
        createdBy: { select: { id: true, name: true } },
        classes: { orderBy: { className: 'asc' } },
        _count: { select: { absences: true } },
      },
      orderBy: [{ controlDate: 'desc' }, { createdAt: 'desc' }],
    });
    res.json(controls.map((c) => serializeControl({ ...c, absenceCount: c._count.absences, _count: undefined })));
  } catch (err) { next(err); }
});

router.get('/:id', canUse, async (req, res, next) => {
  try {
    const control = await prisma.dailyControl.findUnique({
      where: { id: req.params.id },
      include: {
        createdBy: { select: { id: true, name: true } },
        classes: { orderBy: { className: 'asc' } },
        absences: { orderBy: [{ className: 'asc' }, { callNumber: 'asc' }, { studentName: 'asc' }] },
      },
    });
    if (!control) return res.status(404).json({ error: 'Controle diário não encontrado' });
    res.json(serializeControl(control));
  } catch (err) { next(err); }
});

router.post('/', canUse, async (req, res, next) => {
  try {
    const body = dailyControlSchema.parse(req.body);
    const controlDate = normalizeDate(body.controlDate);
    if (!controlDate) return res.status(400).json({ error: 'Data inválida' });

    const exists = await prisma.dailyControl.findUnique({ where: { controlDate } });
    if (exists) return res.status(409).json({ error: `Já existe um Controle Diário para ${fmtDate(controlDate)}.` });

    const snapshot = await currentSchoolSnapshot(body.absentStudentIds);
    const data = {
      controlDate,
      chiefGeneral: cleanText(body.chiefGeneral),
      chiefGeneralClass: cleanText(body.chiefGeneralClass),
      deputyChief: cleanText(body.deputyChief),
      deputyChiefClass: cleanText(body.deputyChiefClass),
      observations: cleanText(body.observations),
      createdById: req.user.id,
      classes: { create: snapshot.classRows },
      absences: { create: snapshot.absenceRows },
    };

    const created = await prisma.dailyControl.create({
      data,
      include: { classes: true, absences: true, createdBy: { select: { id: true, name: true } } },
    });
    await auditLog({ userId: req.user.id, action: 'CREATE', entity: 'DailyControl', entityId: created.id, newData: created, req });
    res.status(201).json(serializeControl(created));
  } catch (err) { next(err); }
});

router.put('/:id', canUse, async (req, res, next) => {
  try {
    const body = dailyControlSchema.parse(req.body);
    const old = await prisma.dailyControl.findUnique({
      where: { id: req.params.id },
      include: { classes: true, absences: true },
    });
    if (!old) return res.status(404).json({ error: 'Controle diário não encontrado' });

    const controlDate = normalizeDate(body.controlDate);
    if (!controlDate) return res.status(400).json({ error: 'Data inválida' });
    const conflict = await prisma.dailyControl.findFirst({
      where: { controlDate, id: { not: req.params.id } },
    });
    if (conflict) return res.status(409).json({ error: `Já existe um Controle Diário para ${fmtDate(controlDate)}.` });

    const snapshot = await currentSchoolSnapshot(body.absentStudentIds);
    const updated = await prisma.$transaction(async (tx) => {
      await tx.dailyControlClass.deleteMany({ where: { dailyControlId: req.params.id } });
      await tx.dailyControlAbsence.deleteMany({ where: { dailyControlId: req.params.id } });
      return tx.dailyControl.update({
        where: { id: req.params.id },
        data: {
          controlDate,
          chiefGeneral: cleanText(body.chiefGeneral),
          chiefGeneralClass: cleanText(body.chiefGeneralClass),
          deputyChief: cleanText(body.deputyChief),
          deputyChiefClass: cleanText(body.deputyChiefClass),
          observations: cleanText(body.observations),
          classes: { create: snapshot.classRows },
          absences: { create: snapshot.absenceRows },
        },
        include: { classes: true, absences: true, createdBy: { select: { id: true, name: true } } },
      });
    });

    await auditLog({ userId: req.user.id, action: 'UPDATE', entity: 'DailyControl', entityId: updated.id, oldData: old, newData: updated, req });
    res.json(serializeControl(updated));
  } catch (err) { next(err); }
});

router.delete('/:id', authorize('ADMIN', 'COORD_DISCIPLINAR', 'COORD_PEDAGOGICO'), async (req, res, next) => {
  try {
    const old = await prisma.dailyControl.findUnique({ where: { id: req.params.id }, include: { classes: true, absences: true } });
    if (!old) return res.status(404).json({ error: 'Controle diário não encontrado' });
    await prisma.dailyControl.delete({ where: { id: req.params.id } });
    await auditLog({ userId: req.user.id, action: 'DELETE', entity: 'DailyControl', entityId: req.params.id, oldData: old, req });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

function pageFooter(doc) {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    const y = doc.page.height - 28;
    doc.font('Helvetica').fontSize(7).fillColor('#555555')
      .text(`Controle Diário · CMTO Professora Antonina Milhomem`, 40, y, { width: 400, lineBreak: false });
    doc.text(`Página ${i + 1} de ${range.count}`, 40, y, { width: doc.page.width - 80, align: 'right', lineBreak: false });
  }
}

function institutionalHeader(doc) {
  const W = doc.page.width - 80;
  const CX = doc.page.width / 2;
  if (existsSync(LOGO)) {
    doc.image(LOGO, CX - 22, 18, { height: 48 });
  }
  doc.y = 72;
  doc.font('Helvetica').fontSize(8.8).fillColor('#000000')
    .text('COLÉGIO MILITAR DO TOCANTINS PROF.ª ANTONINA MILHOMEM UNIDADE VI', 40, doc.y, { width: W, align: 'center' });
  doc.fontSize(8.3)
    .text('Coordenação Disciplinar', 40, doc.y, { width: W, align: 'center' });
  doc.moveDown(1.4);
}

function ensurePdfSpace(doc, needed, onNewPage = null) {
  if (doc.y + needed > doc.page.height - 55) {
    doc.addPage();
    if (onNewPage) onNewPage();
    else doc.y = 45;
  }
}

router.get('/:id/pdf', canUse, async (req, res, next) => {
  try {
    const control = await prisma.dailyControl.findUnique({
      where: { id: req.params.id },
      include: {
        classes: { orderBy: { className: 'asc' } },
        absences: { orderBy: [{ className: 'asc' }, { callNumber: 'asc' }, { studentName: 'asc' }] },
        createdBy: { select: { name: true } },
      },
    });
    if (!control) return res.status(404).json({ error: 'Controle diário não encontrado' });
    control.classes = sortClassesBySequence(control.classes || [], 'className');
    control.absences = sortAbsencesBySequence(control.absences || []);

    const day = fmtDate(control.controlDate);
    const fileDay = dateKey(control.controlDate).split('-').reverse().join('-');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="CONTROLE-DIARIO-${fileDay}.pdf"`);

    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    doc.pipe(res);
    institutionalHeader(doc);

    const W = doc.page.width - 80;
    const BLUE = '#08247f';
    const LIGHT_GRAY = '#d9d9d9';

    // Faixa de título, seguindo o modelo físico do Controle Diário.
    const titleY = doc.y;
    doc.rect(40, titleY, W, 28).fill(BLUE);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(15)
      .text('CONTROLE DIÁRIO', 40, titleY + 6, { width: W, align: 'center' });
    doc.y = titleY + 43;

    doc.fillColor('#000000').font('Helvetica').fontSize(9.5).text(`DATA: ${day}`, 40, doc.y);
    doc.moveDown(0.8);

    const chief = control.chiefGeneral || '_______________________________________________';
    const chiefClass = control.chiefGeneralClass || '________________';
    const deputy = control.deputyChief || '_______________________________________________';
    const deputyClass = control.deputyChiefClass || '________________';
    doc.font('Helvetica').fontSize(9.2)
      .text(`CHEFE GERAL: ${chief}    TURMA: ${chiefClass}`, 40, doc.y, { width: W });
    doc.moveDown(0.55);
    doc.text(`SUBCHEFE: ${deputy}    TURMA: ${deputyClass}`, 40, doc.y, { width: W });
    doc.moveDown(0.9);

    const cols = [40, 140, 275, 415, 555];
    const rowH = 22;
    const drawClassHeader = () => {
      const y = doc.y;
      doc.rect(40, y, W, rowH).fillAndStroke(BLUE, '#000000');
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.6);
      ['TURMA', 'EFETIVO', 'PRESENTES', 'AUSENTES'].forEach((label, idx) => {
        doc.text(label, cols[idx] + 3, y + 7, { width: cols[idx + 1] - cols[idx] - 6, align: 'center' });
      });
      cols.slice(1, -1).forEach((x) => doc.moveTo(x, y).lineTo(x, y + rowH).strokeColor('#000000').stroke());
      doc.y = y + rowH;
    };
    drawClassHeader();
    const total = totals(control.classes);
    for (const row of control.classes) {
      ensurePdfSpace(doc, rowH + 10, drawClassHeader);
      const y = doc.y;
      doc.rect(40, y, W, rowH).strokeColor('#000000').stroke();
      doc.rect(cols[0], y, cols[1] - cols[0], rowH).fillAndStroke(LIGHT_GRAY, '#000000');
      cols.slice(1, -1).forEach((x) => doc.moveTo(x, y).lineTo(x, y + rowH).strokeColor('#000000').stroke());
      doc.fillColor('#000000').font('Helvetica-Bold').fontSize(8.5)
        .text(row.className, cols[0] + 3, y + 7, { width: cols[1] - cols[0] - 6, align: 'center' });
      doc.font('Helvetica').fontSize(8.5);
      [row.effective, row.present, row.absent].forEach((value, idx) => {
        const col = idx + 1;
        doc.text(String(value), cols[col] + 3, y + 7, { width: cols[col + 1] - cols[col] - 6, align: 'center' });
      });
      doc.y = y + rowH;
    }
    ensurePdfSpace(doc, rowH + 10, drawClassHeader);
    {
      const y = doc.y;
      doc.rect(40, y, W, rowH).fillAndStroke(LIGHT_GRAY, '#000000');
      cols.slice(1, -1).forEach((x) => doc.moveTo(x, y).lineTo(x, y + rowH).strokeColor('#000000').stroke());
      doc.fillColor('#000000').font('Helvetica-Bold').fontSize(8.5);
      ['TOTAL', total.effective, total.present, total.absent].forEach((value, idx) => {
        doc.text(String(value), cols[idx] + 3, y + 7, { width: cols[idx + 1] - cols[idx] - 6, align: 'center' });
      });
      doc.y = y + rowH + 8;
    }

    const absentClassX = 40;
    const absentNameX = 145;
    const absentMidX = 350;
    const absentEndX = 555;
    const drawAbsentSectionHeader = () => {
      let y = doc.y;
      doc.rect(40, y, W, 22).strokeColor('#000000').stroke();
      doc.fillColor('#000000').font('Helvetica-Bold').fontSize(9.5)
        .text('ALUNOS FALTOSOS', 40, y + 6, { width: W, align: 'center' });
      y += 22;
      doc.rect(40, y, W, 20).stroke();
      doc.moveTo(absentNameX, y).lineTo(absentNameX, y + 20).stroke();
      doc.font('Helvetica').fontSize(8.5)
        .text('TURMA', absentClassX + 3, y + 6, { width: absentNameX - absentClassX - 6, align: 'center' });
      doc.text('NOME', absentNameX + 3, y + 6, { width: absentEndX - absentNameX - 6, align: 'center' });
      doc.y = y + 20;
    };

    ensurePdfSpace(doc, 70);
    drawAbsentSectionHeader();

    const grouped = new Map();
    for (const a of control.absences) {
      if (!grouped.has(a.className)) grouped.set(a.className, []);
      grouped.get(a.className).push(a);
    }

    if (!control.absences.length) {
      const y = doc.y;
      doc.rect(40, y, W, 28).stroke();
      doc.font('Helvetica').fontSize(8.5).text('Nenhum aluno faltoso registrado.', 44, y + 9, { width: W - 8, align: 'center' });
      doc.y = y + 28;
    } else {
      for (const [className, students] of grouped.entries()) {
        for (let offset = 0; offset < students.length; offset += 10) {
          const chunk = students.slice(offset, offset + 10);
          const left = chunk.slice(0, 5);
          const right = chunk.slice(5, 10);
          const rows = Math.max(left.length, right.length, 1);
          const h = Math.max(28, rows * 19);
          ensurePdfSpace(doc, h + 8, drawAbsentSectionHeader);
          const y = doc.y;

          doc.rect(40, y, W, h).strokeColor('#000000').stroke();
          doc.moveTo(absentNameX, y).lineTo(absentNameX, y + h).stroke();
          doc.moveTo(absentMidX, y).lineTo(absentMidX, y + h).stroke();
          for (let r = 1; r < rows; r++) {
            const ry = y + r * 19;
            doc.moveTo(absentNameX, ry).lineTo(absentEndX, ry).stroke();
          }

          doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000')
            .text(offset ? `${className} (cont.)` : className, absentClassX + 4, y + Math.max(7, h / 2 - 6), {
              width: absentNameX - absentClassX - 8,
              align: 'center',
            });

          const drawStudent = (a, x, yy, width) => {
            if (!a) return;
            const prefix = a.callNumber != null ? `${a.callNumber}. ` : '';
            doc.font('Helvetica').fontSize(7.6).fillColor('#000000')
              .text(`${prefix}${a.studentName}`, x + 5, yy + 5, { width: width - 10, height: 14, ellipsis: true });
          };
          for (let r = 0; r < rows; r++) {
            drawStudent(left[r], absentNameX, y + r * 19, absentMidX - absentNameX);
            drawStudent(right[r], absentMidX, y + r * 19, absentEndX - absentMidX);
          }
          doc.y = y + h;
        }
      }
    }

    doc.y += 15;
    ensurePdfSpace(doc, 80);
    doc.font('Helvetica-Bold').fontSize(10).text('OBSERVAÇÕES', 40, doc.y);
    doc.moveDown(0.35);
    const obs = control.observations || '';
    const obsH = Math.max(55, doc.heightOfString(obs || ' ', { width: W - 14, fontSize: 9 }) + 18);
    const oy = doc.y;
    doc.rect(40, oy, W, obsH).stroke();
    if (obs) doc.font('Helvetica').fontSize(9).text(obs, 47, oy + 8, { width: W - 14, align: 'justify' });
    doc.y = oy + obsH + 8;
    doc.font('Helvetica').fontSize(7.5).fillColor('#666666')
      .text(`Registro realizado no sistema por ${control.createdBy?.name || 'usuário do sistema'}.`, 40, doc.y, { width: W, align: 'right' });

    pageFooter(doc);
    doc.end();
  } catch (err) { next(err); }
});

router.get('/:id/counting-pdf', canUse, async (req, res, next) => {
  try {
    const control = await prisma.dailyControl.findUnique({
      where: { id: req.params.id },
      include: {
        classes: { orderBy: { className: 'asc' } },
        absences: { orderBy: [{ className: 'asc' }, { callNumber: 'asc' }, { studentName: 'asc' }] },
      },
    });
    if (!control) return res.status(404).json({ error: 'Controle diário não encontrado' });
    control.classes = sortClassesBySequence(control.classes || [], 'className');
    control.absences = sortAbsencesBySequence(control.absences || []);

    const fileDay = dateKey(control.controlDate).split('-').reverse().join('-');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="CONTAGEM-CONTROLE-DIARIO-${fileDay}.pdf"`);

    const doc = new PDFDocument({ size: 'A4', margin: 28, bufferPages: true });
    doc.pipe(res);
    const pageW = doc.page.width;
    const margin = 42;
    const usableW = pageW - margin * 2;
    const day = fmtDate(control.controlDate);

    const absenceByClass = new Map();
    for (const a of control.absences) {
      if (!absenceByClass.has(a.className)) absenceByClass.set(a.className, []);
      absenceByClass.get(a.className).push(a);
    }

    // Uma turma pode ter mais de 10 faltosos; nesse caso, gera uma ficha de continuação.
    const slips = [];
    for (const row of control.classes) {
      const abs = absenceByClass.get(row.className) || [];
      if (abs.length <= 10) slips.push({ row, abs, continuation: 0 });
      else {
        for (let i = 0; i < abs.length; i += 10) {
          slips.push({ row, abs: abs.slice(i, i + 10), continuation: i / 10 });
        }
      }
    }

    function drawPageHeader() {
      institutionalHeader(doc);
      doc.y += 2;
    }

    function drawSlip(slip, y) {
      const { row, abs, continuation } = slip;
      const labelW = 80;
      const tableX = margin;
      const valueX = tableX + labelW;
      const tableW = usableW;
      const rowSmall = 19;
      const faltososH = 82;
      const heading = continuation ? `CONTAGEM – CONTROLE DIÁRIO · ${row.className} (CONT.)` : 'CONTAGEM – CONTROLE DIÁRIO';

      doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#000000')
        .text(heading, tableX, y, { width: tableW });
      let cy = y + 17;

      const values = [
        ['DATA', day],
        ['TURMA', continuation ? `${row.className} (cont.)` : row.className],
        ['EFETIVO', String(row.effective)],
        ['PRESENTES', String(row.present)],
      ];
      for (const [label, value] of values) {
        doc.rect(tableX, cy, labelW, rowSmall).stroke();
        doc.rect(valueX, cy, tableW - labelW, rowSmall).stroke();
        doc.font('Helvetica-Bold').fontSize(8.5).text(label, tableX + 5, cy + 5, { width: labelW - 10 });
        doc.font('Helvetica').fontSize(8.2).text(value, valueX + 5, cy + 5, { width: tableW - labelW - 10 });
        cy += rowSmall;
      }

      doc.rect(tableX, cy, labelW, faltososH).stroke();
      doc.rect(valueX, cy, tableW - labelW, faltososH).stroke();
      const mid = valueX + (tableW - labelW) / 2;
      doc.moveTo(mid, cy).lineTo(mid, cy + faltososH).stroke();
      doc.font('Helvetica-Bold').fontSize(8.5).text('FALTOSOS', tableX + 5, cy + 5, { width: labelW - 10 });

      const left = abs.slice(0, 5);
      const right = abs.slice(5, 10);
      const colW = (tableW - labelW) / 2;
      for (let i = 0; i < 5; i++) {
        const ly = cy + 5 + i * 14;
        const a = left[i];
        const b = right[i];
        const leftText = a ? `${a.callNumber ?? (i + 1)}. ${a.studentName}` : `${i + 1}.`;
        const rightText = b ? `${b.callNumber ?? (i + 6)}. ${b.studentName}` : `${i + 6}.`;
        doc.font('Helvetica-Bold').fontSize(7.4).text(leftText, valueX + 7, ly, { width: colW - 12, height: 12, ellipsis: true });
        doc.text(rightText, mid + 7, ly, { width: colW - 12, height: 12, ellipsis: true });
      }
    }

    const slipsPerPage = 4;
    const slipH = 176;
    let pageStartY = 0;
    for (let i = 0; i < slips.length; i++) {
      if (i === 0) {
        drawPageHeader();
        pageStartY = doc.y + 4;
      } else if (i % slipsPerPage === 0) {
        doc.addPage();
        drawPageHeader();
        pageStartY = doc.y + 4;
      }

      const pos = i % slipsPerPage;
      drawSlip(slips[i], pageStartY + pos * slipH);
    }

    pageFooter(doc);
    doc.end();
  } catch (err) { next(err); }
});

export default router;
