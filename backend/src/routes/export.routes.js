import express from 'express';
import prisma from '../utils/prisma.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate, authorize('ADMIN', 'COORD_DISCIPLINAR', 'COORD_PEDAGOGICO'));

// Calcula a idade a partir da data de nascimento
function calcAge(birthDate) {
  if (!birthDate) return '';
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function formatDate(dt) {
  if (!dt) return '';
  return new Date(dt).toLocaleDateString('pt-BR');
}

function escapeCSV(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(';') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCSVRow(cols) {
  return cols.map(escapeCSV).join(';');
}

/**
 * GET /api/export/students
 * Exporta alunos em CSV com todos os campos da ficha completa.
 * Query params: classId, status (filtros opcionais)
 */
router.get('/students', async (req, res, next) => {
  try {
    const { classId, status } = req.query;
    const where = {};
    if (classId) where.classId = classId;
    if (status) where.status = status;

    const students = await prisma.student.findMany({
      where,
      include: {
        class: {
          select: {
            id: true,
            name: true,
            shift: true,
            schoolYear: true,
            school: true,
            classification: true,
            region: true,
            subRegion: true,
          },
        },
      },
      orderBy: [{ class: { name: 'asc' } }, { callNumber: 'asc' }, { name: 'asc' }],
    });

    const HEADERS = [
      'Escola',
      'Classificação/Dependência',
      'Turma',
      'Ano Letivo',
      'Turno',
      'Matrícula',
      'Nº Chamada',
      'Região',
      'Sub Região',
      'Nome',
      'Sexo',
      'Nome Social',
      'Data Nasc.',
      'Idade',
      'Nº Celular',
      'E-mail do Aluno',
      'E-mail Institucional',
      'BG',
      'CPF',
      'RNEP',
      'Cartão SU',
      'Situação',
      'Situação Escolar',
      'Data da Situação',
      'Data de Confirmação',
      'Conceito (Nota)',
      'Endereço',
      'CEP',
      'Bairro',
      'Cidade',
      'UF',
      'País',
      'Zona de Ensino',
      'Localização Nacional',
      'Naturalidade',
      'Necessidade Especial',
      'Recursos de Acessibilidade',
      'Nº Bolsa Família',
      'Restrições',
      'Nome do Responsável',
      'Parentesco',
      'Telefone do Responsável',
      'E-mail do Responsável',
      'Profissão do Responsável',
      'Recebe Benefício',
      'Autorizado',
      'Comunicação Prioritária',
    ];

    const rows = students.map((s) => [
      s.class.school || '',
      s.class.classification || '',
      s.class.name,
      s.class.schoolYear,
      s.class.shift,
      s.registration,
      s.callNumber ?? '',
      s.class.region || '',
      s.class.subRegion || '',
      s.name,
      s.gender || '',
      s.socialName || '',
      formatDate(s.birthDate),
      calcAge(s.birthDate),
      s.phone || '',
      s.email || '',
      s.institutionalEmail || '',
      s.bg || '',
      s.cpf || '',
      s.rnep || '',
      s.suCard || '',
      s.status,
      s.schoolStatus || '',
      formatDate(s.statusDate),
      formatDate(s.confirmationDate),
      s.currentScore != null ? String(s.currentScore).replace('.', ',') : '',
      s.address || '',
      s.zipCode || '',
      s.neighborhood || '',
      s.city || '',
      s.state || '',
      s.country || '',
      s.zone || '',
      s.nationalLocation || '',
      s.birthplace || '',
      s.specialNeeds || '',
      s.resources || '',
      s.scholarshipNumber || '',
      s.restrictions || '',
      s.guardianName || '',
      s.guardianRelation || '',
      s.guardianPhone || '',
      s.guardianEmail || '',
      s.guardianProfession || '',
      s.receivesBenefit ? 'Sim' : 'Não',
      s.authorized || '',
      s.priorityCommunication ? 'Sim' : 'Não',
    ]);

    const csvLines = [
      '﻿' + toCSVRow(HEADERS), // BOM para compatibilidade com Excel
      ...rows.map(toCSVRow),
    ];

    const filename = `alunos_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvLines.join('\r\n'));
  } catch (err) { next(err); }
});

export default router;
