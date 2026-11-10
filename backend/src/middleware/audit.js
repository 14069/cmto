import prisma from '../utils/prisma.js';

export const auditLog = async ({ userId, action, entity, entityId, oldData, newData, req }) => {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entity,
        entityId,
        oldData: oldData ? JSON.stringify(oldData) : null,
        newData: newData ? JSON.stringify(newData) : null,
        ipAddress: req?.ip || req?.headers['x-forwarded-for'] || null,
        userAgent: req?.headers['user-agent'] || null,
      },
    });
  } catch (err) {
    console.error('[AUDIT ERROR]', err);
  }
};
