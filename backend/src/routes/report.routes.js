import express from 'express';
import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import prisma from '../utils/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { ARTICLES } from './regimento.routes.js';

const router = express.Router();
router.use(authenticate);

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMD_LOGO = join(__dirname, '../assets/brasao.png');

// Monitor/Professor só enxergam as turmas que lhes foram atribuídas.
const isScoped = (u) => u.role === 'MONITOR' || u.role === 'PROFESSOR';

// Paleta da Coordenação Disciplinar: azul-escuro e vermelho
const COLORS = {
  primary: '#13284c',
  accent: '#c0161f',
  text: '#1f2430',
  muted: '#667085',
  soft: '#c9d3e6',
  line: '#d5dae3',
  zebra: '#f3f5f9',
  danger: '#c0161f',
  warning: '#b7791f',
  success: '#1f7a45',
};

const X0 = 40;            // margem esquerda
const CONTENT_W = 515;    // largura útil de uma página A4 com margens de 40
const PAGE_BOTTOM = 70;   // espaço reservado para o rodapé

function header(doc, title, subtitle) {
  const w = doc.page.width;
  doc.rect(0, 0, w, 86).fill(COLORS.primary);
  doc.rect(0, 86, w, 5).fill(COLORS.accent);
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff')
    .text('CMTO VI · COORDENAÇÃO DISCIPLINAR', X0, 22, { characterSpacing: 1.5, lineBreak: false });
  doc.font('Helvetica').fontSize(8).fillColor(COLORS.soft)
    .text(`Emitido em ${new Date().toLocaleDateString('pt-BR')}`, X0, 22, { width: w - X0 * 2, align: 'right', lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(17).fillColor('#ffffff').text(title, X0, 40, { lineBreak: false });
  if (subtitle) {
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.soft).text(subtitle, X0, 62, { lineBreak: false });
  }
  doc.font('Helvetica').fillColor(COLORS.text);
  doc.x = X0;
  doc.y = 110;
}

function footer(doc) {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // evita que o rodapé crie uma página nova
    const bottom = doc.page.height - 40;
    doc.moveTo(X0, bottom - 8).lineTo(doc.page.width - X0, bottom - 8).lineWidth(0.5).strokeColor(COLORS.line).stroke();
    doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.muted)
      .text(`CMTO VI · Coordenação Disciplinar · Gerado em ${new Date().toLocaleString('pt-BR')}`, X0, bottom, { lineBreak: false });
    doc.text(`Página ${i + 1} de ${range.count}`, X0, bottom, { width: doc.page.width - X0 * 2, align: 'right', lineBreak: false });
  }
}

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—');
const fmtPts = (n) => (n > 0 ? `+${n.toFixed(2)}` : n.toFixed(2));


function parseAnnotationLegal(description = '') {
  const match = String(description).match(/^\[Art\.\s*(\d+)\s*,\s*(?:inc\.|inciso)\s*([^\]]+)\]\s*/i);
  if (!match) return null;
  return {
    artigo: Number(match[1]),
    inciso: match[2].trim(),
    details: String(description).slice(match[0].length).trim(),
  };
}

function officialTipification(annotation) {
  const legal = parseAnnotationLegal(annotation.description);
  if (!legal) {
    return {
      key: `occ-${annotation.id}`,
      amparo: annotation.category?.name || '—',
      texto: 'Tipificação não identificada no Regimento.',
      details: annotation.description,
      natureza: annotation.category?.defaultLevel || null,
    };
  }
  const article = ARTICLES[legal.artigo];
  const inciso = article?.incisos?.find(i => String(i.num).toUpperCase() === String(legal.inciso).toUpperCase());
  return {
    key: `${legal.artigo}-${String(legal.inciso).toUpperCase()}`,
    amparo: `Art. ${legal.artigo}, ${legal.inciso}`,
    texto: inciso?.texto || 'Tipificação não identificada no Regimento.',
    details: legal.details,
    natureza: article?.natureza || annotation.category?.defaultLevel || null,
  };
}

const NATUREZA_LABEL = {
  LEVE: 'Leve',
  MEDIA: 'Média',
  GRAVE: 'Grave',
  GRAVISSIMO: 'Gravíssima',
};

// Quebra de página quando não houver espaço para o próximo bloco
function ensureSpace(doc, h, onNewPage) {
  if (doc.y + h > doc.page.height - PAGE_BOTTOM) {
    doc.addPage();
    doc.y = X0;
    if (onNewPage) onNewPage();
  }
}

function sectionTitle(doc, text) {
  ensureSpace(doc, 70);
  const y = doc.y;
  doc.rect(X0, y, 4, 14).fill(COLORS.accent);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.primary)
    .text(text.toUpperCase(), X0 + 12, y + 2, { characterSpacing: 1, lineBreak: false });
  doc.y = y + 22;
}

