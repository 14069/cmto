// Lê o PDF do boletim escolar (uma página por aluno) e devolve as notas por bimestre.
// Usa a posição de cada texto na página (x/y) para saber de qual coluna vem cada nota,
// porque nota em branco (ainda não lançada) não aparece no texto.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const num = (s) => {
  const t = String(s).trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
};

function groupLines(items) {
  const lines = [];
  for (const it of items.sort((a, b) => b.y - a.y || a.x - b.x)) {
    const line = lines.find((l) => Math.abs(l.y - it.y) <= 2.5);
    if (line) line.items.push(it);
    else lines.push({ y: it.y, items: [it] });
  }
  lines.forEach((l) => l.items.sort((a, b) => a.x - b.x));
  return lines.sort((a, b) => b.y - a.y);
}
const lineText = (l) => l.items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim();

export async function parseBoletim(buffer) {
  const data = new Uint8Array(buffer);
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false, disableFontFace: true }).promise;
  const alunos = [];
  const avisos = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items
      .filter((i) => i.str && i.str.trim() !== '')
      .map((i) => ({ str: i.str.trim(), x: i.transform[4], y: i.transform[5], w: i.width || 0 }));
    if (!items.length) continue;
    const lines = groupLines(items);
    const texts = lines.map(lineText);

    const nomeLine = texts.find((t) => /^NOME:/i.test(t));
    if (!nomeLine) { avisos.push(`Página ${p}: não parece um boletim (sem "NOME:")`); continue; }
    const nome = (nomeLine.match(/^NOME:\s*(.*?)\s*(?:MATR[ÍI]CULA:|$)/i) || [])[1] || '';
    const matricula = (nomeLine.match(/MATR[ÍI]CULA:\s*(\d+)/i) || [])[1] || '';
    const turma = ((texts.find((t) => /TURMA:/i.test(t)) || '').match(/TURMA:\s*(\S+)/i) || [])[1] || '';
    const serie = ((texts.find((t) => /ANO\/S[ÉE]RIE:/i.test(t)) || '').match(/ANO\/S[ÉE]RIE:\s*(.*?)\s*TURMA:/i) || [])[1] || '';
    const ano = Number(((texts.find((t) => /\bANO:\s*\d{4}/i.test(t)) || '').match(/\bANO:\s*(\d{4})/i) || [])[1]) || null;

    // colunas NT/FA do cabeçalho
    const ntIdx = lines.findIndex((l) => l.items.filter((i) => i.str === 'NT').length >= 3);
    if (ntIdx < 0) { avisos.push(`Página ${p} (${nome}): cabeçalho NT/FA não encontrado`); continue; }
    const head = lines[ntIdx].items;
    const nts = head.filter((i) => i.str === 'NT').map((i) => i.x + i.w / 2);
    const fas = head.filter((i) => i.str === 'FA').map((i) => i.x + i.w / 2);
    const cols = [...nts.map((x, k) => ({ x, tipo: 'NT', b: k + 1 })), ...fas.map((x, k) => ({ x, tipo: 'FA', b: k + 1 }))]
      .sort((a, b) => a.x - b.x);
    const spacing = Math.min(...cols.slice(1).map((c, k) => c.x - cols[k].x));
    const firstX = cols[0].x - spacing;   // tudo à esquerda disso é nome da disciplina

    const disciplinas = [];
    for (let i = ntIdx + 1; i < lines.length; i++) {
      const t = texts[i];
      if (/^Faltas/i.test(t)) break;
      const nameItems = lines[i].items.filter((it) => it.x + it.w / 2 < firstX);
      const nome_d = nameItems.map((it) => it.str).join(' ').trim();
      if (!nome_d || !/[A-Za-zÀ-ú]{3}/.test(nome_d)) continue;
      const notas = [null, null, null, null];
      for (const it of lines[i].items) {
        const cx = it.x + it.w / 2;
        if (cx < firstX) continue;
        const col = cols.reduce((best, c) => (Math.abs(c.x - cx) < Math.abs(best.x - cx) ? c : best), cols[0]);
        if (Math.abs(col.x - cx) > spacing * 0.5) continue;       // colunas MD/REC/CONS... à direita
        if (col.tipo !== 'NT') continue;
        const v = num(it.str);
        if (v !== null) notas[col.b - 1] = v;
      }
      disciplinas.push({ disciplina: nome_d, notas });
    }
    alunos.push({ pagina: p, nome, matricula, turma, serie, ano, disciplinas });
  }
  return { alunos, avisos };
}
