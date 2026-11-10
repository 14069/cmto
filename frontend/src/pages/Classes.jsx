import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, GraduationCap, Users, Edit, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api.js';
import { Loading, EmptyState, PageHeader } from '../components/ui/Misc.jsx';
import { ScoreBadge } from '../components/ui/Score.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import Modal from '../components/ui/Modal.jsx';
import { SHIFT_LABELS } from '../lib/constants.js';

export default function Classes() {
  const { hasRole } = useAuth();
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => { fetchClasses(); }, []);

  async function fetchClasses() {
    setLoading(true);
    try {
      const { data } = await api.get('/classes');
      setClasses(data);
    } finally { setLoading(false); }
  }

  function openNew() { setEditing(null); setModalOpen(true); }
  function openEdit(cls) { setEditing(cls); setModalOpen(true); }

  return (
    <div className="max-w-7xl mx-auto fade-in">
      <PageHeader
        title="Turmas"
        subtitle="Gerencie turmas e acompanhe o desempenho disciplinar"
        breadcrumb="Sistema · Turmas"
        actions={hasRole('ADMIN', 'COORD_DISCIPLINAR', 'COORD_PEDAGOGICO') && (
          <button onClick={openNew} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Nova Turma
          </button>
        )}
      />

      {loading ? <Loading /> : classes.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="Nenhuma turma cadastrada"
          description="Comece criando a primeira turma do ciclo letivo."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {classes.map(cls => (
            <Link
              key={cls.id}
              to={`/students?classId=${cls.id}`}
              className="card p-6 group hover:border-slate-200 transition relative"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-slate-500">
                    {cls.schoolYear} · {SHIFT_LABELS[cls.shift]}
                  </p>
                  <h3 className="font-sans text-2xl text-slate-900 font-semibold mt-1">
                    {cls.name}
                  </h3>
                </div>
                <ChevronRight size={18} className="text-slate-500 group-hover:text-amber-700 transition" />
              </div>

              {cls.counselor && (
                <p className="text-xs text-slate-500 mb-4">
                  Conselheiro: <span className="text-slate-900">{cls.counselor}</span>
                </p>
              )}

              <div className="flex items-center justify-between border-t border-slate-200 pt-4 mt-4">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Users size={14} />
                  <span>{cls.activeStudentsCount} alunos</span>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-widest text-slate-500">Conceito Médio</p>
                  <ScoreBadge score={cls.averageScore} size="md" />
                </div>
              </div>

              {hasRole('ADMIN', 'COORD_DISCIPLINAR', 'COORD_PEDAGOGICO') && (
                <button
                  onClick={(e) => { e.preventDefault(); openEdit(cls); }}
                  className="absolute top-4 right-12 text-slate-500 hover:text-amber-700 transition"
                >
                  <Edit size={14} />
                </button>
              )}
            </Link>
          ))}
        </div>
      )}

      <ClassFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        onSaved={() => { setModalOpen(false); fetchClasses(); }}
      />
    </div>
  );
}

function ClassFormModal({ open, onClose, editing, onSaved }) {
  const [form, setForm] = useState({ name: '', schoolYear: new Date().getFullYear(), shift: 'MATUTINO', counselor: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) setForm({ ...editing });
    else setForm({ name: '', schoolYear: new Date().getFullYear(), shift: 'MATUTINO', counselor: '' });
  }, [editing, open]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/classes/${editing.id}`, form);
        toast.success('Turma atualizada');
      } else {
        await api.post('/classes', { ...form, schoolYear: parseInt(form.schoolYear) });
        toast.success('Turma criada');
      }
      onSaved();
    } catch {} finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar Turma' : 'Nova Turma'} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label-field">Nome da turma</label>
          <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Ex: 9º Ano A" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label-field">Ano letivo</label>
            <input type="number" className="input-field" value={form.schoolYear} onChange={(e) => setForm({ ...form, schoolYear: e.target.value })} required />
          </div>
          <div>
            <label className="label-field">Turno</label>
            <select className="input-field" value={form.shift} onChange={(e) => setForm({ ...form, shift: e.target.value })}>
              {Object.entries(SHIFT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="label-field">Professor conselheiro (opcional)</label>
          <input className="input-field" value={form.counselor || ''} onChange={(e) => setForm({ ...form, counselor: e.target.value })} />
        </div>
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </form>
    </Modal>
  );
}