// Célula: string ou { text, color, bold, badge (cor de fundo do selo) }
const cellOf = (c) => (c && typeof c === 'object' ? { ...c, text: String(c.text ?? '—') } : { text: String(c ?? '—') });

function table(doc, columns, rows, emptyText) {
  const PAD = 5;
  const totalW = columns.reduce((s, c) => s + c.width, 0);

  if (rows.length === 0) {
    ensureSpace(doc, 30);
    const y = doc.y;
    doc.rect(X0, y, totalW, 26).fill(COLORS.zebra);
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(COLORS.muted)
      .text(emptyText, X0, y + 9, { width: totalW, align: 'center', lineBreak: false });
    doc.y = y + 26 + 18;
    return;
  }

  const drawHead = () => {
    const y = doc.y;
    doc.rect(X0, y, totalW, 20).fill(COLORS.primary);
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#ffffff');
    let x = X0;
    columns.forEach((c) => {
      doc.text(c.label.toUpperCase(), x + PAD, y + 7, { width: c.width - PAD * 2, align: c.align || 'left', lineBreak: false });
      x += c.width;
    });
    doc.y = y + 20;
  };

  ensureSpace(doc, 50);
  drawHead();

  rows.forEach((row, i) => {
    const cells = row.map(cellOf);
    let h = 13;
    cells.forEach((c, j) => {
      if (c.badge) return;
      doc.font(c.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5);
      h = Math.max(h, doc.heightOfString(c.text, { width: columns[j].width - PAD * 2 }));
    });
    h += PAD * 2 + 2;

    ensureSpace(doc, h, drawHead);
    const y = doc.y;
    if (i % 2 === 1) doc.rect(X0, y, totalW, h).fill(COLORS.zebra);

    let x = X0;
    cells.forEach((c, j) => {
      const col = columns[j];
      if (c.badge) {
        doc.font('Helvetica-Bold').fontSize(7);
        const bw = Math.min(col.width - PAD * 2, doc.widthOfString(c.text) + 10);
        const bx = col.align === 'center' ? x + (col.width - bw) / 2 : x + PAD;
        doc.roundedRect(bx, y + PAD, bw, 13, 3).fill(c.badge);
        doc.fillColor('#ffffff').text(c.text, bx, y + PAD + 3.5, { width: bw, align: 'center', lineBreak: false });
      } else {
        doc.font(c.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5).fillColor(c.color || COLORS.text)
          .text(c.text, x + PAD, y + PAD + 1, { width: col.width - PAD * 2, align: col.align || 'left' });
      }
      x += col.width;
    });

    doc.moveTo(X0, y + h).lineTo(X0 + totalW, y + h).lineWidth(0.5).strokeColor(COLORS.line).stroke();
    doc.y = y + h;
  });
  doc.y += 18;
}

const TMD_LEVEL = { LEVE: 'LEVE', MEDIA: 'MÉDIA', GRAVE: 'GRAVE', GRAVISSIMO: 'GRAVÍSSIMO' };
const OCC_STATUS = { APROVADO: 'Aprovada', ARQUIVADO: 'Arquivada', AUTO_GERADO: 'Automática' };
const PRAISE_TYPE = { COLETIVO: 'COLETIVO', INDIVIDUAL: 'INDIVIDUAL', MENCAO_HONROSA: 'MENÇÃO HONROSA' };
const TAC_STATUS = {
  ATIVO: ['EM ANDAMENTO', COLORS.primary],
  CUMPRIDO: ['CUMPRIDO', COLORS.success],
  DESCUMPRIDO: ['DESCUMPRIDO', COLORS.danger],
  CANCELADO: ['CANCELADO', COLORS.muted],
};

function occurrenceType(o) {
  if (o.type === 'TMD') return { text: `TMD ${TMD_LEVEL[o.tmdLevel] || ''}`.trim(), badge: COLORS.accent };
  if (o.type === 'SUSPENSAO') return { text: 'SUSPENSÃO', badge: '#6e0b12' };
  if (o.type === 'ANOTACAO') return { text: 'ANOTAÇÃO', badge: '#4a5d82' };
  return { text: o.type, badge: COLORS.muted };
}

