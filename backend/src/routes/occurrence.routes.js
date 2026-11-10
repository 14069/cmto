import express from 'express';
import { z } from 'zod';
import prisma from '../utils/prisma.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { auditLog } from '../middleware/audit.js';
import {
  applyScoreChange,
  checkScoreAlerts,
  SCORE_RANGES,
  validateScoreImpact,
} from '../services/scoreService.js';
import { sendGuardianNotification } from '../services/emailService.js';

const router = express.Router();
router.use(authenticate);

// LISTAR ocorrências
router.get('/', async (req, res, next) => {
  try {
    const { classId, studentId, type, status, search, dateFrom, dateTo } = req.query;
    const where = {};

    if (studentId) where.studentId = studentId;
    if (type) where.type = type;
    if (status) where.status = status;
    if (search) where.description = { contains: search };
    if (dateFrom || dateTo) {
      where.occurredAt = {};
      if (dateFrom) where.occurredAt.gte = new Date(dateFrom);
      if (dateTo) where.occurredAt.lte = new Date(dateTo);
    }
    if (classId) where.student = { classId };

    if (req.user.role === 'MONITOR' || req.user.role === 'PROFESSOR') {
      where.student = { ...(where.student || {}), classId: { in: req.user.classIds } };
    }

    const occurrences = await prisma.occurrence.findMany({
      where,
      include: {
        student: { include: { class: { select: { id: true, name: true } } } },
        category: true,
        createdBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
      },
      orderBy: { occurredAt: 'desc' },
      take: 200,
    });

    res.json(occurrences);
  } catch (err) { next(err); }
});

router.get('/ranges', (req, res) => {
  res.json(SCORE_RANGES);
});

router.get('/:id', async (req, res, next) => {
  try {
    const occ = await prisma.occurrence.findUnique({
      where: { id: req.params.id },
      include: {
        student: { include: { class: true } },
        category: true,
        createdBy: { select: { id: true, name: true, role: true } },
        approvedBy: { select: { id: true, name: true } },
        attachments: true,
      },
    });
    if (!occ) return res.status(404).json({ error: 'Ocorrência não encontrada' });
    res.json(occ);
  } catch (err) { next(err); }
});

const occurrenceSchema = z.object({
  studentId: z.string(),
  type: z.enum(['ANOTACAO', 'TMD', 'SUSPENSAO']),
  tmdLevel: z.enum(['LEVE', 'MEDIA', 'GRAVE', 'GRAVISSIMO']).optional().nullable(),
  suspensionDays: z.number().int().min(1).max(5).optional().nullable(),
  categoryId: z.string().optional().nullable(),
  occurredAt: z.string(),
  location: z.string().optional().nullable(),
  description: z.string().min(5),
  scoreImpact: z.number().optional(),
  notifyGuardian: z.boolean().optional(),
});

// LANÇAMENTO COLETIVO — cria uma ocorrência para cada aluno selecionado.
const occurrenceBulkSchema = z.object({
  studentIds: z.array(z.string()).min(1),
  type: z.enum(['ANOTACAO', 'TMD', 'SUSPENSAO']),
  tmdLevel: z.enum(['LEVE', 'MEDIA', 'GRAVE', 'GRAVISSIMO']).optional().nullable(),
  suspensionDays: z.number().int().min(1).max(5).optional().nullable(),
  categoryId: z.string().optional().nullable(),
  occurredAt: z.string(),
  location: z.string().optional().nullable(),
  description: z.string().min(5),
  scoreImpact: z.number().optional(),
  notifyGuardian: z.boolean().optional(),
});


const manualTmdSchema = z.object({
  studentId: z.string().min(1),
  annotationIds: z.array(z.string().min(1)).min(1).max(50),
  tmdNumber: z.string().trim().min(1, 'Informe o número do TMD').max(30, 'Número do TMD muito longo'),
  scoreImpact: z.number().min(0, 'O desconto não pode ser negativo').max(2, 'O desconto máximo é 2,00 pontos').optional(),
});

