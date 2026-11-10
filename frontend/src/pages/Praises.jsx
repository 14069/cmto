import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Award } from 'lucide-react';
import api from '../lib/api.js';
import { Loading, EmptyState, PageHeader } from '../components/ui/Misc.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import PraiseModal from '../components/forms/PraiseModal.jsx';
import { PRAISE_LABELS, formatDateTime } from '../lib/constants.js';

export default function Praises() {
  const { hasRole } = useAuth();
  const [praises, setPraises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const { data } = await api.get('/praises');
      setPraises(data);
    } finally { setLoading(false); }
  }

  return (
    <div className="max-w-7xl mx-auto fade-in">
      <PageHeader
        title="Elogios e Reconhecimentos"
        subtitle={`${praises.length} registros`}
        breadcrumb="Sistema · Elogios"
        actions={hasRole('ADMIN', 'COORD_DISCIPLINAR', 'COORD_PEDAGOGICO') && (
          <button onClick={() => setModalOpen(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Novo Elogio
          </button>
        )}
      />

      {loading ? <Loading /> : praises.length === 0 ? (
        <EmptyState icon={Award} title="Nenhum elogio registrado" description="Reconheça ações positivas dos alunos." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {praises.map(p => (
            <div key={p.id} className="card p-5 border-l-4 border-l-solar-400">
              <div className="flex items-start justify-between mb-2">
                <span className="text-xs uppercase tracking-widest text-amber-700">
                  {PRAISE_LABELS[p.type]}
                </span>
                <span className="font-mono text-sm text-amber-700">+{p.scoreImpact.toFixed(2)}</span>
              </div>
              {p.student ? (
                <Link to={`/students/${p.student.id}`} className="font-sans text-lg text-slate-900 hover:text-amber-700">
                  {p.student.name}
                </Link>
              ) : (
                <p className="font-sans text-lg text-slate-900">Turma {p.class?.name}</p>
              )}
              <p className="text-sm text-slate-600 mt-2 italic">"{p.reason}"</p>
              <p className="text-sm text-slate-600 mt-1">{p.description}</p>
              <p className="text-xs text-slate-500 mt-3">
                {formatDateTime(p.occurredAt)} · por {p.createdBy?.name}
              </p>
            </div>
          ))}
        </div>
      )}

      <PraiseModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => { setModalOpen(false); fetchData(); }}
      />
    </div>
  );
}
