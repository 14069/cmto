// PDF da Solenidade de Condecoração — mesmo layout da planilha usada em 2025.
import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGO = join(__dirname, '../assets/brasao.png');

const BLUE = '#0070C0';
const RED = '#FF0000';
const GOLD = '#FFC000';

const HEADER_LINES = [
  { t: 'POLÍCIA MILITAR DO ESTADO DO TOCANTINS', b: false },
  { t: 'SECRETARIA ESTADUAL DA EDUCAÇÃO, JUVENTUDE E ESPORTES', b: false },
  { t: 'COLÉGIO MILITAR DO TOCANTINS – PROFESSORA ANTONINA MILHOMEM', b: false },
  { t: 'Rua Seis, S/N, bairro Nova Araguatins -, CEP - Araguatins – TO', b: false },
  { t: 'Tel. (63)3474-3068 – cpmaraguatins.com.br / Email: cpmaraguatins@pm.to.gov.br', b: false, i: true },
];

const L = 28;            // margem esquerda
const W = 539;           // largura da tabela
const NUM_W = 28;
const CELL_W = 55;
const NAME_W = W - NUM_W - CELL_W * 4;
const ROW_H = 15.2;
const BOTTOM = 800;

export function buildHonorPdf(stream, { year, turmas }) {
  const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true, info: { Title: `Condecoração ${year}` } });
  doc.pipe(stream);

  const blackBar = (y, h, text, size) => {
    doc.rect(L, y, W, h).fill('#000000');
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(size)
      .text(text, L, y + (h - size) / 2 - 1, { width: W, align: 'center', lineBreak: false });
    doc.fillColor('#000000');
  };

  const schoolHeader = () => {
    if (existsSync(LOGO)) doc.image(LOGO, 595.32 / 2 - 24, 20, { height: 52 });
    let y = 78;
    for (const l of HEADER_LINES) {
      doc.fillColor('#000000').font(l.i ? 'Helvetica-Oblique' : 'Helvetica').fontSize(7.2)
        .text(l.t, 0, y, { width: 595.32, align: 'center', lineBreak: false });
      y += 9.6;
    }
    return y;
  };

  const tableHead = (y, turma) => {
    blackBar(y, 17, turma, 13);
    y += 17;
    const h1 = 15, h2 = 12;
    doc.lineWidth(0.6).strokeColor('#000000');
    doc.rect(L, y, NUM_W + NAME_W, h1 + h2).stroke();
    doc.rect(L + NUM_W + NAME_W, y, CELL_W * 2, h1).stroke();
    doc.rect(L + NUM_W + NAME_W + CELL_W * 2, y, CELL_W * 2, h1).stroke();
    for (let k = 0; k < 4; k++) doc.rect(L + NUM_W + NAME_W + CELL_W * k, y + h1, CELL_W, h2).stroke();
    doc.fillColor('#000000').font('Helvetica-Bold').fontSize(8)
      .text('NOMES', L, y + 12, { width: NUM_W + NAME_W, align: 'center', lineBreak: false });
    doc.text('DISCIPLINAR', L + NUM_W + NAME_W, y + 4, { width: CELL_W * 2, align: 'center', lineBreak: false });
    doc.text('PEDAGÓGICO', L + NUM_W + NAME_W + CELL_W * 2, y + 4, { width: CELL_W * 2, align: 'center', lineBreak: false });
    doc.fontSize(6.8);
    ['MEDALHA', 'ALAMAR', 'MEDALHA', 'ALAMAR'].forEach((t, k) =>
      doc.text(t, L + NUM_W + NAME_W + CELL_W * k, y + h1 + 3, { width: CELL_W, align: 'center', lineBreak: false }));
    return y + h1 + h2;
  };

  const row = (y, n, s) => {
    doc.lineWidth(0.5).strokeColor('#000000');
    const f = s.final;
    const gold = s.dourado;
    const cells = [
      f.DISC_MEDALHA ? BLUE : null,
      gold ? GOLD : f.DISC_ALAMAR ? BLUE : null,
      f.PED_MEDALHA ? RED : null,
      gold ? GOLD : f.PED_ALAMAR ? RED : null,
    ];
    doc.rect(L, y, NUM_W, ROW_H).stroke();
    doc.rect(L + NUM_W, y, NAME_W, ROW_H).stroke();
    cells.forEach((color, k) => {
      const x = L + NUM_W + NAME_W + CELL_W * k;
      if (color) doc.rect(x, y, CELL_W, ROW_H).fillAndStroke(color, '#000000');
      else doc.rect(x, y, CELL_W, ROW_H).stroke();
    });
    doc.fillColor('#000000').font('Helvetica-Bold').fontSize(8)
      .text(`${n}º`, L, y + 4, { width: NUM_W, align: 'center', lineBreak: false, underline: false });
    doc.font('Helvetica').fontSize(8.2)
      .text(String(s.name).toUpperCase(), L + NUM_W + 4, y + 3.8, { width: NAME_W - 6, lineBreak: false, ellipsis: true });
  };

  let first = true;
  for (const t of turmas) {
    if (!t.students.length) continue;
    let i = 0;
    while (i < t.students.length) {
      if (!first) doc.addPage();
      first = false;
      let y = schoolHeader() + 14;
      if (i === 0) {
        y = Math.max(y, 150);
        blackBar(y, 31, `CONDECORAÇÃO ${year}`, 20);
        y += 31 + 22;
      } else y += 10;
      y = tableHead(y, t.name.split('/')[0]);
      while (i < t.students.length && y + ROW_H <= BOTTOM) {
        const s = t.students[i];
        row(y, s.callNumber || i + 1, s);
        y += ROW_H; i++;
      }
    }
  }
  if (first) {
    schoolHeader();
    doc.font('Helvetica').fontSize(11).text('Nenhum aluno encontrado.', 0, 200, { width: 595.32, align: 'center' });
  }

  const range = doc.bufferedPageRange();
  for (let p = 0; p < range.count; p++) {
    doc.switchToPage(p);
    doc.font('Helvetica').fontSize(9).fillColor('#000000')
      .text(String(p + 1), 0, 815, { width: 595.32 - 28, align: 'right', lineBreak: false });
  }
  doc.end();
}