const NATUREZA_ORDER = { LEVE: 0, MEDIA: 1, GRAVE: 2, GRAVISSIMO: 3 };
const ARTIGO_NATUREZA = { 104: 'LEVE', 105: 'MEDIA', 106: 'GRAVE', 107: 'GRAVISSIMO' };
const TMD_LEVEL_LABELS = {
  LEVE: 'Leve',
  MEDIA: 'Medio',
  GRAVE: 'Grave',
  GRAVISSIMO: 'Gravissimo',
};

function parseLegalReference(description = '') {
  const match = String(description).match(/^\[Art\.\s*(\d+)\s*,\s*(?:inc\.|inciso)\s*([^\]]+)\]\s*/i);
  if (!match) return null;
  return { artigo: Number(match[1]), inciso: match[2].trim() };
}

function annotationNature(annotation) {
  const level = annotation.category?.defaultLevel;
  if (level && NATUREZA_ORDER[level] !== undefined) return level;
  const legal = parseLegalReference(annotation.description);
  return legal ? (ARTIGO_NATUREZA[legal.artigo] || 'LEVE') : 'LEVE';
}

function highestNature(annotations) {
  return annotations.reduce((highest, annotation) => {
    const level = annotationNature(annotation);
    return NATUREZA_ORDER[level] > NATUREZA_ORDER[highest] ? level : highest;
  }, 'LEVE');
}

