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

// Monitor/Professor só enxergam as turmas que lhes foram atribuídas.
const isScoped = (u) => u.role === 'MONITOR' || u.role === 'PROFESSOR';
const canManage = authorize('ADMIN', 'COORD_DISCIPLINAR', 'COORD_PEDAGOGICO');

const LEVEL_LABEL = {
  LEVE: 'Leve',
  MEDIA: 'Média',
  GRAVE: 'Grave',
  GRAVISSIMO: 'Gravíssima',
};

const LEVEL_PRIORITY = { LEVE: 1, MEDIA: 2, GRAVE: 3, GRAVISSIMO: 4 };

const splitIds = (value) => String(value || '').split(',').map((x) => x.trim()).filter(Boolean);
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—');
const fmtScore = (n) => Number.isFinite(Number(n)) ? Number(n).toFixed(1).replace('.', ',') : '—';
const fmtPoints = (n) => Number.isFinite(Number(n)) ? Math.abs(Number(n)).toFixed(2).replace('.', ',') : '0,00';
const safeFile = (v) => String(v || 'documento')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9_-]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'documento';

function highestNature(tmds = []) {
  const level = tmds.reduce((best, t) => {
    if ((LEVEL_PRIORITY[t.tmdLevel] || 0) > (LEVEL_PRIORITY[best] || 0)) return t.tmdLevel;
    return best;
  }, null);
  return LEVEL_LABEL[level] || null;
}

function extractAnnotationParts(description = '', categoryName = '') {
  const match = String(description).match(/^\[([^\]]+)\]\s*/);
  return {
    legal: match?.[1] || categoryName || '—',
    description: match ? String(description).replace(/^\[[^\]]+\]\s*/, '') : String(description),
  };
}

async function getTacBundle(id) {
  const tac = await prisma.tAC.findUnique({
    where: { id },
    include: {
      student: { include: { class: true } },
      createdBy: { select: { id: true, name: true, role: true } },
    },
  });
  if (!tac) return null;

  const tmdIds = splitIds(tac.linkedTmdIds);
  let tmds = [];
  let annotations = [];

  if (tmdIds.length) {
    const found = await prisma.occurrence.findMany({
      where: { id: { in: tmdIds }, studentId: tac.studentId, type: 'TMD' },
      orderBy: { occurredAt: 'asc' },
    });
    const byId = new Map(found.map((t) => [t.id, t]));
    tmds = tmdIds.map((idValue) => byId.get(idValue)).filter(Boolean);

    const annotationIds = [...new Set(tmds.flatMap((t) => splitIds(t.generatedFromIds)))];
    if (annotationIds.length) {
      annotations = await prisma.occurrence.findMany({
        where: { id: { in: annotationIds } },
        include: { category: true },
        orderBy: { occurredAt: 'asc' },
      });
    }
  }

  return { tac, tmds, annotations };
}

function assertScope(req, tac) {
  if (isScoped(req.user) && !req.user.classIds.includes(tac.student.classId)) {
    const err = new Error('Acesso negado a esta turma');
    err.status = 403;
    throw err;
  }
}

const tacSchema = z.object({
  studentId: z.string().min(1, 'Selecione o aluno'),
  tacNumber: z.string().trim().min(1, 'Informe o número do TAC').max(30, 'Número do TAC muito longo'),
  description: z.string().trim().min(20, 'Descreva os fatos que fundamentam o TAC'),
  goals: z.string().trim().max(5000).optional().default(''),
  startDate: z.string().min(1, 'Informe a data do TAC'),
  endDate: z.string().min(1, 'Informe a data final de acompanhamento'),
  scoreAtCreation: z.number().min(0).max(10).optional(),
  conceptAtCreation: z.string().trim().max(60).optional().nullable(),
  disciplinaryNature: z.string().trim().max(40).optional().nullable(),
  linkedTmdIds: z.array(z.string()).optional().default([]),
  coordinatorName: z.string().trim().max(120).optional().nullable(),
  responsibleName: z.string().trim().max(120).optional().nullable(),
  monitorName: z.string().trim().max(120).optional().nullable(),
});

const tacUpdateSchema = tacSchema.partial();

