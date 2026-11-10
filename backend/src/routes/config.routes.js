import express from 'express';
import prisma from '../utils/prisma.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { getConfig } from '../services/scoreService.js';
import { auditLog } from '../middleware/audit.js';

const router = express.Router();
router.use(authenticate);

// Qualquer usuário autenticado pode ler config (são limiares de alerta etc)
router.get('/', async (req, res, next) => {
  try {
    const config = await getConfig();
    res.json(config);
  } catch (err) { next(err); }
});

router.put('/', requireAdmin, async (req, res, next) => {
  try {
    const updates = req.body;
    const results = [];

    for (const [key, value] of Object.entries(updates)) {
      const r = await prisma.systemConfig.upsert({
        where: { key },
        create: { key, value: String(value) },
        update: { value: String(value) },
      });
      results.push(r);
    }

    await auditLog({
      userId: req.user.id, action: 'UPDATE', entity: 'SystemConfig',
      newData: updates, req,
    });

    res.json(await getConfig());
  } catch (err) { next(err); }
});

export default router;