// Gera um TMD a partir de anotacoes que ja existem na ficha do aluno.
// As anotacoes nao sao apagadas: o vinculo fica registrado em generatedFromIds.
router.post('/tmd/from-annotations', authorize('ADMIN', 'COORD_DISCIPLINAR'), async (req, res, next) => {
  try {
    const data = manualTmdSchema.parse(req.body);
    const annotationIds = [...new Set(data.annotationIds)];

    const student = await prisma.student.findUnique({
      where: { id: data.studentId },
      include: { class: true },
    });
    if (!student) return res.status(404).json({ error: 'Aluno nao encontrado' });

    // A numeração do TMD é informada manualmente pela Coordenação.
    const existingTmdNumber = await prisma.occurrence.findFirst({
      where: {
        type: 'TMD',
        tmdNumber: data.tmdNumber,
        status: { not: 'REJEITADO' },
      },
      select: { id: true },
    });
    if (existingTmdNumber) {
      return res.status(409).json({ error: `Já existe um TMD com o número ${data.tmdNumber}.` });
    }

    const annotations = await prisma.occurrence.findMany({
      where: {
        id: { in: annotationIds },
        studentId: data.studentId,
        type: 'ANOTACAO',
        status: { in: ['APROVADO', 'ARQUIVADO'] },
      },
      include: { category: true },
      orderBy: { occurredAt: 'asc' },
    });

    if (annotations.length !== annotationIds.length) {
      return res.status(400).json({
        error: 'Uma ou mais anotacoes nao pertencem ao aluno, nao sao validas ou ainda nao estao aprovadas.',
      });
    }

    const withoutArticle = annotations.filter(a => !parseLegalReference(a.description));
    if (withoutArticle.length) {
      return res.status(400).json({
        error: `${withoutArticle.length} anotacao(oes) selecionada(s) nao possuem artigo/inciso definido. Edite o enquadramento antes de gerar o TMD.`,
        annotationIds: withoutArticle.map(a => a.id),
      });
    }

    // A mesma anotacao nao pode compor dois TMDs ao mesmo tempo.
    const linkedTmds = await prisma.occurrence.findMany({
      where: {
        studentId: data.studentId,
        type: 'TMD',
        generatedFromIds: { not: null },
        status: { not: 'REJEITADO' },
      },
      select: { id: true, generatedFromIds: true },
    });
    const alreadyLinked = new Set();
    linkedTmds.forEach(tmd => {
      String(tmd.generatedFromIds || '').split(',').filter(Boolean).forEach(id => alreadyLinked.add(id));
    });
    const reused = annotationIds.filter(id => alreadyLinked.has(id));
    if (reused.length) {
      return res.status(409).json({
        error: 'Uma ou mais anotacoes selecionadas ja estao vinculadas a outro TMD.',
        annotationIds: reused,
      });
    }

    const tmdLevel = highestNature(annotations);
    const suggestedScoreImpact = SCORE_RANGES[`TMD_${tmdLevel}`].default;
    // Na tela o usuário informa o desconto como valor positivo (ex.: 0.70).
    // No histórico/conceito ele é salvo como delta negativo.
    const scoreImpact = data.scoreImpact === undefined
      ? suggestedScoreImpact
      : -Math.abs(data.scoreImpact);
    const category = await prisma.occurrenceCategory.findFirst({
      where: {
        active: true,
        defaultLevel: tmdLevel,
        name: { in: ['Natureza Leve', 'Natureza Média', 'Natureza Grave', 'Natureza Gravíssima/Eliminatória'] },
      },
    });

    const tmd = await prisma.occurrence.create({
      data: {
        studentId: data.studentId,
        type: 'TMD',
        tmdLevel,
        tmdNumber: data.tmdNumber,
        categoryId: category?.id || null,
        occurredAt: new Date(),
        description: `TMD Nº ${data.tmdNumber} - ${TMD_LEVEL_LABELS[tmdLevel]} gerado a partir de ${annotations.length} anotacao(oes) selecionada(s).`,
        scoreImpact,
        status: 'APROVADO',
        requiresApproval: false,
        autoGenerated: false,
        generatedFromIds: annotations.map(a => a.id).join(','),
        createdById: req.user.id,
      },
      include: {
        student: { include: { class: true } },
        category: true,
      },
    });

    await applyScoreChange({
      studentId: data.studentId,
      delta: scoreImpact,
      reason: `TMD Nº ${data.tmdNumber} - ${TMD_LEVEL_LABELS[tmdLevel]} gerado a partir de ${annotations.length} anotacao(oes)`,
      occurrenceId: tmd.id,
    });
    await checkScoreAlerts(data.studentId);

    await auditLog({
      userId: req.user.id,
      action: 'CREATE_TMD_FROM_ANNOTATIONS',
      entity: 'Occurrence',
      entityId: tmd.id,
      newData: { ...tmd, annotationIds: annotations.map(a => a.id) },
      req,
    });

    res.status(201).json({ tmd });
  } catch (err) { next(err); }
});