// Relatório individual do aluno
router.get('/student/:id', async (req, res, next) => {
  try {
    const student = await prisma.student.findUnique({
      where: { id: req.params.id },
      include: {
        class: true,
        occurrences: {
          where: { status: { in: ['APROVADO', 'ARQUIVADO', 'AUTO_GERADO'] } },
          orderBy: { occurredAt: 'asc' },
          include: { category: true, createdBy: { select: { name: true } } },
        },
        praises: { orderBy: { occurredAt: 'asc' } },
        tacs: { orderBy: { startDate: 'asc' } },
        scoreHistory: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!student) return res.status(404).json({ error: 'Aluno não encontrado' });
    if (isScoped(req.user) && !req.user.classIds.includes(student.classId)) {
      return res.status(403).json({ error: 'Acesso negado a esta turma' });
    }

    const doc = new PDFDocument({ margin: X0, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="relatorio-${student.registration}.pdf"`);
    doc.pipe(res);

    header(doc, 'Ficha Disciplinar Individual', `${student.name} • ${student.class.name}`);

    // ── Identificação + conceito ────────────────────────────────────────────
    const top = doc.y;
    const boxH = 150;
    const idW = 360;
    const innerW = idW - 24;

    doc.roundedRect(X0, top, idW, boxH, 4).lineWidth(0.8).strokeColor(COLORS.line).stroke();
    doc.font('Helvetica').fontSize(7).fillColor(COLORS.muted)
      .text('ALUNO', X0 + 12, top + 12, { characterSpacing: 1, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(13).fillColor(COLORS.primary)
      .text(student.name, X0 + 12, top + 22, { width: innerW, height: 16, ellipsis: true });

    const fields = [
      ['Matrícula', student.registration], ['Turma', student.class.name],
      ['Nascimento', fmtDate(student.birthDate)], ['Turno', student.class.shift],
      ['Responsável', student.guardianName || '—'], ['Contato do responsável', student.guardianPhone || '—'],
      ['Situação', student.status], ['Ano letivo', student.class.schoolYear],
    ];
    fields.forEach(([k, v], i) => {
      const fx = X0 + 12 + (i % 2) * (innerW / 2);
      const fy = top + 46 + Math.floor(i / 2) * 25;
      doc.font('Helvetica').fontSize(6.5).fillColor(COLORS.muted)
        .text(k.toUpperCase(), fx, fy, { characterSpacing: 0.8, lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.text)
        .text(String(v ?? '—'), fx, fy + 9, { width: innerW / 2 - 8, height: 11, ellipsis: true });
    });

    const sc = student.currentScore;
    const scColor = sc < 5 ? COLORS.danger : sc < 6.5 ? COLORS.warning : COLORS.success;
    const sx = X0 + idW + 10;
    const sw = CONTENT_W - idW - 10;
    doc.roundedRect(sx, top, sw, boxH, 4).fill(COLORS.primary);
    doc.rect(sx, top, sw, 5).fill(COLORS.accent);
    doc.font('Helvetica').fontSize(7).fillColor(COLORS.soft)
      .text('CONCEITO DISCIPLINAR', sx, top + 26, { width: sw, align: 'center', characterSpacing: 1, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(38).fillColor('#ffffff')
      .text(sc.toFixed(2), sx, top + 44, { width: sw, align: 'center', lineBreak: false });
    const barX = sx + 18;
    const barW = sw - 36;
    doc.roundedRect(barX, top + 100, barW, 6, 3).fill('#2b416b');
    doc.roundedRect(barX, top + 100, Math.max(6, barW * Math.min(1, Math.max(0, sc / 10))), 6, 3).fill(scColor);
    doc.font('Helvetica').fontSize(7).fillColor(COLORS.soft)
      .text('0', barX, top + 112, { lineBreak: false })
      .text('10', barX, top + 112, { width: barW, align: 'right', lineBreak: false });

    // ── Resumo ──────────────────────────────────────────────────────────────
    const occ = student.occurrences;
    const countType = (t) => occ.filter((o) => o.type === t).length;
    const cards = [
      ['Anotações', countType('ANOTACAO'), COLORS.primary],
      ['TMDs', countType('TMD'), COLORS.accent],
      ['Suspensões', countType('SUSPENSAO'), COLORS.accent],
      ['Elogios', student.praises.length, COLORS.success],
      ['TACs', student.tacs.length, COLORS.primary],
    ];
    const gap = 8;
    const cw = (CONTENT_W - gap * (cards.length - 1)) / cards.length;
    const cy = top + boxH + 14;
    cards.forEach(([label, n, color], i) => {
      const cx = X0 + i * (cw + gap);
      doc.rect(cx, cy, cw, 46).fill(COLORS.zebra);
      doc.rect(cx, cy, 3, 46).fill(n > 0 ? color : COLORS.line);
      doc.font('Helvetica-Bold').fontSize(18).fillColor(n > 0 ? color : COLORS.muted)
        .text(String(n), cx + 12, cy + 8, { lineBreak: false });
      doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.muted)
        .text(label.toUpperCase(), cx + 12, cy + 31, { characterSpacing: 0.8, lineBreak: false });
    });
    doc.y = cy + 46 + 24;

    // ── Ocorrências ─────────────────────────────────────────────────────────
    sectionTitle(doc, `Ocorrências disciplinares (${occ.length})`);
    table(doc, [
      { label: 'Nº', width: 24, align: 'center' },
      { label: 'Data', width: 54, align: 'center' },
      { label: 'Tipo', width: 78, align: 'center' },
      { label: 'Motivo', width: 183 },
      { label: 'Amparo legal', width: 70 },
      { label: 'Pontos', width: 46, align: 'center' },
      { label: 'Situação', width: 60, align: 'center' },
    ], occ.map((o, i) => {
      // Descrições podem vir com o amparo no início: "[Art. 106, inc. XLIX] ..."
      const m = o.description.match(/^\[([^\]]+)\]\s*/);
      let motivo = m ? o.description.slice(m[0].length) : o.description;
      if (o.type === 'SUSPENSAO' && o.suspensionDays) motivo = `(${o.suspensionDays} dia(s)) ${motivo}`;
      return [
        { text: String(i + 1).padStart(2, '0'), color: COLORS.muted },
        fmtDate(o.occurredAt),
        occurrenceType(o),
        motivo,
        { text: m ? m[1] : (o.category?.name || '—'), color: COLORS.muted },
        { text: fmtPts(o.scoreImpact), bold: true, color: o.scoreImpact < 0 ? COLORS.danger : COLORS.muted },
        { text: OCC_STATUS[o.status] || o.status, color: COLORS.muted },
      ];
    }), 'Nenhuma ocorrência registrada.');

    // ── Elogios ─────────────────────────────────────────────────────────────
    sectionTitle(doc, `Elogios e reconhecimentos (${student.praises.length})`);
    table(doc, [
      { label: 'Nº', width: 24, align: 'center' },
      { label: 'Data', width: 54, align: 'center' },
      { label: 'Tipo', width: 90, align: 'center' },
      { label: 'Motivo', width: 301 },
      { label: 'Pontos', width: 46, align: 'center' },
    ], student.praises.map((p, i) => [
      { text: String(i + 1).padStart(2, '0'), color: COLORS.muted },
      fmtDate(p.occurredAt),
      { text: PRAISE_TYPE[p.type] || p.type, badge: COLORS.success },
      p.description && p.description !== p.reason ? `${p.reason}\n${p.description}` : p.reason,
      { text: fmtPts(p.scoreImpact), bold: true, color: COLORS.success },
    ]), 'Nenhum elogio registrado.');

    // ── TACs ────────────────────────────────────────────────────────────────
    sectionTitle(doc, `Termos de Ajuste de Conduta (${student.tacs.length})`);
    table(doc, [
      { label: 'Nº', width: 24, align: 'center' },
      { label: 'Período', width: 110, align: 'center' },
      { label: 'Termo', width: 291 },
      { label: 'Situação', width: 90, align: 'center' },
    ], student.tacs.map((t, i) => {
      const [label, color] = TAC_STATUS[t.status] || [t.status, COLORS.muted];
      return [
        { text: String(i + 1).padStart(2, '0'), color: COLORS.muted },
        `${fmtDate(t.startDate)} a ${fmtDate(t.endDate)}`,
        { text: t.title, bold: true },
        { text: label, badge: color },
      ];
    }), 'Nenhum TAC registrado.');

    // ── Assinaturas ─────────────────────────────────────────────────────────
    ensureSpace(doc, 50);
    const sigY = doc.y + 30;
    const sigW = 220;
    [[X0, 'Coordenadora Disciplinar'], [X0 + CONTENT_W - sigW, 'Pai / Responsável']].forEach(([x, label]) => {
      doc.moveTo(x, sigY).lineTo(x + sigW, sigY).lineWidth(0.6).strokeColor(COLORS.text).stroke();
      doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted)
        .text(label, x, sigY + 5, { width: sigW, align: 'center', lineBreak: false });
    });

    footer(doc);
    doc.end();
  } catch (err) { next(err); }
});

// Relatório por turma
router.get('/class/:id', async (req, res, next) => {
  try {
    if (isScoped(req.user) && !req.user.classIds.includes(req.params.id)) {
      return res.status(403).json({ error: 'Acesso negado a esta turma' });
    }
    const cls = await prisma.class.findUnique({
      where: { id: req.params.id },
      include: {
        students: {
          where: { status: 'ATIVO' },
          orderBy: { currentScore: 'asc' },
          include: { _count: { select: { occurrences: true, praises: true } } },
        },
      },
    });

    if (!cls) return res.status(404).json({ error: 'Turma não encontrada' });

    const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="turma-${cls.name.replace(/ /g, '-')}.pdf"`);
    doc.pipe(res);

    header(doc, `Turma ${cls.name}`, `Ano letivo ${cls.schoolYear} • ${cls.shift}`);

    const avg = cls.students.length
      ? cls.students.reduce((s, x) => s + x.currentScore, 0) / cls.students.length
      : 0;

    doc.fontSize(10).fillColor(COLORS.muted).text('CONCEITO MÉDIO DA TURMA', { characterSpacing: 1.5 });
    doc.fontSize(40).fillColor(COLORS.primary).text(avg.toFixed(2));
    doc.moveDown();

    doc.fontSize(11).fillColor(COLORS.primary).text('RANKING DE ALUNOS', { characterSpacing: 1 });
    doc.moveDown(0.3);

    cls.students.forEach((s, idx) => {
      const color = s.currentScore < 5 ? COLORS.danger
                  : s.currentScore < 6.5 ? COLORS.warning : COLORS.success;
      doc.fontSize(10).fillColor(COLORS.muted).text(`${(idx + 1).toString().padStart(2, '0')}. `, { continued: true })
         .fillColor(COLORS.text).text(s.name, { continued: true })
         .fillColor(color).text(`   ${s.currentScore.toFixed(2)}`, { align: 'right' });
    });

    footer(doc);
    doc.end();
  } catch (err) { next(err); }
});

// ── TMD PDF ──────────────────────────────────────────────────────────────────
router.get('/tmd/:occurrenceId', async (req, res, next) => {
  try {
    const tmd = await prisma.occurrence.findUnique({
      where: { id: req.params.occurrenceId },
      include: {
        student: { include: { class: true } },
        createdBy: { select: { name: true } },
      },
    });

    if (!tmd || tmd.type !== 'TMD') {
      return res.status(404).json({ error: 'TMD não encontrado' });
    }
    if (isScoped(req.user) && !req.user.classIds.includes(tmd.student.classId)) {
      return res.status(403).json({ error: 'Acesso negado a esta turma' });
    }

    // Buscar anotações de origem
    let anotacoes = [];
    if (tmd.generatedFromIds) {
      const ids = tmd.generatedFromIds.split(',').filter(Boolean);
      anotacoes = await prisma.occurrence.findMany({
        where: { id: { in: ids } },
        include: { category: true },
        orderBy: { occurredAt: 'asc' },
      });
    }

    // Número sequencial do TMD no ano
    const year = new Date(tmd.createdAt).getFullYear();
    const startOfYear = new Date(`${year}-01-01T00:00:00.000Z`);
    const tmdSeq = await prisma.occurrence.count({
      where: { type: 'TMD', createdAt: { gte: startOfYear, lte: tmd.createdAt } },
    });
    // Novos TMDs usam a numeração digitada manualmente. O sequencial fica
    // apenas como compatibilidade para TMDs antigos, criados antes deste campo.
    const tmdNumber = String(tmd.tmdNumber || '').trim() || `${String(tmdSeq).padStart(3, '0')}/${year}`;
    const safeTmdNumber = tmdNumber.replace(/[^a-zA-Z0-9_-]+/g, '-');

    const student = tmd.student;
    const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition',
      `inline; filename="TMD-${student.registration}-${safeTmdNumber}.pdf"`);
    doc.pipe(res);

    const W = doc.page.width - 100; // usable width
    const CX = doc.page.width / 2;

    // ── Cabeçalho institucional ──────────────────────────────────────────────
    if (existsSync(TMD_LOGO)) {
      const logoH = 42;
      doc.image(TMD_LOGO, CX - 21, doc.y - 4, { height: logoH });
      doc.y += logoH + 2;
    }

    doc.fontSize(8).fillColor('#000000');
    [
      'POLÍCIA MILITAR DO ESTADO DO TOCANTINS',
      'SECRETARIA DA EDUCAÇÃO, JUVENTUDE E DESPORTO.',
      'COLÉGIO MILITAR DE ARAGUATINS-TO',
      'COORDENAÇÃO DISCIPLINAR',
    ].forEach(line => {
      doc.text(line, 50, doc.y, { width: W, align: 'center' });
    });

    doc.moveDown(1.2);

    // ── Título ───────────────────────────────────────────────────────────────
    doc.fontSize(11).font('Helvetica-Bold')
      .text('TERMO DE MEDIDA DISCIPLINAR', 50, doc.y, { width: W, align: 'center' });
    doc.fontSize(11)
      .text(`Nº ${tmdNumber}`, 50, doc.y, { width: W, align: 'center' });

    doc.moveDown(1);

    // ── Destinatário ─────────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(10)
      .text('Aos Pais/Responsáveis', 50, doc.y, { width: W, align: 'center' });

    doc.moveDown(1);

    // ── Corpo ────────────────────────────────────────────────────────────────
    const tmdLevelLabel = {
      LEVE: 'ADVERTÊNCIA LEVE', MEDIA: 'ADVERTÊNCIA MÉDIA',
      GRAVE: 'ADVERTÊNCIA GRAVE', GRAVISSIMO: 'MEDIDA DISCIPLINAR GRAVÍSSIMA',
    }[tmd.tmdLevel] || 'MEDIDA DISCIPLINAR';

    doc.font('Helvetica').fontSize(10).text(
      'Viemos através deste, informar Vossa Senhoria que o (a) aluno (a) ',
      50, doc.y, { continued: true, align: 'justify', width: W }
    );
    doc.font('Helvetica-Bold').text(`${student.name} `, { continued: true });
    doc.font('Helvetica').text('da turma ', { continued: true });
    doc.font('Helvetica-Bold').text(`${student.class.name}`, { continued: true });
    doc.font('Helvetica').text(', obteve medida disciplinar de ', { continued: true });
    doc.font('Helvetica-Bold').text(tmdLevelLabel, { continued: true });
    doc.font('Helvetica').text(', por ter recebido as seguintes anotações;', { align: 'justify', width: W });

    doc.moveDown(0.8);

    // ── Tabela de anotações ──────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(10).text('Descrição dos fatos:', 50, doc.y);
    doc.moveDown(0.4);

    const COL = { date: 50, amparo: 145, tipo: 285 };
    const ROW_H = 30;
    const tableTop = doc.y;

    // Cabeçalho da tabela
    doc.rect(50, tableTop, W, ROW_H).fillAndStroke('#dddddd', '#000000');
    doc.fillColor('#000000').font('Helvetica-Bold').fontSize(8);
    doc.text('Data', COL.date + 4, tableTop + 10, { width: 90, align: 'center' });
    doc.text('Amparo Legal\nRICMTO', COL.amparo + 4, tableTop + 4, { width: 135, align: 'center' });
    doc.text('Tipificação', COL.tipo + 4, tableTop + 10, { width: W - (COL.tipo - 50), align: 'center' });

    // Divisórias verticais do cabeçalho
    doc.moveTo(COL.amparo, tableTop).lineTo(COL.amparo, tableTop + ROW_H).stroke();
    doc.moveTo(COL.tipo, tableTop).lineTo(COL.tipo, tableTop + ROW_H).stroke();

    let rowY = tableTop + ROW_H;

    // O TMD apresenta somente o enquadramento legal. Anotações com o mesmo
    // artigo/inciso são agrupadas, mantendo todas as datas em que ocorreram.
    const grouped = [];
    for (const annotation of anotacoes) {
      const info = officialTipification(annotation);
      let row = grouped.find(item => item.key === info.key);
      if (!row) {
        row = { ...info, dates: [] };
        grouped.push(row);
      }
      row.dates.push(new Date(annotation.occurredAt).toLocaleDateString('pt-BR'));
    }

    grouped.forEach((row) => {
      const dateStr = row.dates.join('\n');
      const dateH = doc.heightOfString(dateStr, { width: COL.amparo - COL.date - 4, fontSize: 8 });
      const amparoH = doc.heightOfString(row.amparo, { width: COL.tipo - COL.amparo - 8, fontSize: 8 });
      const textHeight = doc.heightOfString(row.texto, { width: W - (COL.tipo - 50) - 8, fontSize: 8 });
      const cellH = Math.max(ROW_H, dateH + 12, amparoH + 12, textHeight + 12);

      doc.rect(50, rowY, W, cellH).stroke();
      doc.moveTo(COL.amparo, rowY).lineTo(COL.amparo, rowY + cellH).stroke();
      doc.moveTo(COL.tipo, rowY).lineTo(COL.tipo, rowY + cellH).stroke();

      doc.font('Helvetica').fontSize(8).fillColor('#000000');
      doc.text(dateStr, COL.date + 2, rowY + 6, { width: COL.amparo - COL.date - 4, align: 'center' });
      doc.text(row.amparo, COL.amparo + 4, rowY + 6, { width: COL.tipo - COL.amparo - 8, align: 'center' });
      doc.text(row.texto, COL.tipo + 4, rowY + 6, { width: W - (COL.tipo - 50) - 8 });

      rowY += cellH;
    });

    // Linha de nota comprometida (fundo vermelho)
    const scoreRow = ROW_H;
    doc.rect(50, rowY, W, scoreRow).fillAndStroke('#cc0000', '#000000');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
    doc.text('Nota Disciplinar Comprometida', COL.date + 4, rowY + 9, { width: COL.tipo - COL.date - 8 });
    doc.moveTo(COL.tipo, rowY).lineTo(COL.tipo, rowY + scoreRow).strokeColor('#cc0000').stroke();

    const scoreAbs = Math.abs(tmd.scoreImpact);
    doc.text(
      `${scoreAbs.toFixed(2)} ponto${scoreAbs !== 1 ? 's' : ''}`,
      COL.tipo + 4, rowY + 9,
      { width: W - (COL.tipo - 50) - 8, align: 'center' }
    );

    doc.y = rowY + scoreRow + 14;
    doc.fillColor('#000000');

    // ── Texto do regimento ───────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(10)
      .text('Conforme estabelece o Regimento Interno do Colégio Militar do Tocantins:', 50, doc.y, { width: W, align: 'justify' });
    doc.moveDown(0.6);

    doc.font('Helvetica').fontSize(9.5).text(
      'O pai/responsável deverá comparecer na Coordenação Disciplinar do CMTO a fim de tratar de questões disciplinares referentes ao aluno no prazo legal de 03 (Três) dias úteis, a contar da data do ciente no Termo de Medida Disciplinar.',
      50, doc.y, { width: W, align: 'justify' }
    );
    doc.moveDown(0.6);

    doc.text(
      'As revisões de anotações deverão ser solicitadas exclusivamente e pessoalmente pelo pai/responsável ao Coordenador Disciplinar ou ao Chefe do Corpo de Alunos, dentro do prazo legal previsto;',
      50, doc.y, { width: W, align: 'justify' }
    );
    doc.moveDown(0.6);

    doc.text(
      'O não comparecimento do pai/responsável dentro do prazo legal previsto ensejará no devido lançamento das anotações na ficha disciplinar do aluno que poderá ocasionar, inclusive, a exclusão do mesmo conforme previsto no Regimento Interno do CMTO.',
      50, doc.y, { width: W, align: 'justify' }
    );
    doc.moveDown(0.8);

    // ── Caixa de aviso azul ──────────────────────────────────────────────────
    const boxTop = doc.y;
    const boxText = 'Os pais/responsáveis deverão procurar a Coordenação Disciplinar às 09h ou mediante agendamento.';
    const boxTextH = doc.heightOfString(boxText, { width: W - 16, fontSize: 9.5 });
    doc.rect(50, boxTop, W, boxTextH + 16).fillAndStroke('#cce5ff', '#3399cc');
    doc.fillColor('#000000').font('Helvetica').fontSize(9.5)
      .text(boxText, 58, boxTop + 8, { width: W - 16, align: 'justify' });
    doc.y = boxTop + boxTextH + 24;

    // ── Data e local ─────────────────────────────────────────────────────────
    const dateLocale = new Date(tmd.createdAt).toLocaleDateString('pt-BR', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
    doc.fillColor('#000000').font('Helvetica').fontSize(10)
      .text(`Araguatins - TO, ${dateLocale}`, 50, doc.y, { width: W, align: 'right' });

    doc.moveDown(2.5);

    // ── Assinaturas ──────────────────────────────────────────────────────────
    const sigGap = 34;
    const sigW = (W - sigGap * 2) / 3;
    const sigX = [50, 50 + sigW + sigGap, 50 + (sigW + sigGap) * 2];
    const sigY = doc.y;

    sigX.forEach(x => doc.moveTo(x, sigY).lineTo(x + sigW, sigY).strokeColor('#000000').lineWidth(0.5).stroke());

    doc.font('Helvetica-Bold').fontSize(8).fillColor('#000000');
    doc.text('1° SGT RR VALDINEA PEREIRA NASCIMENTO', sigX[0], sigY + 8, { width: sigW, align: 'center' });
    // Cargo logo abaixo do nome, com mais respiro visual
    doc.text('COORDENADORA DISCIPLINAR', sigX[0], doc.y + 3, { width: sigW, align: 'center' });
    const sigBottom = doc.y;

    doc.text('Assinatura do Pai/Responsável', sigX[1], sigY + 14, { width: sigW, align: 'center' });
    doc.text('Monitor (a) Disciplinar', sigX[2], sigY + 14, { width: sigW, align: 'center' });

    doc.y = Math.max(doc.y, sigBottom);
    doc.moveDown(3.6);

    // ── Recebido em ──────────────────────────────────────────────────────────
    doc.font('Helvetica').fontSize(9)
      .text('Recebido em ____/____/________    Ciente do Aluno ___________________________________',
        50, doc.y, { width: W });

    doc.end();
  } catch (err) { next(err); }
});


// ── FICHA DAS ANOTAÇÕES VINCULADAS AO TMD ──────────────────────────────────
router.get('/tmd/:occurrenceId/annotations', async (req, res, next) => {
  try {
    const tmd = await prisma.occurrence.findUnique({
      where: { id: req.params.occurrenceId },
      include: {
        student: { include: { class: true } },
        createdBy: { select: { name: true } },
      },
    });

    if (!tmd || tmd.type !== 'TMD') {
      return res.status(404).json({ error: 'TMD não encontrado' });
    }
    if (isScoped(req.user) && !req.user.classIds.includes(tmd.student.classId)) {
      return res.status(403).json({ error: 'Acesso negado a esta turma' });
    }
    if (!tmd.generatedFromIds) {
      return res.status(400).json({ error: 'Este TMD não possui anotações vinculadas.' });
    }

    const ids = tmd.generatedFromIds.split(',').filter(Boolean);
    const annotations = await prisma.occurrence.findMany({
      where: { id: { in: ids }, studentId: tmd.studentId, type: 'ANOTACAO' },
      include: {
        category: true,
        createdBy: { select: { name: true } },
      },
      orderBy: { occurredAt: 'asc' },
    });

    const year = new Date(tmd.createdAt).getFullYear();
    const startOfYear = new Date(`${year}-01-01T00:00:00.000Z`);
    const tmdSeq = await prisma.occurrence.count({
      where: { type: 'TMD', createdAt: { gte: startOfYear, lte: tmd.createdAt } },
    });
    const tmdNumber = String(tmd.tmdNumber || '').trim() || `${String(tmdSeq).padStart(3, '0')}/${year}`;
    const safeTmdNumber = tmdNumber.replace(/[^a-zA-Z0-9_-]+/g, '-');

    const student = tmd.student;
    const doc = new PDFDocument({ margin: X0, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="ficha-TMD-${student.registration}-${safeTmdNumber}.pdf"`);
    doc.pipe(res);

    header(doc, 'Ficha de Anotações do TMD', `TMD Nº ${tmdNumber} • ${student.name} • ${student.class.name}`);

    const top = doc.y;
    const boxH = 86;
    doc.roundedRect(X0, top, CONTENT_W, boxH, 4).lineWidth(0.8).strokeColor(COLORS.line).stroke();

    const fields = [
      ['Aluno', student.name],
      ['Matrícula', student.registration],
      ['Turma', student.class.name],
      ['TMD', `Nº ${tmdNumber} • ${TMD_LEVEL[tmd.tmdLevel] || tmd.tmdLevel}`],
      ['Data de emissão', fmtDate(tmd.createdAt)],
      ['Conceito atual', student.currentScore.toFixed(2)],
    ];

    fields.forEach(([label, value], index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = X0 + 12 + col * (CONTENT_W / 2);
      const y = top + 11 + row * 24;
      doc.font('Helvetica').fontSize(6.5).fillColor(COLORS.muted)
        .text(label.toUpperCase(), x, y, { characterSpacing: 0.8, lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.text)
        .text(String(value ?? '—'), x, y + 9, { width: CONTENT_W / 2 - 24, height: 12, ellipsis: true });
    });
    doc.y = top + boxH + 22;

    doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted)
      .text('Esta ficha reúne exclusivamente as anotações que fundamentam o TMD acima, preservando a descrição detalhada registrada no sistema.', X0, doc.y, { width: CONTENT_W, align: 'justify' });
    doc.moveDown(1.2);

    sectionTitle(doc, `Anotações vinculadas (${annotations.length})`);
    table(doc, [
      { label: 'Nº', width: 24, align: 'center' },
      { label: 'Data', width: 54, align: 'center' },
      { label: 'Amparo legal', width: 82 },
      { label: 'Natureza', width: 65, align: 'center' },
      { label: 'Local', width: 72 },
      { label: 'Descrição detalhada', width: 218 },
    ], annotations.map((annotation, index) => {
      const info = officialTipification(annotation);
      return [
        { text: String(index + 1).padStart(2, '0'), color: COLORS.muted },
        fmtDate(annotation.occurredAt),
        { text: info.amparo, bold: true },
        { text: NATUREZA_LABEL[info.natureza] || annotation.category?.name || '—', color: COLORS.muted },
        annotation.location || '—',
        info.details || '—',
      ];
    }), 'Nenhuma anotação vinculada a este TMD.');

    ensureSpace(doc, 80);
    const sigY = doc.y + 28;
    const sigW = 220;
    [[X0, 'Coordenação Disciplinar'], [X0 + CONTENT_W - sigW, 'Pai / Responsável']].forEach(([x, label]) => {
      doc.moveTo(x, sigY).lineTo(x + sigW, sigY).lineWidth(0.6).strokeColor(COLORS.text).stroke();
      doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted)
        .text(label, x, sigY + 5, { width: sigW, align: 'center', lineBreak: false });
    });

    footer(doc);
    doc.end();
  } catch (err) { next(err); }
});

export default router;