async function validateTacNumber(tacNumber, excludeId = null) {
  const existing = await prisma.tAC.findFirst({
    where: {
      tacNumber,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  return !existing;
}

async function validateLinkedTmds(studentId, ids) {
  if (!ids?.length) return [];
  const uniqueIds = [...new Set(ids)];
  const tmds = await prisma.occurrence.findMany({
    where: { id: { in: uniqueIds }, studentId, type: 'TMD' },
    select: { id: true, tmdLevel: true, tmdNumber: true },
  });
  if (tmds.length !== uniqueIds.length) {
    const err = new Error('Um ou mais TMDs selecionados não pertencem ao aluno ou não existem');
    err.status = 400;
    throw err;
  }
  return tmds;
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF helpers
// ─────────────────────────────────────────────────────────────────────────────
function installInstitutionHeader(doc) {
  const draw = () => {
    const pageW = doc.page.width;
    const usable = pageW - 100;
    const cx = pageW / 2;

    if (existsSync(LOGO)) {
      doc.image(LOGO, cx - 24, 22, { height: 50 });
    }
    doc.font('Helvetica-Bold').fontSize(7.4).fillColor('#000000');
    const lines = [
      'POLÍCIA MILITAR DO ESTADO DO TOCANTINS',
      'SECRETARIA DA EDUCAÇÃO, JUVENTUDE E DESPORTO.',
      'COLÉGIO MILITAR DE ARAGUATINS-TO',
      'COORDENAÇÃO DISCIPLINAR',
    ];
    let y = 78;
    for (const line of lines) {
      doc.text(line, 50, y, { width: usable, align: 'center', lineBreak: false });
      y += 9;
    }
    doc.y = 126;
    doc.x = 50;
  };

  draw();
  doc.on('pageAdded', draw);
}

function ensureRoom(doc, height = 100) {
  if (doc.y + height > doc.page.height - 70) doc.addPage();
}

function sectionHeading(doc, text) {
  ensureRoom(doc, 45);
  doc.moveDown(0.8);
  doc.font('Helvetica-BoldOblique').fontSize(11).fillColor('#000000')
    .text(text, 50, doc.y, { width: doc.page.width - 100, align: 'center' });
  doc.moveDown(0.8);
}

function paragraph(doc, text, opts = {}) {
  doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(opts.size || 10.5)
    .fillColor('#000000')
    .text(text, 50, doc.y, {
      width: doc.page.width - 100,
      align: opts.align || 'justify',
      indent: opts.indent ?? 34,
      lineGap: opts.lineGap ?? 1.5,
    });
  doc.moveDown(opts.after ?? 0.65);
}

function numberedClause(doc, roman, text) {
  ensureRoom(doc, 70);
  doc.font('Helvetica').fontSize(10.5).fillColor('#000000')
    .text(`${roman} – `, 74, doc.y, { continued: true, width: doc.page.width - 124 });
  doc.text(text, { align: 'justify', lineGap: 1.5 });
  doc.moveDown(0.8);
}

function drawSignatures(doc, tac) {
  ensureRoom(doc, 175);
  doc.moveDown(1.8);
  const left = 50;
  const gap = 52;
  const width = (doc.page.width - 100 - gap) / 2;
  const x2 = left + width + gap;
  const line = (x, y) => doc.moveTo(x, y).lineTo(x + width, y).lineWidth(0.6).strokeColor('#000000').stroke();
  const label = (text, x, y, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.8).fillColor('#000000')
      .text(text || ' ', x, y, { width, align: 'center' });
  };

  let y = doc.y + 16;
  line(left, y); line(x2, y);
  label(tac.coordinatorName || 'COORDENADORA DISCIPLINAR', left, y + 5, true);
  label('COORDENADORA DISCIPLINAR', left, y + 18);
  label(tac.responsibleName || 'RESPONSÁVEL', x2, y + 5, !!tac.responsibleName);
  if (tac.responsibleName) label('RESPONSÁVEL', x2, y + 18);

  y += 82;
  line(left, y); line(x2, y);
  label(tac.monitorName || 'MONITOR DISCIPLINAR', left, y + 5, !!tac.monitorName);
  if (tac.monitorName) label('MONITOR DISCIPLINAR', left, y + 18);
  label('ALUNO (A)', x2, y + 5);

  doc.y = y + 38;
}

function addPageNumbers(doc) {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i);
    doc.font('Helvetica').fontSize(8).fillColor('#000000')
      .text(String(i + 1), 50, doc.page.height - 34, {
        width: doc.page.width - 100,
        align: 'right',
        lineBreak: false,
      });
  }
}

function renderOfficialTac(doc, bundle) {
  const { tac, tmds } = bundle;
  const student = tac.student;
  const number = tac.tacNumber || 'SEM NÚMERO';
  const score = tac.scoreAtCreation ?? student.currentScore;
  const concept = tac.conceptAtCreation || 'Regular';
  const nature = tac.disciplinaryNature || highestNature(tmds) || 'disciplinar';

  doc.font('Helvetica-Bold').fontSize(12.5).fillColor('#000000')
    .text('TERMO DE AJUSTE DE CONDUTA', 50, doc.y, { width: doc.page.width - 100, align: 'center' });
  doc.fontSize(12).text(`Nº ${number}`, 50, doc.y + 2, { width: doc.page.width - 100, align: 'center' });
  doc.moveDown(1.35);

  doc.font('Helvetica').fontSize(10.5).text(
    'A Coordenação Disciplinar do Colégio Militar do Estado do Tocantins – Unidade VI, no uso de suas atribuições previstas no artigo 33 do Regimento Interno, resolve:',
    50, doc.y, { width: doc.page.width - 100, align: 'justify', indent: 34, lineGap: 1.5 }
  );
  doc.moveDown(0.7);

  doc.font('Helvetica').fontSize(10.5).text('ADOTAR TERMO DE AJUSTE DE CONDUTA (TAC)', 84, doc.y, { continued: true });
  doc.text(', com a finalidade de impedir a continuidade da prática reiterada de transgressão disciplinar pelo estudante ', { continued: true });
  doc.font('Helvetica-Bold').text(student.name.toUpperCase(), { continued: true });
  doc.font('Helvetica').text(', da turma ', { continued: true });
  doc.font('Helvetica-Bold').text(student.class.name, { continued: true });
  doc.font('Helvetica').text(', conforme prevê o regimento padrão dos Colégios Militares do Tocantins em seu artigo 87.', {
    align: 'justify', width: doc.page.width - 134, lineGap: 1.5,
  });

  sectionHeading(doc, 'I - DOS FATOS');
  paragraph(doc, tac.description, { indent: 34 });

  paragraph(doc,
    'Conforme o caso em tela, a Coordenação Disciplinar resolve convocar os pais do estudante para estabelecer o TAC, com base no artigo 87 do REGIMENTO PADRÃO DOS COLÉGIOS MILITARES;',
    { indent: 34 }
  );

  sectionHeading(doc, 'II – DO DISPOSITIVO LEGAL');
  paragraph(doc,
    'O Regimento Padrão dos Colégios Militares do Tocantins prevê, em seu artigo 87, as possibilidades em que a unidade escolar poderá adotar o termo de ajuste de conduta, vejamos:',
    { indent: 34 }
  );
  paragraph(doc,
    'Artigo 87. Poderá ser confeccionado o TAC ao estudante que estiver com nota disciplinar abaixo de 6.5 (seis e meio) concomitante com comportamento “Regular” e nos casos em que couber, conforme determinação da gestão do CMTO.',
    { bold: true, indent: 18, after: 0.45 }
  );
  paragraph(doc,
    '§ 1º O estudante que não cumprir o TAC assinado pelos pais ou responsável legal estará sujeito à sanção de TRANSFERÊNCIA para outra unidade escolar.',
    { bold: true, indent: 18, after: 0.6 }
  );

  sectionHeading(doc, 'III – DA MEDIDA DISCIPLINAR');
  paragraph(doc,
    'Diante do exposto, a Coordenação Disciplinar, com base no artigo 87 do Regimento Interno, resolve:',
    { indent: 34 }
  );

  numberedClause(doc, 'I',
    `ADOTAR o Termo de Ajuste de Conduta, onde seu responsável se compromete, junto à unidade escolar, que o estudante, em questão, melhore seu comportamento dentro e fora da sala de aula, proporcionando assim um melhor rendimento da turma ${student.class.name}, que está prejudicado pela conduta do aluno reclamado.`
  );
  numberedClause(doc, 'II',
    'Caso não haja uma evolução na mudança do comportamento do estudante, o responsável se COMPROMETE A SOLICITAR JUNTO À UNIDADE ESCOLAR a transferência de seu filho para outra unidade escolar.'
  );
  numberedClause(doc, 'III',
    'Diante do não cumprimento deste Termo de Ajuste de Conduta, e da quebra de cumprimento por parte dos pais ou responsáveis do estudante, A GESTÃO PODERÁ convocar o conselho disciplinar para votar pela permanência ou não do estudante no Colégio Militar Professora Antonina Milhomem, recurso previsto no parágrafo primeiro do artigo 74 do Regimento Interno do CMTO.'
  );

  if (tac.goals?.trim()) {
    ensureRoom(doc, 80);
    doc.font('Helvetica-Bold').fontSize(10.5).text('Compromissos/observações complementares:', 50, doc.y, { width: doc.page.width - 100 });
    doc.moveDown(0.3);
    paragraph(doc, tac.goals, { indent: 18 });
  }

  paragraph(doc,
    `As condutas praticadas pelo estudante em tela se encontram no Regimento Interno dos Colégios Militares do Tocantins e são consideradas de natureza ${String(nature).toLowerCase()}.`,
    { indent: 34, after: 0.8 }
  );

  ensureRoom(doc, 205);
  const dateText = new Date(tac.startDate).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  doc.font('Helvetica').fontSize(10.5)
    .text(`Araguatins - TO, ${dateText}`, 50, doc.y, { width: doc.page.width - 100, align: 'right' });
  drawSignatures(doc, tac);

  // Metadado invisível não; apenas garante que o snapshot usado está associado ao PDF.
  void score; void concept;
}

function renderAnnex(doc, bundle) {
  const { tac, tmds, annotations } = bundle;
  const student = tac.student;

  doc.font('Helvetica-Bold').fontSize(12.5).fillColor('#000000')
    .text(`ANEXO DISCIPLINAR DO TAC Nº ${tac.tacNumber || '—'}`, 50, doc.y, {
      width: doc.page.width - 100, align: 'center',
    });
  doc.moveDown(1.2);

  const info = [
    ['Aluno', student.name],
    ['Turma', student.class.name],
    ['Nota disciplinar na confecção', fmtScore(tac.scoreAtCreation ?? student.currentScore)],
    ['Conceito informado', tac.conceptAtCreation || '—'],
    ['Natureza', tac.disciplinaryNature || highestNature(tmds) || '—'],
    ['Período de acompanhamento', `${fmtDate(tac.startDate)} a ${fmtDate(tac.endDate)}`],
  ];
  const labelW = 170;
  const totalW = doc.page.width - 100;
  let y = doc.y;
  for (const [label, value] of info) {
    const h = 25;
    doc.rect(50, y, totalW, h).strokeColor('#999999').lineWidth(0.5).stroke();
    doc.font('Helvetica-Bold').fontSize(8.5).text(label, 57, y + 8, { width: labelW - 10 });
    doc.font('Helvetica').fontSize(8.5).text(String(value), 50 + labelW, y + 8, { width: totalW - labelW - 7 });
    y += h;
  }
  doc.y = y + 16;

  doc.font('Helvetica-Bold').fontSize(11).text(`TMDs vinculados (${tmds.length})`, 50, doc.y, { width: totalW });
  doc.moveDown(0.55);

  if (!tmds.length) {
    paragraph(doc, 'Nenhum TMD foi vinculado a este TAC. O termo foi confeccionado por determinação da gestão.', { indent: 0 });
    return;
  }

  const annotationMap = new Map(annotations.map((a) => [a.id, a]));

  for (let i = 0; i < tmds.length; i += 1) {
    const tmd = tmds[i];
    ensureRoom(doc, 105);
    const blockY = doc.y;
    doc.rect(50, blockY, totalW, 28).fillAndStroke('#e8edf5', '#8090aa');
    doc.fillColor('#000000').font('Helvetica-Bold').fontSize(9.2)
      .text(`${String(i + 1).padStart(2, '0')} · TMD Nº ${tmd.tmdNumber || '—'}`, 58, blockY + 8, { continued: true });
    doc.font('Helvetica').text(`   ${fmtDate(tmd.occurredAt)}   ·   ${LEVEL_LABEL[tmd.tmdLevel] || tmd.tmdLevel || '—'}   ·   Desconto ${fmtPoints(tmd.scoreImpact)} ponto(s)`);
    doc.y = blockY + 37;

    const sourceIds = splitIds(tmd.generatedFromIds);
    const source = sourceIds.map((idValue) => annotationMap.get(idValue)).filter(Boolean);
    if (!source.length) {
      doc.font('Helvetica-Oblique').fontSize(8.5).fillColor('#555555')
        .text('Sem anotações de origem vinculadas a este TMD.', 58, doc.y, { width: totalW - 16 });
      doc.moveDown(0.7);
      continue;
    }

    for (const a of source) {
      const parts = extractAnnotationParts(a.description, a.category?.name);
      const descH = doc.heightOfString(parts.description, { width: totalW - 188, fontSize: 8.2 });
      const h = Math.max(32, descH + 14);
      ensureRoom(doc, h + 5);
      const rowY = doc.y;
      doc.rect(50, rowY, totalW, h).strokeColor('#c3c8d1').lineWidth(0.4).stroke();
      doc.moveTo(116, rowY).lineTo(116, rowY + h).stroke();
      doc.moveTo(230, rowY).lineTo(230, rowY + h).stroke();
      doc.font('Helvetica').fontSize(8.2).fillColor('#000000');
      doc.text(fmtDate(a.occurredAt), 54, rowY + 8, { width: 58, align: 'center' });
      doc.text(parts.legal, 120, rowY + 8, { width: 106, align: 'center' });
      doc.text(parts.description, 235, rowY + 7, { width: totalW - 190, align: 'left' });
      doc.y = rowY + h + 4;
    }
    doc.moveDown(0.35);
  }
}

function createPdfResponse(res, filename) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true, info: { Title: filename.replace(/\.pdf$/i, '') } });
  doc.pipe(res);
  installInstitutionHeader(doc);
  return doc;
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { studentId, status } = req.query;
    const where = {};
    if (studentId) where.studentId = studentId;
    if (status) where.status = status;
    if (isScoped(req.user)) where.student = { classId: { in: req.user.classIds } };

    const tacs = await prisma.tAC.findMany({
      where,
      include: {
        student: { include: { class: { select: { id: true, name: true } } } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { startDate: 'desc' },
    });
    res.json(tacs);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const bundle = await getTacBundle(req.params.id);
    if (!bundle) return res.status(404).json({ error: 'TAC não encontrado' });
    assertScope(req, bundle.tac);
    res.json({ ...bundle.tac, linkedTmds: bundle.tmds });
  } catch (err) { next(err); }
});

