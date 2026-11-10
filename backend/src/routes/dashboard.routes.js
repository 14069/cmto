import express from 'express';
import prisma from '../utils/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { getConfig } from '../services/scoreService.js';

const router = express.Router();
router.use(authenticate);

router.get('/overview', async (req, res, next) => {
  try {
    const config = await getConfig();

    const classFilter = (req.user.role === 'MONITOR' || req.user.role === 'PROFESSOR')
      ? { classId: { in: req.user.classIds } }
      : {};

    const [totalStudents, totalClasses, totalOccurrences, totalPraises, attentionStudents, criticalStudents, pendingApprovals, activeTacs] = await Promise.all([
      prisma.student.count({ where: { status: 'ATIVO', ...classFilter } }),
      prisma.class.count({ where: { active: true } }),
      prisma.occurrence.count({
        where: {
          status: 'APROVADO',
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          ...(Object.keys(classFilter).length ? { student: classFilter } : {}),
        },
      }),
      prisma.praise.count({
        where: {
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.student.count({
        where: {
          status: 'ATIVO',
          currentScore: { gte: config.criticalThreshold, lt: config.attentionThreshold },
          ...classFilter,
        },
      }),
      prisma.student.count({
        where: {
          status: 'ATIVO',
          currentScore: { lt: config.criticalThreshold },
          ...classFilter,
        },
      }),
      prisma.occurrence.count({
        where: { status: 'PENDENTE_APROVACAO' },
      }),
      prisma.tAC.count({ where: { status: 'ATIVO' } }),
    ]);

    // Top alunos em atenção
    const studentsAtRisk = await prisma.student.findMany({
      where: {
        status: 'ATIVO',
        currentScore: { lt: config.attentionThreshold },
        ...classFilter,
      },
      include: { class: { select: { id: true, name: true } } },
      orderBy: { currentScore: 'asc' },
      take: 10,
    });

    // Ocorrências recentes
    const recentOccurrences = await prisma.occurrence.findMany({
      where: {
        status: 'APROVADO',
        ...(Object.keys(classFilter).length ? { student: classFilter } : {}),
      },
      include: {
        student: { select: { id: true, name: true, class: { select: { name: true } } } },
        category: { select: { name: true } },
      },
      orderBy: { occurredAt: 'desc' },
      take: 10,
    });

    // Estatística por tipo (últimos 30 dias)
    const occurrencesByType = await prisma.occurrence.groupBy({
      by: ['type'],
      where: {
        status: 'APROVADO',
        occurredAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      _count: true,
    });

    // Conceito médio geral
    const allActive = await prisma.student.findMany({
      where: { status: 'ATIVO', ...classFilter },
      select: { currentScore: true },
    });
    const avgScore = allActive.length
      ? allActive.reduce((s, x) => s + x.currentScore, 0) / allActive.length
      : 0;

    res.json({
      metrics: {
        totalStudents,
        totalClasses,
        totalOccurrences,
        totalPraises,
        attentionStudents,
        criticalStudents,
        pendingApprovals,
        activeTacs,
        averageScore: parseFloat(avgScore.toFixed(2)),
      },
      studentsAtRisk,
      recentOccurrences,
      occurrencesByType,
      thresholds: {
        attention: config.attentionThreshold,
        critical: config.criticalThreshold,
      },
    });
  } catch (err) { next(err); }
});

// Calendário disciplinar
router.get('/calendar', async (req, res, next) => {
  try {
    const { month, year } = req.query;
    const now = new Date();
    const m = parseInt(month) || now.getMonth() + 1;
    const y = parseInt(year) || now.getFullYear();
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0, 23, 59, 59);

    const occurrences = await prisma.occurrence.findMany({
      where: { occurredAt: { gte: start, lte: end }, status: 'APROVADO' },
      include: { student: { select: { id: true, name: true } } },
    });

    const tacs = await prisma.tAC.findMany({
      where: {
        OR: [
          { startDate: { gte: start, lte: end } },
          { endDate: { gte: start, lte: end } },
        ],
      },
      include: { student: { select: { id: true, name: true } } },
    });

    res.json({ occurrences, tacs });
  } catch (err) { next(err); }
});

export default router;
