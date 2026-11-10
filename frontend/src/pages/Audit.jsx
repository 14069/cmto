import { useState, useEffect } from 'react';
import { ClipboardList } from 'lucide-react';
import api from '../lib/api.js';
import { Loading, EmptyState, PageHeader } from '../components/ui/Misc.jsx';
import { formatDateTime } from '../lib/constants.js';

const ACTION_COLORS = {
  CREATE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  UPDATE: 'bg-blue-50 text-blue-700 border-blue-200',
  DELETE: 'bg-red-50 text-red-700 border-red-200',
  LOGIN: 'bg-slate-100 text-slate-600 border-slate-200',
  LOGOUT: 'bg-slate-100 text-slate-600 border-slate-200',
  APPROVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REJECT: 'bg-red-50 text-red-700 border-red-200',
  DEACTIVATE: 'bg-amber-50 text-amber-700 border-amber-200',
};

export default function Audit() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({});

  useEffect(() => { fetchData(); }, [filters]);

  async function fetchData() {
    setLoading(true);
    try {
      const { data } = await api.get('/audit', { params: filters });
      setLogs(data);
    } finally { setLoading(false); }
  }

  return (
    <div className="max-w-7xl mx-auto fade-in">
      <PageHeader
        title="Auditoria"
        subtitle={`${logs.length} registros encontrados`}
        breadcrumb="Administração · Auditoria"
      />

      <div className="card p-4 mb-6 grid grid-cols-1 md:grid-cols-3 gap-3">
        <select className="input-field" value={filters.entity || ''} onChange={(e) => setFilters({ ...filters, entity: e.target.value || undefined })}>
          <option value="">Todas as entidades</option>
          <option value="User">Usuários</option>
          <option value="Student">Alunos</option>
          <option value="Class">Turmas</option>
          <option value="Occurrence">Ocorrências</option>
          <option value="Praise">Elogios</option>
          <option value="TAC">TACs</option>
          <option value="SystemConfig">Configurações</option>
        </select>
        <select className="input-field" value={filters.action || ''} onChange={(e) => setFilters({ ...filters, action: e.target.value || undefined })}>
          <option value="">Todas as ações</option>
          <option value="CREATE">Criar</option>
          <option value="UPDATE">Atualizar</option>
          <option value="DELETE">Excluir</option>
          <option value="LOGIN">Login</option>
          <option value="APPROVE">Aprovar</option>
          <option value="REJECT">Rejeitar</option>
        </select>
      </div>

      {loading ? <Loading /> : logs.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Nenhum registro" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-widest">
              <tr>
                <th className="text-left py-3 px-5">Data/Hora</th>
                <th className="text-left py-3 px-5">Usuário</th>
                <th className="text-left py-3 px-5">Ação</th>
                <th className="text-left py-3 px-5">Entidade</th>
                <th className="text-left py-3 px-5">IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l, i) => (
                <tr key={l.id} className={`border-b border-slate-200 hover:bg-slate-50 transition ${i % 2 !== 0 ? 'bg-slate-50' : ''}`}>
                  <td className="py-3 px-5 text-xs text-slate-600 font-mono">{formatDateTime(l.createdAt)}</td>
                  <td className="py-3 px-5 text-slate-900">{l.user?.name || '—'}</td>
                  <td className="py-3 px-5">
                    <span className={`badge ${ACTION_COLORS[l.action] || 'bg-slate-100 text-slate-600'}`}>{l.action}</span>
                  </td>
                  <td className="py-3 px-5 text-slate-600">{l.entity}</td>
                  <td className="py-3 px-5 text-xs font-mono text-slate-500">{l.ipAddress || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