router.post('/bulk', async (req, res, next) => {
  try {
    const data = occurrenceBulkSchema.parse(req.body);
    const studentIds = [...new Set(data.studentIds)];

    if (data.type === 'SUSPENSAO' && data.categoryId) {
      return res.status(400).json({ error: 'Suspensão não possui categoria' });
    }
    if (data.type === 'SUSPENSAO' && (!data.suspensionDays || data.suspensionDays > 5)) {
      return res.status(400).json({ error: 'A suspensão deve ter de 1 a 5 dias' });
    }
    if (data.type === 'TMD' && !data.tmdLevel) {
      return res.status(400).json({ error: 'Nível do TMD obrigatório' });
    }

    const students = await prisma.student.findMany({
      where: { id: { in: studentIds }, status: 'ATIVO' },
      include: { class: true },
    });
    if (students.length !== studentIds.length) {
      return res.status(400).json({ error: 'Um ou mais alunos selecionados não estão disponíveis' });
    }
    if ((req.user.role === 'MONITOR' || req.user.role === 'PROFESSOR') &&
        students.some(s => !req.user.classIds.includes(s.classId))) {
      return res.status(403).json({ error: 'Você não possui acesso a uma ou mais turmas selecionadas' });
    }
    if (req.user.role === 'PROFESSOR' && data.type !== 'ANOTACAO') {
      return res.status(403).json({ error: 'Professores podem criar apenas Anotações' });
    }

    // As únicas categorias permitidas são as quatro naturezas do regimento.
    let categoryId = data.categoryId || null;
    if (data.type === 'ANOTACAO' || data.type === 'TMD') {
      if (!categoryId) return res.status(400).json({ error: 'Categoria obrigatória' });
      const category = await prisma.occurrenceCategory.findFirst({
        where: { id: categoryId, active: true, name: { in: [
          'Natureza Leve', 'Natureza Média', 'Natureza Grave', 'Natureza Gravíssima/Eliminatória'
        ] } }
      });
      if (!category) return res.status(400).json({ error: 'Categoria inválida para esta ocorrência' });
    } else {
      categoryId = null;
    }

    let scoreImpact = data.scoreImpact || 0;
    let requiresApproval = false;
    let status = 'APROVADO';
    if (data.type === 'ANOTACAO') {
      scoreImpact = 0;
    } else if (data.type === 'TMD') {
      const range = SCORE_RANGES[`TMD_${data.tmdLevel}`];
      if (scoreImpact === 0 || !validateScoreImpact('TMD', data.tmdLevel, scoreImpact)) scoreImpact = range.default;
      if ((data.tmdLevel === 'GRAVE' || data.tmdLevel === 'GRAVISSIMO') && req.user.role === 'MONITOR') {
        requiresApproval = true;
        status = 'PENDENTE_APROVACAO';
      }
    } else {
      scoreImpact = scoreImpact || -1.0;
      if (req.user.role === 'MONITOR' || req.user.role === 'PROFESSOR') {
        requiresApproval = true;
        status = 'PENDENTE_APROVACAO';
      }
    }

    const created = [];
    for (const student of students) {
      const occurrence = await prisma.occurrence.create({
        data: {
          studentId: student.id,
          type: data.type,
          tmdLevel: data.type === 'TMD' ? data.tmdLevel : null,
          suspensionDays: data.type === 'SUSPENSAO' ? data.suspensionDays : null,
          categoryId,
          occurredAt: new Date(data.occurredAt),
          location: data.location || null,
          description: data.description,
          scoreImpact,
          status,
          requiresApproval,
          createdById: req.user.id,
        },
        include: { student: { include: { class: true } }, category: true },
      });

      if (status === 'APROVADO' && scoreImpact !== 0) {
        await applyScoreChange({ studentId: student.id, delta: scoreImpact,
          reason: `${data.type}${data.tmdLevel ? ` ${data.tmdLevel}` : ''}: ${data.description.substring(0, 80)}`,
          occurrenceId: occurrence.id });
        await checkScoreAlerts(student.id);
      }
      if (data.notifyGuardian && student.guardianEmail) {
        await sendGuardianNotification({
          to: student.guardianEmail, studentName: student.name,
          type: data.type === 'TMD' ? `TMD ${data.tmdLevel}` : data.type,
          description: data.description,
        });
      }
      await auditLog({ userId: req.user.id, action: 'CREATE', entity: 'Occurrence', entityId: occurrence.id, newData: occurrence, req });
      created.push(occurrence);
    }

    res.status(201).json({ count: created.length, occurrences: created });
  } catch (err) { next(err); }
});