router.post('/', canManage, async (req, res, next) => {
  try {
    const data = tacSchema.parse(req.body);
    if (!(await validateTacNumber(data.tacNumber))) {
      return res.status(409).json({ error: `Já existe um TAC com o número ${data.tacNumber}.` });
    }

    const student = await prisma.student.findUnique({ where: { id: data.studentId }, include: { class: true } });
    if (!student) return res.status(404).json({ error: 'Aluno não encontrado' });

    const linkedTmds = await validateLinkedTmds(data.studentId, data.linkedTmdIds);
    const nature = data.disciplinaryNature || highestNature(linkedTmds) || null;

    const tac = await prisma.tAC.create({
      data: {
        studentId: data.studentId,
        tacNumber: data.tacNumber,
        title: `TAC Nº ${data.tacNumber}`,
        description: data.description,
        goals: data.goals || '',
        scoreAtCreation: data.scoreAtCreation ?? student.currentScore,
        conceptAtCreation: data.conceptAtCreation || null,
        disciplinaryNature: nature,
        linkedTmdIds: [...new Set(data.linkedTmdIds)].join(','),
        coordinatorName: data.coordinatorName || null,
        responsibleName: data.responsibleName || student.guardianName || null,
        monitorName: data.monitorName || null,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        createdById: req.user.id,
      },
    });
    await auditLog({ userId: req.user.id, action: 'CREATE', entity: 'TAC', entityId: tac.id, newData: tac, req });
    res.status(201).json(tac);
  } catch (err) { next(err); }
});

