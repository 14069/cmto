export const ROLE_LABELS = {
  ADMIN: 'Administrador',
  COORD_DISCIPLINAR: 'Coord. Disciplinar',
  COORD_PEDAGOGICO: 'Coord. Pedagógico',
  MONITOR: 'Monitor',
  PROFESSOR: 'Professor',
};

export const TMD_LABELS = {
  LEVE: 'TMD Leve',
  MEDIA: 'TMD Médio',
  GRAVE: 'TMD Grave',
  GRAVISSIMO: 'TMD Gravíssimo',
};

export const TMD_COLORS = {
  LEVE: 'bg-amber-50 text-amber-700 border-amber-200',
  MEDIA: 'bg-orange-50 text-orange-700 border-orange-200',
  GRAVE: 'bg-red-50 text-red-700 border-red-200',
  GRAVISSIMO: 'bg-red-50 text-red-700 border-red-200',
};

export const PRAISE_LABELS = {
  COLETIVO: 'Elogio Coletivo',
  INDIVIDUAL: 'Elogio Individual',
  MENCAO_HONROSA: 'Menção Honrosa',
};

export const STATUS_LABELS = {
  RASCUNHO: 'Rascunho',
  PENDENTE_DEFESA: 'Aguardando Defesa',
  PENDENTE_APROVACAO: 'Aguarda Aprovação',
  APROVADO: 'Aprovado',
  REJEITADO: 'Rejeitado',
  ARQUIVADO: 'Arquivado',
  AUTO_GERADO: 'Auto-gerado',
};

export const STATUS_COLORS = {
  RASCUNHO: 'bg-slate-100 text-slate-600 border-slate-200',
  PENDENTE_DEFESA: 'bg-amber-50 text-amber-700 border-amber-200',
  PENDENTE_APROVACAO: 'bg-blue-50 text-blue-700 border-blue-200',
  APROVADO: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REJEITADO: 'bg-red-50 text-red-700 border-red-200',
  ARQUIVADO: 'bg-slate-100 text-slate-600 border-slate-300',
  AUTO_GERADO: 'bg-purple-50 text-purple-700 border-purple-200',
};

export const SHIFT_LABELS = {
  MATUTINO: 'Matutino',
  VESPERTINO: 'Vespertino',
  INTEGRAL: 'Integral',
  NOTURNO: 'Noturno',
};

export const STUDENT_STATUS_LABELS = {
  ATIVO: 'Ativo',
  INATIVO: 'Inativo',
  TRANSFERIDO: 'Transferido',
  FORMADO: 'Formado',
};

export function getScoreColor(score, thresholds = { attention: 6.5, critical: 5.0 }) {
  if (score < thresholds.critical) return 'text-red-700';
  if (score < thresholds.attention) return 'text-amber-700';
  return 'text-emerald-700';
}

export function getScoreBg(score, thresholds = { attention: 6.5, critical: 5.0 }) {
  if (score < thresholds.critical) return 'bg-red-500';
  if (score < thresholds.attention) return 'bg-amber-400';
  return 'bg-emerald-500';
}

export function formatDate(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('pt-BR');
}

export function formatDateTime(date) {
  if (!date) return '—';
  return new Date(date).toLocaleString('pt-BR');
}

export function timeAgo(date) {
  if (!date) return '';
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  if (seconds < 60) return 'agora';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `há ${days}d`;
  return formatDate(date);
}
