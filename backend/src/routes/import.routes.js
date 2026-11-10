import express from 'express';
import prisma from '../utils/prisma.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { auditLog } from '../middleware/audit.js';

const router = express.Router();
router.use(authenticate, authorize('ADMIN', 'COORD_DISCIPLINAR', 'COORD_PEDAGOGICO'));

/**
 * POST /api/import/preview
 * Recebe array de linhas já parseadas do CSV e valida sem salvar
 */
router.post('/preview', async (req, res, next) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Nenhum dado enviado' });
    }

    const result = await processRows(rows, { dryRun: true });
    res.json(result);
  } catch (err) { next(err); }
});

/**
 * POST /api/import/commit
 * Confirma a importação após o preview
 */
router.post('/commit', async (req, res, next) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Nenhum dado enviado' });
    }

    const result = await processRows(rows, { dryRun: false });

    await auditLog({
      userId: req.user.id,
      action: 'IMPORT',
      entity: 'Student',
      newData: { total: result.created, updated: result.updated },
      req,
    });

    res.json(result);
  } catch (err) { next(err); }
});

// ——— Mapeamento de cabeçalhos aceitos (flexível) ———
const FIELD_MAP = {
  // Matrícula
  matricula: 'registration', registration: 'registration', ra: 'registration',
  'número': 'registration', numero: 'registration',

  // Nome
  nome: 'name', name: 'name', 'nome completo': 'name',

  // Turma
  turma: 'className', class: 'className', série: 'className', serie: 'className',
  'nome da turma': 'className', 'turma/série': 'className',

  // Ano letivo
  'ano letivo': 'schoolYear', 'ano': 'schoolYear', schoolyear: 'schoolYear',

  // Turno
  turno: 'shift', shift: 'shift',

  // Nascimento
  nascimento: 'birthDate', 'data de nascimento': 'birthDate', birthdate: 'birthDate',
  'data nasc': 'birthDate', 'data nasc.': 'birthDate',

  // Responsável
  responsável: 'guardianName', responsavel: 'guardianName', 'nome do responsável': 'guardianName',
  guardianname: 'guardianName', 'nome do responsavel': 'guardianName',

  // Parentesco
  parentesco: 'guardianRelation', relação: 'guardianRelation', relacao: 'guardianRelation',

  // Telefone responsável
  telefone: 'guardianPhone', fone: 'guardianPhone', 'telefone do responsável': 'guardianPhone',
  'fone do responsavel': 'guardianPhone', guardianphone: 'guardianPhone',

  // E-mail responsável
  'e-mail responsável': 'guardianEmail', 'e-mail do responsavel': 'guardianEmail',
  'email responsavel': 'guardianEmail', guardianemail: 'guardianEmail',

  // Profissão do responsável
  'profissão do responsável': 'guardianProfession', 'profissao do responsavel': 'guardianProfession',
  profissão: 'guardianProfession', profissao: 'guardianProfession',

  // Celular do aluno
  celular: 'phone', 'nº celular': 'phone', 'numero celular': 'phone',
  'celular do aluno': 'phone', phone: 'phone',

  // E-mail do aluno
  'e-mail': 'email', 'e-mail do aluno': 'email', 'email do aluno': 'email', email: 'email',

  // E-mail institucional
  'e-mail institucional': 'institutionalEmail', 'email institucional': 'institutionalEmail',
  institutionalemail: 'institutionalEmail',

  // Identificadores
  cpf: 'cpf',
  rnep: 'rnep',
  'cartão su': 'suCard', 'cartao su': 'suCard', sucard: 'suCard',
  'bg': 'bg', 'boletim geral': 'bg',
  'nº chamada': 'callNumber', 'numero chamada': 'callNumber', 'nr chamada': 'callNumber',
  callnumber: 'callNumber',

  // Sexo / Nome Social
  sexo: 'gender', gender: 'gender',
  'nome social': 'socialName', socialname: 'socialName',

  // Naturalidade
  naturalidade: 'birthplace', birthplace: 'birthplace',

  // Endereço
  endereço: 'address', endereco: 'address', address: 'address',
  bairro: 'neighborhood', neighborhood: 'neighborhood',
  cep: 'zipCode', 'cep': 'zipCode', zipcode: 'zipCode',
  cidade: 'city', city: 'city',
  estado: 'state', state: 'state', uf: 'state',
  país: 'country', pais: 'country', country: 'country',
  'zona de ensino': 'zone', zona: 'zone', zone: 'zone',
  'localização nacional': 'nationalLocation', 'localizacao nacional': 'nationalLocation',

  // Necessidades / benefícios
  'necessidade especial': 'specialNeeds', necessidade: 'specialNeeds', specialneeds: 'specialNeeds',
  'recursos de acessibilidade': 'resources', recursos: 'resources', resources: 'resources',
  restrições: 'restrictions', restricoes: 'restrictions', restrictions: 'restrictions',
  'nº bolsa família': 'scholarshipNumber', 'bolsa familia': 'scholarshipNumber',
  'numero bolsa': 'scholarshipNumber', scholarshipnumber: 'scholarshipNumber',
  'recebe benefício': 'receivesBenefit', 'recebe beneficio': 'receivesBenefit',

  // Situação escolar
  'situação escolar': 'schoolStatus', 'situacao escolar': 'schoolStatus', schoolstatus: 'schoolStatus',
  'data da situação': 'statusDate', 'data situacao': 'statusDate',
  'data de confirmação': 'confirmationDate', 'data confirmacao': 'confirmationDate',

  // Autorização
  autorizado: 'authorized', authorized: 'authorized',
  'comunicação prioritária': 'priorityCommunication', 'comunicacao prioritaria': 'priorityCommunication',
};