router.put('/:id', canManage, async (req, res, next) => {
  try {
    const old = await prisma.tAC.findUnique({ where: { id: req.params.id } });
    if (!old) return res.status(404).json({ error: 'TAC não encontrado' });

    const body = tacUpdateSchema.parse(req.body);
    const studentId = body.studentId || old.studentId;

    if (body.tacNumber && body.tacNumber !== old.tacNumber) {
      if (!(await validateTacNumber(body.tacNumber, old.id))) {
        return res.status(409).json({ error: `Já existe um TAC com o número ${body.tacNumber}.` });
      }
    }

    const update = {};
    if (body.studentId !== undefined) update.studentId = body.studentId;
    if (body.tacNumber !== undefined) {
      update.tacNumber = body.tacNumber;
      update.title = `TAC Nº ${body.tacNumber}`;
    }
    if (body.description !== undefined) update.description = body.description;
    if (body.goals !== undefined) update.goals = body.goals;
    if (body.scoreAtCreation !== undefined) update.scoreAtCreation = body.scoreAtCreation;
    if (body.conceptAtCreation !== undefined) update.conceptAtCreation = body.conceptAtCreation || null;
    if (body.disciplinaryNature !== undefined) update.disciplinaryNature = body.disciplinaryNature || null;
    if (body.coordinatorName !== undefined) update.coordinatorName = body.coordinatorName || null;
    if (body.responsibleName !== undefined) update.responsibleName = body.responsibleName || null;
    if (body.monitorName !== undefined) update.monitorName = body.monitorName || null;
    if (body.startDate !== undefined) update.startDate = new Date(body.startDate);
    if (body.endDate !== undefined) update.endDate = new Date(body.endDate);

    if (body.linkedTmdIds !== undefined) {
      const tmds = await validateLinkedTmds(studentId, body.linkedTmdIds);
      update.linkedTmdIds = [...new Set(body.linkedTmdIds)].join(',');
      if (!body.disciplinaryNature && tmds.length) update.disciplinaryNature = highestNature(tmds);
    }

    const tac = await prisma.tAC.update({ where: { id: old.id }, data: update });
    await auditLog({ userId: req.user.id, action: 'UPDATE', entity: 'TAC', entityId: tac.id, oldData: old, newData: tac, req });
    res.json(tac);
  } catch (err) { next(err); }
});

