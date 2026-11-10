import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const STUDENTS_NAMES = [
  'Ana Beatriz Silva', 'Bruno Carvalho Lima', 'Camila Rodrigues Sousa',
  'Daniel Almeida Costa', 'Eduarda Ferreira Mendes', 'Felipe Oliveira Santos',
  'Gabriela Martins Pereira', 'Henrique Gomes Ribeiro', 'Isabela Cardoso Dias',
  'João Pedro Nascimento', 'Karoline Barbosa Cunha', 'Lucas Henrique Araújo',
  'Mariana Souza Vieira', 'Nicolas Pinto Moreira', 'Olívia Castro Freitas',
  'Pedro Augusto Teixeira', 'Rafaela Lopes Cavalcanti', 'Samuel Borges Andrade',
  'Tatiana Rocha Monteiro', 'Vinicius Macedo Rangel',
];

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...\n');

  // Limpar dados existentes
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.scoreHistory.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.tAC.deleteMany();
  await prisma.praise.deleteMany();
  await prisma.occurrence.deleteMany();
  await prisma.occurrenceCategory.deleteMany();
  await prisma.classUser.deleteMany();
  await prisma.student.deleteMany();
  await prisma.class.deleteMany();
  await prisma.userInvite.deleteMany();
  await prisma.user.deleteMany();
  await prisma.systemConfig.deleteMany();

  console.log('✓ Banco limpo');

  // Configurações padrão
  await prisma.systemConfig.createMany({
    data: [
      { key: 'initialScore', value: '8.0', description: 'Conceito inicial dos alunos' },
      { key: 'attentionThreshold', value: '6.5', description: 'Limiar de alerta atenção' },
      { key: 'criticalThreshold', value: '5.0', description: 'Limiar de alerta crítico' },
      { key: 'anotacoesToTMD', value: '4', description: 'Anotações para gerar TMD Leve auto' },
      { key: 'cycleType', value: 'ANUAL', description: 'Tipo de ciclo letivo' },
      { key: 'emailNotifications', value: 'false', description: 'Notificações por e-mail' },
    ],
  });
  console.log('✓ Configurações padrão criadas');

  // Usuários
  const passwordHash = await bcrypt.hash('admin123', 10);
  const adminPasswordHash = await bcrypt.hash('admin123', 10);

  const admin = await prisma.user.create({
    data: {
      name: 'Coronel Diretor',
      email: 'admin@cmto.edu.br',
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
      phone: '(63) 99000-0001',
    },
  });

  const coordDisc = await prisma.user.create({
    data: {
      name: 'Cap. Coordenadora Disciplinar',
      email: 'disciplina@cmto.edu.br',
      passwordHash,
      role: 'COORD_DISCIPLINAR',
      phone: '(63) 99000-0002',
    },
  });

  const coordPed = await prisma.user.create({
    data: {
      name: 'Profa. Coordenadora Pedagógica',
      email: 'pedagogico@cmto.edu.br',
      passwordHash,
      role: 'COORD_PEDAGOGICO',
      phone: '(63) 99000-0003',
    },
  });

  const monitor = await prisma.user.create({
    data: {
      name: 'Sgt. Monitor 9A',
      email: 'monitor@cmto.edu.br',
      passwordHash,
      role: 'MONITOR',
      phone: '(63) 99000-0004',
    },
  });

  console.log('✓ Usuários criados (admin@cmto.edu.br / admin123)');

  // Turmas
  const turmas = await Promise.all([
    prisma.class.create({
      data: { name: '9º Ano A', schoolYear: 2026, shift: 'MATUTINO', counselor: 'Profa. Marina Costa' },
    }),
    prisma.class.create({
      data: { name: '9º Ano B', schoolYear: 2026, shift: 'MATUTINO', counselor: 'Prof. Roberto Silva' },
    }),
    prisma.class.create({
      data: { name: '8º Ano A', schoolYear: 2026, shift: 'VESPERTINO', counselor: 'Profa. Lúcia Andrade' },
    }),
    prisma.class.create({
      data: { name: '7º Ano A', schoolYear: 2026, shift: 'VESPERTINO', counselor: 'Prof. Carlos Mendes' },
    }),
  ]);

  // Vincular monitor à turma 9A
  await prisma.classUser.create({
    data: { userId: monitor.id, classId: turmas[0].id },
  });

  console.log(`✓ ${turmas.length} turmas criadas`);

  // Categorias
  const categorias = await Promise.all([
    prisma.occurrenceCategory.create({
      data: { name: 'Uniforme incompleto', defaultType: 'ANOTACAO' },
    }),
    prisma.occurrenceCategory.create({
      data: { name: 'Atraso', defaultType: 'ANOTACAO' },
    }),
    prisma.occurrenceCategory.create({
      data: { name: 'Indisciplina em sala', defaultType: 'TMD', defaultLevel: 'LEVE' },
    }),
    prisma.occurrenceCategory.create({
      data: { name: 'Desrespeito a colega', defaultType: 'TMD', defaultLevel: 'MEDIA' },
    }),
    prisma.occurrenceCategory.create({
      data: { name: 'Desrespeito a superior', defaultType: 'TMD', defaultLevel: 'GRAVE' },
    }),
    prisma.occurrenceCategory.create({
      data: { name: 'Agressão física', defaultType: 'SUSPENSAO' },
    }),
    prisma.occurrenceCategory.create({
      data: { name: 'Uso indevido de celular', defaultType: 'ANOTACAO' },
    }),
    prisma.occurrenceCategory.create({
      data: { name: 'Cabelo fora do padrão', defaultType: 'ANOTACAO' },
    }),
    prisma.occurrenceCategory.create({
      data: { name: 'Falta de material', defaultType: 'ANOTACAO' },
    }),
    prisma.occurrenceCategory.create({
      data: { name: 'Saída sem autorização', defaultType: 'TMD', defaultLevel: 'MEDIA' },
    }),
  ]);

  console.log(`✓ ${categorias.length} categorias criadas`);

  // Alunos
  let regCounter = 2026001;
  const students = [];
  for (const turma of turmas) {
    const count = 8 + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i++) {
      const name = STUDENTS_NAMES[(regCounter - 2026001) % STUDENTS_NAMES.length];
      // Simular distribuição de notas
      const baseScore = 8.0;
      const variation = (Math.random() - 0.4) * 4; // pode subir até +2.4 ou cair até -1.6
      const finalScore = Math.max(0, Math.min(10, baseScore + variation));

      const s = await prisma.student.create({
        data: {
          registration: `${regCounter}`,
          name: `${name} ${regCounter}`.replace(`${regCounter}`, ''),
          birthDate: new Date(2010 + Math.floor(Math.random() * 5), Math.floor(Math.random() * 12), 1 + Math.floor(Math.random() * 28)),
          guardianName: `Responsável de ${name.split(' ')[0]}`,
          guardianPhone: `(63) 99${String(Math.floor(Math.random() * 1000000)).padStart(6, '0')}`,
          guardianEmail: `responsavel${regCounter}@email.com`,
          guardianRelation: ['Pai', 'Mãe', 'Avó', 'Tio'][Math.floor(Math.random() * 4)],
          city: 'Araguatins',
          state: 'TO',
          classId: turma.id,
          currentScore: parseFloat(finalScore.toFixed(2)),
          status: 'ATIVO',
        },
      });
      students.push(s);

      // Histórico inicial
      await prisma.scoreHistory.create({
        data: {
          studentId: s.id,
          previousScore: 0,
          newScore: 8.0,
          delta: 8.0,
          reason: 'Conceito inicial',
        },
      });

      // Adicionar histórico simulado se nota foi alterada
      if (finalScore !== 8.0) {
        await prisma.scoreHistory.create({
          data: {
            studentId: s.id,
            previousScore: 8.0,
            newScore: finalScore,
            delta: finalScore - 8.0,
            reason: 'Histórico simulado de ocorrências',
          },
        });
      }

      regCounter++;
    }
  }

  console.log(`✓ ${students.length} alunos criados`);

  // Algumas ocorrências de exemplo
  const sampleStudents = students.slice(0, 6);
  for (const s of sampleStudents) {
    const cat = categorias[Math.floor(Math.random() * categorias.length)];
    await prisma.occurrence.create({
      data: {
        studentId: s.id,
        type: cat.defaultType || 'ANOTACAO',
        tmdLevel: cat.defaultLevel,
        categoryId: cat.id,
        occurredAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        description: `Ocorrência registrada: ${cat.name}. Aluno foi orientado conforme regimento.`,
        scoreImpact: cat.defaultType === 'ANOTACAO' ? 0 : -0.30,
        status: 'APROVADO',
        createdById: coordDisc.id,
      },
    });
  }

  // Alguns elogios
  for (const s of students.slice(0, 3)) {
    await prisma.praise.create({
      data: {
        studentId: s.id,
        type: 'INDIVIDUAL',
        scoreImpact: 0.50,
        occurredAt: new Date(Date.now() - Math.random() * 15 * 24 * 60 * 60 * 1000),
        reason: 'Excelente desempenho em formatura',
        description: 'Aluno demonstrou conduta exemplar e liderança.',
        createdById: coordPed.id,
      },
    });
  }

  // Notificações de exemplo
  const criticalStudents = students.filter(s => s.currentScore < 5);
  for (const s of criticalStudents.slice(0, 3)) {
    await prisma.notification.create({
      data: {
        userId: admin.id,
        type: 'ALERTA_CRITICO',
        title: '🚨 Aluno em nível CRÍTICO',
        message: `${s.name} está com conceito ${s.currentScore.toFixed(2)}.`,
        link: `/students/${s.id}`,
      },
    });
  }

  console.log(`\n🎉 Seed concluído!\n`);
  console.log(`📋 Credenciais de acesso:`);
  console.log(`   Admin:        admin@cmto.edu.br      | admin123`);
  console.log(`   Coord. Disc.: disciplina@cmto.edu.br | admin123`);
  console.log(`   Coord. Ped.:  pedagogico@cmto.edu.br | admin123`);
  console.log(`   Monitor:      monitor@cmto.edu.br    | admin123\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