// CRIAR ocorrência
router.post('/', async (req, res, next) => {
  try {
    const data = occurrenceSchema.parse(req.body);

    if (data.type === 'SUSPENSAO' && data.categoryId) {
      return res.status(400).json({ error: 'Suspensão não possui categoria' });
    }
    if (data.type === 'SUSPENSAO' && (!data.suspensionDays || data.suspensionDays > 5)) {
      return res.status(400).json({ error: 'A suspensão deve ter de 1 a 5 dias' });
    }
    if ((data.type === 'ANOTACAO' || data.type === 'TMD') && data.categoryId) {
      const category = await prisma.occurrenceCategory.findFirst({
        where: { id: data.categoryId, active: true, name: { in: ['Natureza Leve', 'Natureza Média', 'Natureza Grave', 'Natureza Gravíssima/Eliminatória'] } }
      });
      if (!category) return res.status(400).json({ error: 'Categoria inválida para esta ocorrência' });
    }

    // Professor só pode criar Anotações
    if (req.user.role === 'PROFESSOR' && data.type !== 'ANOTACAO') {
      return res.status(403).json({ error: 'Professores podem criar apenas Anotações' });
    }

    // Calcular impacto e aprovação
    let scoreImpact = data.scoreImpact || 0;
    let requiresApproval = false;
    let status = 'APROVADO';

    if (data.type === 'ANOTACAO') {
      scoreImpact = 0;
    } else if (data.type === 'TMD') {
      if (!data.tmdLevel) return res.status(400).json({ error: 'Nível do TMD obrigatório' });
      const range = SCORE_RANGES[`TMD_${data.tmdLevel}`];
      if (scoreImpact === 0 || !validateScoreImpact('TMD', data.tmdLevel, scoreImpact)) {
        scoreImpact = range.default;
      }
      // TMDs Grave e Gravíssimo exigem aprovação se criados por Monitor
      if ((data.tmdLevel === 'GRAVE' || data.tmdLevel === 'GRAVISSIMO') &&
          req.user.role === 'MONITOR') {
        requiresApproval = true;
        status = 'PENDENTE_APROVACAO';
      }
    } else if (data.type === 'SUSPENSAO') {
      if (!data.suspensionDays) return res.status(400).json({ error: 'Dias de suspensão obrigatório' });
      // Suspensão sempre exige aprovação se criada por Monitor/Professor
      if (req.user.role === 'MONITOR' || req.user.role === 'PROFESSOR') {
        requiresApproval = true;
        status = 'PENDENTE_APROVACAO';
      }
      scoreImpact = scoreImpact || -1.0;
    }

    const occurrence = await prisma.occurrence.create({
      data: {
        studentId: data.studentId,
        type: data.type,
        tmdLevel: data.tmdLevel || null,
        suspensionDays: data.suspensionDays || null,
        categoryId: data.categoryId || null,
        occurredAt: new Date(data.occurredAt),
        location: data.location || null,
        description: data.description,
        scoreImpact,
        status,
        requiresApproval,
        createdById: req.user.id,
      },
      include: {
        student: { include: { class: true } },
        category: true,
      },
    });

    // Aplicar impacto se aprovado direto
    if (status === 'APROVADO' && scoreImpact !== 0) {
      await applyScoreChange({
        studentId: data.studentId,
        delta: scoreImpact,
        reason: `${data.type}${data.tmdLevel ? ` ${data.tmdLevel}` : ''}: ${data.description.substring(0, 80)}`,
        occurrenceId: occurrence.id,
      });
      await checkScoreAlerts(data.studentId);
    }

    // Verificar acúmulo de anotações → gerar TMD automático
    // O TMD agora e gerado manualmente a partir das anotacoes selecionadas
    // na ficha do aluno; nao ha mais conversao automatica por quantidade.

    // Notificar responsável (se solicitado)
    if (data.notifyGuardian && occurrence.student.guardianEmail) {
      await sendGuardianNotification({
        to: occurrence.student.guardianEmail,
        studentName: occurrence.student.name,
        type: data.type === 'TMD' ? `TMD ${data.tmdLevel}` : data.type,
        description: data.description,
      });
    }

    await auditLog({
      userId: req.user.id, action: 'CREATE', entity: 'Occurrence',
      entityId: occurrence.id, newData: occurrence, req,
    });

    res.status(201).json(occurrence);
  } catch (err) { next(err); }
});

