import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import prisma from '../utils/prisma.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { auditLog } from '../middleware/audit.js';
import { sendInviteEmail } from '../services/emailService.js';

const router = express.Router();

router.use(authenticate);

// Listar usuários (admins veem todos)
router.get('/', requireAdmin, async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, email: true, role: true, active: true,
        avatarUrl: true, phone: true, createdAt: true, lastLoginAt: true,
        classAccess: { include: { class: { select: { id: true, name: true } } } },
      },
    });
    res.json(users);
  } catch (err) { next(err); }
});

const userSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6).optional(),
  role: z.enum(['ADMIN', 'COORD_DISCIPLINAR', 'COORD_PEDAGOGICO', 'MONITOR', 'PROFESSOR']),
  phone: z.string().optional(),
  classIds: z.array(z.string()).optional(),
});

router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const data = userSchema.parse(req.body);
    const password = data.password || crypto.randomBytes(8).toString('hex');
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email.toLowerCase(),
        passwordHash,
        role: data.role,
        phone: data.phone,
        classAccess: data.classIds?.length ? {
          create: data.classIds.map(classId => ({ classId })),
        } : undefined,
      },
    });

    await auditLog({
      userId: req.user.id, action: 'CREATE', entity: 'User',
      entityId: user.id, newData: { name: user.name, email: user.email, role: user.role }, req,
    });

    res.status(201).json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      tempPassword: data.password ? undefined : password,
    });
  } catch (err) { next(err); }
});

router.put('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, role, active, phone, classIds } = req.body;

    const old = await prisma.user.findUnique({ where: { id } });

    const user = await prisma.user.update({
      where: { id },
      data: {
        name, role, active, phone,
        classAccess: classIds ? {
          deleteMany: {},
          create: classIds.map(classId => ({ classId })),
        } : undefined,
      },
    });

    await auditLog({
      userId: req.user.id, action: 'UPDATE', entity: 'User',
      entityId: id, oldData: old, newData: user, req,
    });

    res.json(user);
  } catch (err) { next(err); }
});

router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (id === req.user.id) {
      return res.status(400).json({ error: 'Você não pode excluir o próprio usuário' });
    }
    // Soft delete: apenas desativar
    await prisma.user.update({ where: { id }, data: { active: false } });
    await auditLog({ userId: req.user.id, action: 'DEACTIVATE', entity: 'User', entityId: id, req });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Convites
router.post('/invite', requireAdmin, async (req, res, next) => {
  try {
    const { email, role } = req.body;
    if (!email || !role) return res.status(400).json({ error: 'E-mail e cargo obrigatórios' });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invite = await prisma.userInvite.create({
      data: { email: email.toLowerCase(), role, token, expiresAt, sentById: req.user.id },
    });

    const link = `${process.env.FRONTEND_URL}/invite/${token}`;
    await sendInviteEmail({ email, name: '', role, link });

    res.status(201).json({ invite, link });
  } catch (err) { next(err); }
});

export default router;