router.delete('/:id', canManage, async (req, res, next) => {
  try {
    const bundle = await getTacBundle(req.params.id);
    if (!bundle) return res.status(404).json({ error: 'TAC não encontrado' });
    assertScope(req, bundle.tac);

    const old = bundle.tac;
    await prisma.tAC.delete({ where: { id: old.id } });

    await auditLog({
      userId: req.user.id,
      action: 'DELETE',
      entity: 'TAC',
      entityId: old.id,
      oldData: old,
      req,
    });

    res.json({ ok: true, message: `TAC Nº ${old.tacNumber || '—'} excluído com sucesso.` });
  } catch (err) { next(err); }
});

router.post('/:id/close', canManage, async (req, res, next) => {
  try {
    const { status, finalEvaluation } = req.body;
    const allowed = ['CUMPRIDO', 'DESCUMPRIDO', 'CANCELADO'];
    const finalStatus = allowed.includes(status) ? status : 'CUMPRIDO';
    const tac = await prisma.tAC.update({
      where: { id: req.params.id },
      data: {
        status: finalStatus,
        finalEvaluation: finalEvaluation || null,
        closedAt: new Date(),
        closedBy: req.user.name,
      },
    });
    await auditLog({ userId: req.user.id, action: 'CLOSE', entity: 'TAC', entityId: tac.id, req });
    res.json(tac);
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// Impressão / PDF
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id/pdf', async (req, res, next) => {
  try {
    const bundle = await getTacBundle(req.params.id);
    if (!bundle) return res.status(404).json({ error: 'TAC não encontrado' });
    assertScope(req, bundle.tac);

    const name = `TAC-${safeFile(bundle.tac.tacNumber || bundle.tac.id)}-${safeFile(bundle.tac.student.name)}.pdf`;
    const doc = createPdfResponse(res, name);
    renderOfficialTac(doc, bundle);
    addPageNumbers(doc);
    doc.end();
  } catch (err) { next(err); }
});

router.get('/:id/annex', async (req, res, next) => {
  try {
    const bundle = await getTacBundle(req.params.id);
    if (!bundle) return res.status(404).json({ error: 'TAC não encontrado' });
    assertScope(req, bundle.tac);

    const name = `Anexo-TAC-${safeFile(bundle.tac.tacNumber || bundle.tac.id)}-${safeFile(bundle.tac.student.name)}.pdf`;
    const doc = createPdfResponse(res, name);
    renderAnnex(doc, bundle);
    addPageNumbers(doc);
    doc.end();
  } catch (err) { next(err); }
});

router.get('/:id/package', async (req, res, next) => {
  try {
    const bundle = await getTacBundle(req.params.id);
    if (!bundle) return res.status(404).json({ error: 'TAC não encontrado' });
    assertScope(req, bundle.tac);

    const name = `TAC-Completo-${safeFile(bundle.tac.tacNumber || bundle.tac.id)}-${safeFile(bundle.tac.student.name)}.pdf`;
    const doc = createPdfResponse(res, name);
    renderOfficialTac(doc, bundle);
    doc.addPage();
    renderAnnex(doc, bundle);
    addPageNumbers(doc);
    doc.end();
  } catch (err) { next(err); }
});

export default router;