// Adicionar defesa do aluno
router.post('/:id/defense', async (req, res, next) => {
  try {
    const { defense, presentedBy } = req.body;
    const occ = await prisma.occurrence.update({
      where: { id: req.params.id },
      data: {
        studentDefense: defense,
        defenseDate: new Date(),
        defensePresentedBy: presentedBy,
      },
    });
    await auditLog({ userId: req.user.id, action: 'DEFENSE_ADD', entity: 'Occurrence', entityId: occ.id, req });
    res.json(occ);
  } catch (err) { next(err); }
});

// Aprovar TMD pendente
router.post('/:id/approve', authorize('ADMIN', 'COORD_DISCIPLINAR'), async (req, res, next) => {
  try {
    const occ = await prisma.occurrence.findUnique({ where: { id: req.params.id } });
    if (!occ) return res.status(404).json({ error: 'Ocorrência não encontrada' });
    if (occ.status !== 'PENDENTE_APROVACAO') {
      return res.status(400).json({ error: 'Esta ocorrência não está aguardando aprovação' });
    }

    const updated = await prisma.occurrence.update({
      where: { id: occ.id },
      data: { status: 'APROVADO', approvedById: req.user.id, approvedAt: new Date() },
    });

    if (occ.scoreImpact !== 0) {
      await applyScoreChange({
        studentId: occ.studentId,
        delta: occ.scoreImpact,
        reason: `${occ.type} aprovado: ${occ.description.substring(0, 80)}`,
        occurrenceId: occ.id,
      });
      await checkScoreAlerts(occ.studentId);
    }

    await auditLog({ userId: req.user.id, action: 'APPROVE', entity: 'Occurrence', entityId: occ.id, req });
    res.json(updated);
  } catch (err) { next(err); }
});

// Rejeitar
router.post('/:id/reject', authorize('ADMIN', 'COORD_DISCIPLINAR'), async (req, res, next) => {
  try {
    const { reason } = req.body;
    const occ = await prisma.occurrence.update({
      where: { id: req.params.id },
      data: {
        status: 'REJEITADO',
        rejectionReason: reason,
        approvedById: req.user.id,
        approvedAt: new Date(),
      },
    });
    await auditLog({ userId: req.user.id, action: 'REJECT', entity: 'Occurrence', entityId: occ.id, req });
    res.json(occ);
  } catch (err) { next(err); }
});

