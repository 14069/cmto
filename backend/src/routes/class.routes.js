import express from 'express';
import { z } from 'zod';
import prisma from '../utils/prisma.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { auditLog } from '../middleware/audit.js';

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const where = {};
    // Monitores só veem suas turmas
    if (req.user.role === 'MONITOR' || req.user.role === 'PROFESSOR') {
      where.id = { in: req.user.classIds };
    }

    const classes = await prisma.class.findMany({
      where: { ...where, active: true },
      include: {
        _count: { select: { students: true } },
        students: { select: { id: true, currentScore: true, status: true } },
      },
      orderBy: [{ schoolYear: 'desc' }, { name: 'asc' }],
    });

    // Calcular conceito médio por turma
    const enriched = classes.map(c => {
      const active = c.students.filter(s => s.status === 'ATIVO');
      const avg = active.length
        ? active.reduce((sum, s) => sum + s.currentScore, 0) / active.length
        : 0;
      return {
        ...c,
        studentsCount: c._count.students,
        activeStudentsCount: active.length,
        averageScore: parseFloat(avg.toFixed(2)),
        students: undefined,
        _count: undefined,
      };
    });

    res.json(enriched);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const cls = await prisma.class.findUnique({
      where: { id: req.params.id },
      include: {
        students: {
          where: { status: 'ATIVO' },
          orderBy: { name: 'asc' },
        },
      },
    });
    if (!cls) return res.status(404).json({ error: 'Turma não encontrada' });
    res.json(cls);
  } catch (err) { next(err); }
});

const classSchema = z.object({
  name: z.string().min(2),
  schoolYear: z.number().int(),
  shift: z.enum(['MATUTINO', 'VESPERTINO', 'INTEGRAL', 'NOTURNO']).optional(),
  counselor: z.string().optional(),
});

router.post('/', authorize('ADMIN', 'COORD_DISCIPLINAR', 'COORD_PEDAGOGICO'), async (req, res, next) => {
  try {
    const data = classSchema.parse(req.body);
    const cls = await prisma.class.create({ data });
    await auditLog({ userId: req.user.id, action: 'CREATE', entity: 'Class', entityId: cls.id, newData: cls, req });
    res.status(201).json(cls);
  } catch (err) { next(err); }
});

router.put('/:id', authorize('ADMIN', 'COORD_DISCIPLINAR', 'COORD_PEDAGOGICO'), async (req, res, next) => {
  try {
    const old = await prisma.class.findUnique({ where: { id: req.params.id } });
    const cls = await prisma.class.update({ where: { id: req.params.id }, data: req.body });
    await auditLog({ userId: req.user.id, action: 'UPDATE', entity: 'Class', entityId: cls.id, oldData: old, newData: cls, req });
    res.json(cls);
  } catch (err) { next(err); }
});

router.delete('/:id', authorize('ADMIN'), async (req, res, next) => {
  try {
    await prisma.class.update({ where: { id: req.params.id }, data: { active: false } });
    await auditLog({ userId: req.user.id, action: 'DEACTIVATE', entity: 'Class', entityId: req.params.id, req });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
