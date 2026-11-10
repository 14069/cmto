import express from 'express';
import { z } from 'zod';
import prisma from '../utils/prisma.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { auditLog } from '../middleware/audit.js';
import { applyScoreChange, SCORE_RANGES, validateScoreImpact } from '../services/scoreService.js';

const router = express.Router();
router.use(authenticate);

// Monitor/Professor só enxergam as turmas que lhes foram atribuídas.
const isScoped = (u) => u.role === 'MONITOR' || u.role === 'PROFESSOR';

router.get('/', async (req, res, next) => {
  try {
    const { classId, studentId, type } = req.query;
    const where = {};
    if (studentId) where.studentId = studentId;
    if (classId) where.OR = [{ classId }, { student: { classId } }];
    if (type) where.type = type;
    if (isScoped(req.user)) {
      const ids = req.user.classIds;
      where.AND = [{ OR: [{ classId: { in: ids } }, { student: { classId: { in: ids } } }] }];
    }

    const praises = await prisma.praise.findMany({
      where,
      include: {
        student: { include: { class: { select: { id: true, name: true } } } },
        class: true,
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { occurredAt: 'desc' },
      take: 200,
    });
    res.json(praises);
  } catch (err) { next(err); }
});

const praiseSchema = z.object({
  studentId: z.string().optional().nullable(),
  classId: z.string().optional().nullable(),
  type: z.enum(['COLETIVO', 'INDIVIDUAL', 'MENCAO_HONROSA']),
  occurredAt: z.string(),
  reason: z.string().min(2),
  description: z.string().min(5),
  scoreImpact: z.number().optional(),
});

const praiseBulkSchema = z.object({
  studentIds: z.array(z.string()).min(1),
  type: z.enum(['COLETIVO', 'INDIVIDUAL', 'MENCAO_HONROSA']),
  occurredAt: z.string(),
  reason: z.string().min(2),
  description: z.string().min(5),
  scoreImpact: z.number().optional(),
});

// LANÇAMENTO COLETIVO — um mesmo elogio para os alunos selecionados.
router.post('/bulk', authorize('ADMIN', 'COORD_DISCIPLINAR', 'COORD_PEDAGOGICO'), async (req, res, next) => {
  try {
    const data = praiseBulkSchema.parse(req.body);
    const studentIds = [...new Set(data.studentIds)];
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

    const rangeKey = data.type === 'COLETIVO' ? 'PRAISE_COLETIVO' :
      data.type === 'INDIVIDUAL' ? 'PRAISE_INDIVIDUAL' : 'PRAISE_MENCAO';
    const range = SCORE_RANGES[rangeKey];
    let scoreImpact = data.scoreImpact ?? range.default;
    if (!validateScoreImpact('PRAISE', data.type, scoreImpact)) scoreImpact = range.default;

    const created = [];
    for (const student of students) {
      const praise = await prisma.praise.create({
        data: {
          studentId: student.id,
          classId: student.classId,
          type: data.type,
          scoreImpact,
          occurredAt: new Date(data.occurredAt),
          reason: data.reason,
          description: data.description,
          createdById: req.user.id,
        },
        include: { student: true, class: true },
      });
      await applyScoreChange({
        studentId: student.id,
        delta: scoreImpact,
        reason: `Elogio ${data.type}: ${data.reason}`,
        praiseId: praise.id,
      });
      created.push(praise);
      await auditLog({ userId: req.user.id, action: 'CREATE', entity: 'Praise', entityId: praise.id, newData: praise, req });
    }
    res.status(201).json({ count: created.length, praises: created });
  } catch (err) { next(err); }
});

router.post('/', authorize('ADMIN', 'COORD_DISCIPLINAR', 'COORD_PEDAGOGICO'), async (req, res, next) => {
  try {
    const data = praiseSchema.parse(req.body);

    if (!data.studentId && !data.classId) {
      return res.status(400).json({ error: 'Informe um aluno ou uma turma' });
    }
    if (data.type === 'COLETIVO' && !data.classId) {
      return res.status(400).json({ error: 'Elogio coletivo exige uma turma' });
    }
    if ((data.type === 'INDIVIDUAL' || data.type === 'MENCAO_HONROSA') && !data.studentId) {
      return res.status(400).json({ error: 'Este tipo de elogio exige um aluno' });
    }

    const rangeKey = data.type === 'COLETIVO' ? 'PRAISE_COLETIVO' :
                     data.type === 'INDIVIDUAL' ? 'PRAISE_INDIVIDUAL' : 'PRAISE_MENCAO';
    const range = SCORE_RANGES[rangeKey];
    let scoreImpact = data.scoreImpact || range.default;
    if (!validateScoreImpact('PRAISE', data.type === 'COLETIVO' ? 'COLETIVO' :
        data.type === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'MENCAO', scoreImpact)) {
      scoreImpact = range.default;
    }

    const praise = await prisma.praise.create({
      data: {
        studentId: data.studentId || null,
        classId: data.classId || null,
        type: data.type,
        scoreImpact,
        occurredAt: new Date(data.occurredAt),
        reason: data.reason,
        description: data.description,
        createdById: req.user.id,
      },
      include: { student: true, class: true },
    });

    // Aplicar impacto: individual ou em todos da turma
    if (data.studentId) {
      await applyScoreChange({
        studentId: data.studentId,
        delta: scoreImpact,
        reason: `Elogio ${data.type}: ${data.reason}`,
        praiseId: praise.id,
      });
    } else if (data.classId) {
      // Aplicar a todos os alunos ativos
      const students = await prisma.student.findMany({
        where: { classId: data.classId, status: 'ATIVO' },
        select: { id: true },
      });
      for (const s of students) {
        await applyScoreChange({
          studentId: s.id,
          delta: scoreImpact,
          reason: `Elogio Coletivo (turma): ${data.reason}`,
          praiseId: praise.id,
        });
      }
    }

    await auditLog({ userId: req.user.id, action: 'CREATE', entity: 'Praise', entityId: praise.id, newData: praise, req });
    res.status(201).json(praise);
  } catch (err) { next(err); }
});

router.delete('/:id', authorize('ADMIN'), async (req, res, next) => {
  try {
    const p = await prisma.praise.findUnique({ where: { id: req.params.id } });
    if (!p) return res.status(404).json({ error: 'Não encontrado' });

    // Reverter
    if (p.studentId) {
      await applyScoreChange({
        studentId: p.studentId,
        delta: -p.scoreImpact,
        reason: 'Reversão de elogio excluído',
      });
    } else if (p.classId) {
      const students = await prisma.student.findMany({
        where: { classId: p.classId, status: 'ATIVO' },
        select: { id: true },
      });
      for (const s of students) {
        await applyScoreChange({
          studentId: s.id,
          delta: -p.scoreImpact,
          reason: 'Reversão de elogio coletivo excluído',
        });
      }
    }

    await prisma.praise.delete({ where: { id: p.id } });
    await auditLog({ userId: req.user.id, action: 'DELETE', entity: 'Praise', entityId: p.id, oldData: p, req });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