const SHIFT_MAP = {
  matutino: 'MATUTINO', manhã: 'MATUTINO', m: 'MATUTINO',
  vespertino: 'VESPERTINO', tarde: 'VESPERTINO', v: 'VESPERTINO',
  integral: 'INTEGRAL', i: 'INTEGRAL',
  noturno: 'NOTURNO', noite: 'NOTURNO', n: 'NOTURNO',
};

function normalizeHeader(h) {
  return h.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9\s\/]/g, '').trim();
}

async function processRows(rows, { dryRun }) {
  const errors = [];
  const warnings = [];
  const preview = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  // Cache de turmas já consultadas/criadas nesta sessão
  const classCache = {};

  async function getOrCreateClass(className, schoolYear, shift) {
    const key = `${className}__${schoolYear}__${shift}`;
    if (classCache[key]) return classCache[key];

    const existing = await prisma.class.findFirst({
      where: {
        name: { equals: className },
        schoolYear: parseInt(schoolYear) || new Date().getFullYear(),
        active: true,
      },
    });

    if (existing) {
      classCache[key] = existing;
      return existing;
    }

    if (dryRun) {
      // Em preview, simula criação
      const mock = { id: `new__${key}`, name: className, schoolYear, shift, _new: true };
      classCache[key] = mock;
      return mock;
    }

    const created = await prisma.class.create({
      data: {
        name: className,
        schoolYear: parseInt(schoolYear) || new Date().getFullYear(),
        shift: shift || 'MATUTINO',
        active: true,
      },
    });
    classCache[key] = created;
    return created;
  }

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const rowNum = idx + 2; // +2 porque linha 1 é o cabeçalho

    try {
      // Campos obrigatórios
      const registration = row.registration?.trim();
      const name = row.name?.trim();
      const className = row.className?.trim();

      if (!registration) {
        errors.push({ row: rowNum, message: 'Matrícula ausente', data: row });
        skipped++;
        continue;
      }
      if (!name) {
        errors.push({ row: rowNum, message: 'Nome ausente', data: row });
        skipped++;
        continue;
      }
      if (!className) {
        errors.push({ row: rowNum, message: 'Turma ausente', data: row });
        skipped++;
        continue;
      }

      const schoolYear = row.schoolYear || new Date().getFullYear();
      const shift = SHIFT_MAP[row.shift?.toLowerCase()] || 'MATUTINO';

      const cls = await getOrCreateClass(className, schoolYear, shift);

      const parseBoolean = (v) => {
        if (!v) return false;
        return ['sim', 'yes', 'true', '1', 's'].includes(String(v).trim().toLowerCase());
      };

      const studentData = {
        registration,
        name,
        classId: cls.id,
        status: 'ATIVO',
        birthDate: row.birthDate ? new Date(row.birthDate) : null,
        // Identificadores
        cpf: row.cpf || null,
        rnep: row.rnep || null,
        suCard: row.suCard || null,
        bg: row.bg || null,
        callNumber: row.callNumber ? parseInt(row.callNumber) : null,
        // Dados pessoais
        gender: row.gender || null,
        socialName: row.socialName || null,
        birthplace: row.birthplace || null,
        // Contato do aluno
        phone: row.phone || null,
        email: row.email || null,
        institutionalEmail: row.institutionalEmail || null,
        // Endereço
        address: row.address || null,
        neighborhood: row.neighborhood || null,
        zipCode: row.zipCode || null,
        city: row.city || null,
        state: row.state || null,
        country: row.country || null,
        zone: row.zone || null,
        nationalLocation: row.nationalLocation || null,
        // Responsável
        guardianName: row.guardianName || null,
        guardianRelation: row.guardianRelation || null,
        guardianPhone: row.guardianPhone || null,
        guardianEmail: row.guardianEmail || null,
        guardianProfession: row.guardianProfession || null,
        // Necessidades
        specialNeeds: row.specialNeeds || null,
        resources: row.resources || null,
        restrictions: row.restrictions || null,
        scholarshipNumber: row.scholarshipNumber || null,
        receivesBenefit: parseBoolean(row.receivesBenefit),
        // Autorização
        authorized: row.authorized || null,
        priorityCommunication: parseBoolean(row.priorityCommunication),
        // Situação
        schoolStatus: row.schoolStatus || null,
        statusDate: row.statusDate ? new Date(row.statusDate) : null,
        confirmationDate: row.confirmationDate ? new Date(row.confirmationDate) : null,
      };

      // Verificar se já existe
      const existing = await prisma.student.findUnique({
        where: { registration },
        include: { class: true },
      });

      if (existing) {
        warnings.push({
          row: rowNum,
          message: `Matrícula ${registration} já existe — será atualizada`,
          data: { name, currentClass: existing.class.name, newClass: className },
        });
        preview.push({
          row: rowNum, action: 'UPDATE', registration, name,
          className, shift, classIsNew: cls._new || false,
        });

        if (!dryRun) {
          await prisma.student.update({
            where: { registration },
            data: studentData,
          });
          updated++;
        }
      } else {
        preview.push({
          row: rowNum, action: 'CREATE', registration, name,
          className, shift, classIsNew: cls._new || false,
        });

        if (!dryRun) {
          const s = await prisma.student.create({ data: { ...studentData, currentScore: 8.0 } });
          // Histórico inicial
          await prisma.scoreHistory.create({
            data: {
              studentId: s.id,
              previousScore: 0,
              newScore: 8.0,
              delta: 8.0,
              reason: 'Conceito inicial — importação CSV',
            },
          });
          created++;
        } else {
          created++;
        }
      }
    } catch (err) {
      errors.push({ row: rowNum, message: err.message, data: row });
      skipped++;
    }
  }

  return { created, updated, skipped, errors, warnings, preview };
}

// Exportar o mapa de campos para uso no frontend
router.get('/field-map', (req, res) => {
  res.json({ fieldMap: FIELD_MAP, shiftMap: SHIFT_MAP });
});

export { FIELD_MAP, normalizeHeader };
export default router;
