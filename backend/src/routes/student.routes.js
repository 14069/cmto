import express from 'express';
import { z } from 'zod';
import prisma from '../utils/prisma.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { auditLog } from '../middleware/audit.js';

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const { classId, status, search, scoreLevel } = req.query;
    const where = {};

    if (classId) where.classId = classId;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { registration: { contains: search } },
      ];
    }
    if (scoreLevel === 'critico') where.currentScore = { lt: 5.0 };
    else if (scoreLevel === 'atencao') where.currentScore = { gte: 5.0, lt: 6.5 };
    else if (scoreLevel === 'normal') where.currentScore = { gte: 6.5 };

    // Restringir por turma se for Monitor/Professor
    if (req.user.role === 'MONITOR' || req.user.role === 'PROFESSOR') {
      where.classId = { in: req.user.classIds };
    }

    const students = await prisma.student.findMany({
      where,
      include: {
        class: { select: { id: true, name: true, shift: true } },
      },
      orderBy: { name: 'asc' },
    });

    res.json(students);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const student = await prisma.student.findUnique({
      where: { id: req.params.id },
      include: {
        class: true,
        occurrences: {
          orderBy: { occurredAt: 'desc' },
          include: {
            category: true,
            createdBy: { select: { id: true, name: true } },
            approvedBy: { select: { id: true, name: true } },
          },
        },
        praises: {
          orderBy: { occurredAt: 'desc' },
          include: { createdBy: { select: { id: true, name: true } } },
        },
        tacs: { orderBy: { startDate: 'desc' } },
        scoreHistory: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!student) return res.status(404).json({ error: 'Aluno não encontrado' });

    // Verificar acesso para Monitor/Professor
    if ((req.user.role === 'MONITOR' || req.user.role === 'PROFESSOR') &&
        !req.user.classIds.includes(student.classId)) {
      return res.status(403).json({ error: 'Acesso negado a esta turma' });
    }

    res.json(student);
  } catch (err) { next(err); }
});

const studentSchema = z.object({
  registration: z.string().min(1),
  name: z.string().min(2),
  birthDate: z.string().optional().nullable(),
  photoUrl: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  guardianName: z.string().optional().nullable(),
  guardianPhone: z.string().optional().nullable(),
  guardianEmail: z.string().email().optional().nullable().or(z.literal('')),
  guardianRelation: z.string().optional().nullable(),
  classId: z.string(),
  status: z.enum(['ATIVO', 'INATIVO', 'TRANSFERIDO', 'FORMADO']).optional(),
});

router.post('/', authorize('ADMIN', 'COORD_DISCIPLINAR', 'COORD_PEDAGOGICO'), async (req, res, next) => {
  try {
    const data = studentSchema.parse(req.body);
    const initialScore = parseFloat(process.env.DEFAULT_INITIAL_SCORE || '8.0');

    const student = await prisma.student.create({
      data: {
        ...data,
        birthDate: data.birthDate ? new Date(data.birthDate) : null,
        guardianEmail: data.guardianEmail || null,
        currentScore: initialScore,
      },
    });

    await prisma.scoreHistory.create({
      data: {
        studentId: student.id,
        previousScore: 0,
        newScore: initialScore,
        delta: initialScore,
        reason: 'Conceito inicial ao ingressar no sistema',
      },
    });

    await auditLog({ userId: req.user.id, action: 'CREATE', entity: 'Student', entityId: student.id, newData: student, req });
    res.status(201).json(student);
  } catch (err) { next(err); }
});

router.put('/:id', authorize('ADMIN', 'COORD_DISCIPLINAR', 'COORD_PEDAGOGICO'), async (req, res, next) => {
  try {
    const old = await prisma.student.findUnique({ where: { id: req.params.id } });
    const data = { ...req.body };
    if (data.birthDate) data.birthDate = new Date(data.birthDate);

    const student = await prisma.student.update({
      where: { id: req.params.id },
      data,
    });

    await auditLog({ userId: req.user.id, action: 'UPDATE', entity: 'Student', entityId: student.id, oldData: old, newData: student, req });
    res.json(student);
  } catch (err) { next(err); }
});

router.delete('/:id', authorize('ADMIN'), async (req, res, next) => {
  try {
    await prisma.student.update({
      where: { id: req.params.id },
      data: { status: 'INATIVO' },
    });
    await auditLog({ userId: req.user.id, action: 'DEACTIVATE', entity: 'Student', entityId: req.params.id, req });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
