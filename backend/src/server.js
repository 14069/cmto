import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

import authRoutes from './routes/auth.routes.js';
import classRoutes from './routes/class.routes.js';
import studentRoutes from './routes/student.routes.js';
import occurrenceRoutes from './routes/occurrence.routes.js';
import praiseRoutes from './routes/praise.routes.js';
import tacRoutes from './routes/tac.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import userRoutes from './routes/user.routes.js';
import reportRoutes from './routes/report.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import categoryRoutes from './routes/category.routes.js';
import auditRoutes from './routes/audit.routes.js';
import configRoutes from './routes/config.routes.js';
import regimentoRoutes from './routes/regimento.routes.js';
import exportRoutes from './routes/export.routes.js';
import honorRoutes from './routes/honor.routes.js';
import dailyControlRoutes from './routes/dailyControl.routes.js';
import prisma from './utils/prisma.js';

import { errorHandler } from './middleware/errorHandler.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3333;

// ============================================
// MIDDLEWARES GLOBAIS
// ============================================
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,   // rede interna via http
  hsts: false,
}));


app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Rate limiting básico
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3000,
  message: { error: 'Muitas requisições. Tente novamente em alguns minutos.' },
});
app.use('/api', limiter);

// Rate limiting mais estrito para login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skipSuccessfulRequests: true, // login correto não conta
  message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
});

// ============================================
// HEALTH CHECK
// ============================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'CMTO VI - Gestão Disciplinar',
    timestamp: new Date().toISOString(),
  });
});

// ============================================
// ROTAS
// ============================================
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/occurrences', occurrenceRoutes);
app.use('/api/praises', praiseRoutes);
app.use('/api/tacs', tacRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/config', configRoutes);
app.use('/api/regimento', regimentoRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/honors', honorRoutes);
app.use('/api/daily-controls', dailyControlRoutes);

// ============================================
// ERROR HANDLER
// ============================================
app.use(errorHandler);

// 404 (apenas para rotas /api em dev)
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint não encontrado' });
});

const NATUREZA_CATEGORIES = [
  { name: 'Natureza Leve',                    description: 'Infrações conforme Art. 104', defaultType: 'TMD', defaultLevel: 'LEVE' },
  { name: 'Natureza Média',                   description: 'Infrações conforme Art. 105', defaultType: 'TMD', defaultLevel: 'MEDIA' },
  { name: 'Natureza Grave',                   description: 'Infrações conforme Art. 106', defaultType: 'TMD', defaultLevel: 'GRAVE' },
  { name: 'Natureza Gravíssima/Eliminatória', description: 'Infrações conforme Art. 107', defaultType: 'TMD', defaultLevel: 'GRAVISSIMO' },
];

async function ensureNaturezaCategories() {
  for (const cat of NATUREZA_CATEGORIES) {
    await prisma.occurrenceCategory.upsert({
      where: { name: cat.name },
      update: {},
      create: { ...cat, active: true },
    });
  }
}

app.listen(PORT, async () => {
  console.log(`\n🏫 CMTO VI - Sistema de Gestão Disciplinar`);
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
  console.log(`📚 Ambiente: ${process.env.NODE_ENV || 'development'}\n`);
  await ensureNaturezaCategories();
});
