import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    console.warn('[EMAIL] SMTP não configurado. E-mails não serão enviados.');
    return null;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
}

export async function sendEmail({ to, subject, html, text }) {
  const t = getTransporter();
  if (!t) {
    console.log(`[EMAIL MOCK] Para: ${to} | ${subject}`);
    return { mocked: true };
  }

  return t.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    html,
    text,
  });
}

export async function sendInviteEmail({ email, name, role, link }) {
  const html = `
    <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 32px; background: #f8f7f2;">
      <div style="text-align: center; padding: 24px; background: #1f3622; color: #f8f7f2;">
        <h1 style="margin: 0; font-size: 22px; letter-spacing: 2px;">CMTO VI</h1>
        <p style="margin: 4px 0 0; font-size: 12px; letter-spacing: 1px;">GESTÃO DISCIPLINAR</p>
      </div>
      <div style="padding: 24px; background: #fff;">
        <h2 style="color: #1f3622;">Olá, ${name || 'colega'}!</h2>
        <p>Você foi convidado(a) a participar do Sistema de Gestão Disciplinar do
        Colégio Militar do Estado do Tocantins - Professora Antonina Milhomem
        com o cargo de <strong>${role}</strong>.</p>
        <p style="margin: 32px 0; text-align: center;">
          <a href="${link}" style="background: #1f3622; color: #fff; padding: 14px 32px; text-decoration: none; letter-spacing: 1px;">ACEITAR CONVITE</a>
        </p>
        <p style="font-size: 12px; color: #666;">Este convite expira em 7 dias.</p>
      </div>
    </div>
  `;
  return sendEmail({ to: email, subject: '🎓 Convite - Sistema CMTO VI', html });
}

export async function sendCriticalAlertEmail({ to, studentName, score, className }) {
  const html = `
    <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; background: #f8f7f2;">
      <div style="background: #8b1f1f; color: #fff; padding: 24px; text-align: center;">
        <h1 style="margin: 0;">🚨 ALERTA CRÍTICO</h1>
      </div>
      <div style="padding: 24px; background: #fff;">
        <p>O(a) aluno(a) <strong>${studentName}</strong> da turma <strong>${className}</strong>
        atingiu o nível crítico de conceito disciplinar.</p>
        <div style="font-size: 48px; text-align: center; color: #8b1f1f; margin: 24px 0;">
          ${score.toFixed(2)}
        </div>
        <p>Recomenda-se a abertura de TAC (Termo de Ajuste de Conduta) e contato com responsáveis.</p>
      </div>
    </div>
  `;
  return sendEmail({ to, subject: `🚨 Alerta Crítico - ${studentName}`, html });
}

export async function sendGuardianNotification({ to, studentName, type, description }) {
  const html = `
    <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #1f3622; color: #fff; padding: 24px; text-align: center;">
        <h1 style="margin: 0; font-size: 20px;">CMTO VI - Comunicado aos Responsáveis</h1>
      </div>
      <div style="padding: 24px; background: #fff;">
        <p>Prezado(a) responsável,</p>
        <p>Comunicamos o registro de uma ocorrência referente ao(à) aluno(a)
        <strong>${studentName}</strong>:</p>
        <div style="background: #f8f7f2; padding: 16px; margin: 16px 0; border-left: 4px solid #1f3622;">
          <strong>${type}</strong><br>
          ${description}
        </div>
        <p>Solicitamos comparecimento à coordenação disciplinar para tratativas.</p>
      </div>
    </div>
  `;
  return sendEmail({ to, subject: `CMTO VI - Comunicado sobre ${studentName}`, html });
}