// ARQUIVAR — o TMD/anotação já foi assinado pelo responsável e fica só na ficha do aluno.
// A nota NÃO muda (o registro continua valendo), só deixa de aparecer como pendente.
router.post('/:id/archive', authorize('ADMIN', 'COORD_DISCIPLINAR'), async (req, res, next) => {
  try {
    const occ = await prisma.occurrence.findUnique({ where: { id: req.params.id } });
    if (!occ) return res.status(404).json({ error: 'Ocorrência não encontrada' });
    if (occ.status === 'ARQUIVADO') {
      return res.status(400).json({ error: 'Esta ocorrência já está arquivada' });
    }
    if (!['APROVADO', 'AUTO_GERADO'].includes(occ.status)) {
      return res.status(400).json({ error: 'Só é possível arquivar ocorrências já aprovadas' });
    }

    const updated = await prisma.occurrence.update({
      where: { id: occ.id },
      data: { status: 'ARQUIVADO' },
    });
    await auditLog({
      userId: req.user.id, action: 'ARCHIVE', entity: 'Occurrence', entityId: occ.id,
      oldData: { status: occ.status }, newData: { status: 'ARQUIVADO' }, req,
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// DESARQUIVAR — volta ao status anterior.
router.post('/:id/unarchive', authorize('ADMIN', 'COORD_DISCIPLINAR'), async (req, res, next) => {
  try {
    const occ = await prisma.occurrence.findUnique({ where: { id: req.params.id } });
    if (!occ) return res.status(404).json({ error: 'Ocorrência não encontrada' });
    if (occ.status !== 'ARQUIVADO') {
      return res.status(400).json({ error: 'Esta ocorrência não está arquivada' });
    }

    const status = occ.autoGenerated ? 'AUTO_GERADO' : 'APROVADO';
    const updated = await prisma.occurrence.update({ where: { id: occ.id }, data: { status } });
    await auditLog({
      userId: req.user.id, action: 'UNARCHIVE', entity: 'Occurrence', entityId: occ.id,
      oldData: { status: 'ARQUIVADO' }, newData: { status }, req,
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// EDITAR — corrige data, descrição e (em TMD/suspensão) nível, valor e dias.
// Se o valor do desconto mudar, a diferença é aplicada no conceito do aluno
// (fica no histórico, ligada a esta ocorrência, e é revertida se ela for removida).
const levelByValue = (v) => (v <= 0.40 ? 'LEVE' : v <= 0.60 ? 'MEDIA' : v <= 1.00 ? 'GRAVE' : 'GRAVISSIMO');
const editSchema = z.object({
  description: z.string().trim().min(3, 'Descreva a ocorrência').optional(),
  occurredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Data inválida').optional(),
  tmdLevel: z.enum(['LEVE', 'MEDIA', 'GRAVE', 'GRAVISSIMO']).optional(),
  tmdNumber: z.string().trim().min(1, 'Informe o número do TMD').max(30, 'Número do TMD muito longo').optional(),
  scoreImpact: z.number().min(-2).max(2).optional(),   // aceita 0.65 ou -0.65: sempre vira desconto
  suspensionDays: z.number().int().min(1).max(5).nullable().optional(),
});

router.put('/:id', authorize('ADMIN', 'COORD_DISCIPLINAR'), async (req, res, next) => {
  try {
    const body = editSchema.parse(req.body);
    const occ = await prisma.occurrence.findUnique({ where: { id: req.params.id } });
    if (!occ) return res.status(404).json({ error: 'Ocorrência não encontrada' });

    const data = {};
    if (body.description !== undefined) {
      data.description = body.description;

      // Ao enquadrar/alterar o artigo de uma anotacao, mantemos a natureza
      // sincronizada com o artigo do Regimento (104 a 107).
      if (occ.type === 'ANOTACAO') {
        const legal = parseLegalReference(body.description);
        const level = legal ? ARTIGO_NATUREZA[legal.artigo] : null;
        if (level) {
          const category = await prisma.occurrenceCategory.findFirst({
            where: {
              active: true,
              defaultLevel: level,
              name: { in: ['Natureza Leve', 'Natureza Média', 'Natureza Grave', 'Natureza Gravíssima/Eliminatória'] },
            },
          });
          if (category) data.categoryId = category.id;
        }
      }
    }

    let newDate = null;
    if (body.occurredAt) {
      const [y, m, d] = body.occurredAt.slice(0, 10).split('-').map(Number);
      newDate = new Date(Date.UTC(y, m - 1, d, 12));
      if (isNaN(newDate) || y < 2000) return res.status(400).json({ error: 'Data inválida' });
      if (newDate.getTime() > Date.now() + 86400000) return res.status(400).json({ error: 'A data não pode estar no futuro' });
      data.occurredAt = newDate;
    }

    if (occ.type === 'TMD' && body.tmdNumber !== undefined) {
      if (body.tmdNumber !== occ.tmdNumber) {
        const duplicatedNumber = await prisma.occurrence.findFirst({
          where: {
            id: { not: occ.id },
            type: 'TMD',
            tmdNumber: body.tmdNumber,
            status: { not: 'REJEITADO' },
          },
          select: { id: true },
        });
        if (duplicatedNumber) {
          return res.status(409).json({ error: `Já existe um TMD com o número ${body.tmdNumber}.` });
        }
      }
      data.tmdNumber = body.tmdNumber;
    }

    let delta = 0;
    if (['TMD', 'SUSPENSAO'].includes(occ.type)) {
      if (body.scoreImpact !== undefined) {
        const novo = -Math.abs(body.scoreImpact);
        data.scoreImpact = novo;
        if (occ.type === 'TMD' && body.tmdLevel === undefined) data.tmdLevel = levelByValue(Math.abs(novo));
        if (['APROVADO', 'ARQUIVADO', 'AUTO_GERADO'].includes(occ.status)) delta = novo - occ.scoreImpact;
      }
      if (occ.type === 'TMD' && body.tmdLevel !== undefined) {
        data.tmdLevel = body.tmdLevel;
        const cat = await prisma.occurrenceCategory.findFirst({
          where: { name: { in: ['Natureza Leve', 'Natureza Média', 'Natureza Grave', 'Natureza Gravíssima/Eliminatória'] }, defaultLevel: body.tmdLevel },
        });
        if (cat) data.categoryId = cat.id;
      } else if (occ.type === 'TMD' && data.tmdLevel) {
        const cat = await prisma.occurrenceCategory.findFirst({ where: { defaultLevel: data.tmdLevel, name: { startsWith: 'Natureza' } } });
        if (cat) data.categoryId = cat.id;
      }
      if (occ.type === 'SUSPENSAO' && body.suspensionDays !== undefined) data.suspensionDays = body.suspensionDays;
    }

    if (!Object.keys(data).length) return res.status(400).json({ error: 'Nada para alterar' });

    const updated = await prisma.occurrence.update({ where: { id: occ.id }, data });

    if (Math.abs(delta) > 1e-9) {
      await applyScoreChange({
        studentId: occ.studentId,
        delta,
        reason: `Ajuste: ${occ.type}${updated.tmdLevel ? ` ${updated.tmdLevel}` : ''} editado na ficha`,
        occurrenceId: occ.id,
      });
    }
    if (newDate) {
      // mantém o gráfico de conceito na data certa
      await prisma.scoreHistory.updateMany({
        where: { occurrenceId: occ.id, reason: { startsWith: 'Importado da ficha' } },
        data: { createdAt: newDate },
      });
    }

    await auditLog({
      userId: req.user.id, action: 'UPDATE', entity: 'Occurrence', entityId: occ.id,
      oldData: occ, newData: { ...data, scoreDelta: delta || undefined }, req,
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// REMOVER (lançado por engano) — exclui de vez e devolve a nota que havia sido descontada.
router.delete('/:id', authorize('ADMIN', 'COORD_DISCIPLINAR'), async (req, res, next) => {
  try {
    const occ = await prisma.occurrence.findUnique({
      where: { id: req.params.id },
      include: { student: { select: { id: true, name: true, registration: true } } },
    });
    if (!occ) return res.status(404).json({ error: 'Ocorrência não encontrada' });

    // Soma exatamente o que foi aplicado na nota por esta ocorrência (respeita os limites 0–10).
    const applied = await prisma.scoreHistory.findMany({
      where: { occurrenceId: occ.id },
      select: { delta: true },
    });
    const appliedTotal = applied.reduce((sum, h) => sum + h.delta, 0);

    let revert = null;
    if (Math.abs(appliedTotal) > 1e-9) {
      revert = await applyScoreChange({
        studentId: occ.studentId,
        delta: -appliedTotal,
        reason: `Reversão: ${occ.type}${occ.tmdLevel ? ` ${occ.tmdLevel}` : ''} removido da ficha`,
      });
    }

    // Se o TMD era automático, as anotações que o geraram voltam a ficar livres para a contagem.
    await prisma.occurrence.delete({ where: { id: occ.id } });

    await auditLog({
      userId: req.user.id, action: 'DELETE', entity: 'Occurrence', entityId: occ.id,
      oldData: occ, newData: revert ? { scoreReverted: -appliedTotal, ...revert } : null, req,
    });
    res.json({ ok: true, scoreReverted: revert ? -appliedTotal : 0 });
  } catch (err) { next(err); }
});

export default router;
