import express from 'express';
import prisma from '../utils/prisma.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const categories = await prisma.occurrenceCategory.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });
    res.json(categories);
  } catch (err) { next(err); }
});

router.post('/', authorize('ADMIN', 'COORD_DISCIPLINAR'), async (req, res, next) => {
  try {
    const cat = await prisma.occurrenceCategory.create({ data: req.body });
    res.status(201).json(cat);
  } catch (err) { next(err); }
});

router.put('/:id', authorize('ADMIN', 'COORD_DISCIPLINAR'), async (req, res, next) => {
  try {
    const cat = await prisma.occurrenceCategory.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json(cat);
  } catch (err) { next(err); }
});

router.delete('/:id', authorize('ADMIN'), async (req, res, next) => {
  try {
    await prisma.occurrenceCategory.update({
      where: { id: req.params.id },
      data: { active: false },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
