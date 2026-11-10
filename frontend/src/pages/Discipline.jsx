import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, AlertTriangle, Filter, Check, X, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api.js';
import { Loading, EmptyState, PageHeader } from '../components/ui/Misc.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import OccurrenceModal from '../components/forms/OccurrenceModal.jsx';
import { STATUS_LABELS, STATUS_COLORS, formatDateTime } from '../lib/constants.js';

export default function Discipline() {
  const { hasRole } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [occurrences, setOccurrences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const filters = {
    type: searchParams.get('type') || '',
    status: searchParams.get('status') || '',
  };

  useEffect(() => { fetchData(); }, [searchParams]);

  async function fetchData() {
    setLoading(true);
    try {
      const params = {};
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const { data } = await api.get('/occurrences', { params });
      setOccurrences(data);
    } finally { setLoading(false); }
  }

  function setFilter(key, value) {
    const next = { ...filters, [key]: value };
    setSearchParams(Object.fromEntries(Object.entries(next).filter(([_, v]) => v)));
  }

  async function handleApprove(id) {
    try {
      await api.post(`/occurrences/${id}/approve`);
      toast.success('Ocorrência aprovada');
      fetchData();
    } catch {}
  }

  async function handleReject(id) {
    const reason = prompt('Motivo da rejeição:');
    if (!reason) return;
    try {
      await api.post(`/occurrences/${id}/reject`, { reason });
      toast.success('Ocorrência rejeitada');
      fetchData();
    } catch {}
  }

  return (
    <div className="max-w-7xl mx-auto fade-in">
      <PageHeader
        title="Ocorrências Disciplinares"
        subtitle={`${occurrences.length} registro(s)`}
        breadcrumb="Sistema · Disciplinar"
        actions={
          <button onClick={() => setModalOpen(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Nova Ocorrência
          </button>
        }
      />

      {/* Filtros */}
      <div className="card p-4 mb-6 flex gap-3 flex-wrap">
        <select className="input-field w-auto min-w-[200px]" value={filters.type} onChange={(e) => setFilter('type', e.target.value)}>
          <option value="">Todos os tipos</option>
          <option value="ANOTACAO">Anotações</option>
          <option value="TMD">TMD</option>
          <option value="SUSPENSAO">Suspensões</option>
        </select>
        <select className="input-field w-auto min-w-[200px]" value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {loading ? <Loading /> : occurrences.length === 0 ? (
        <EmptyState icon={AlertTriangle} title="Nenhuma ocorrência" description="Não há registros disciplinares nesta filtragem." />
      ) : (
        <div className="space-y-3">
          {occurrences.map(o => (
            <div key={o.id} className="card p-5 hover:border-slate-200 transition">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 flex-wrap mb-2">
                    <span className={`badge ${STATUS_COLORS[o.status]}`}>{STATUS_LABELS[o.status]}</span>
                    <span className="text-sm font-medium text-slate-900">
                      {o.type === 'TMD' ? `TMD ${o.tmdLevel}` :
                       o.type === 'SUSPENSAO' ? `Suspensão ${o.suspensionDays}d` : 'Anotação'}
                    </span>
                    {o.scoreImpact !== 0 && (
                      <span className="text-xs text-red-700 font-mono">
                        {o.scoreImpact > 0 ? '+' : ''}{o.scoreImpact.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <Link to={`/students/${o.student.id}`} className="font-sans text-lg text-slate-900 hover:text-amber-700">
                    {o.student.name}
                  </Link>
                  <p className="text-xs text-slate-500 mb-2">{o.student.class.name}</p>
                  <p className="text-sm text-slate-600">{o.description}</p>
                  {o.category && <p className="text-xs text-slate-500 mt-2">Categoria: {o.category.name}</p>}
                  <p className="text-xs text-slate-500 mt-2">
                    {formatDateTime(o.occurredAt)} · por {o.createdBy?.name}
                  </p>
                </div>
                {o.status === 'PENDENTE_APROVACAO' && hasRole('ADMIN', 'COORD_DISCIPLINAR') && (
                  <div className="flex gap-2 flex-col">
                    <button onClick={() => handleApprove(o.id)} className="btn-primary py-2 text-xs flex items-center gap-1">
                      <Check size={14} /> Aprovar
                    </button>
                    <button onClick={() => handleReject(o.id)} className="btn-secondary py-2 text-xs flex items-center gap-1">
                      <X size={14} /> Rejeitar
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <OccurrenceModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => { setModalOpen(false); fetchData(); }}
      />
    </div>
  );
}
