import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search, Filter, Users, ChevronRight, FileText, Upload, Download, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api.js';
import { Loading, EmptyState, PageHeader } from '../components/ui/Misc.jsx';
import { ScoreBadge, ScoreBar } from '../components/ui/Score.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import Modal from '../components/ui/Modal.jsx';
import { STUDENT_STATUS_LABELS } from '../lib/constants.js';
import ImportModal from '../components/forms/ImportModal.jsx';

export default function Students() {
  const { hasRole } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [thresholds, setThresholds] = useState({ attention: 6.5, critical: 5.0 });
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const filters = {
    classId: searchParams.get('classId') || '',
    status: searchParams.get('status') || 'ATIVO',
    search: searchParams.get('search') || '',
    scoreLevel: searchParams.get('scoreLevel') || '',
  };

  useEffect(() => { fetchData(); }, [searchParams]);
  useEffect(() => {
    api.get('/classes').then(({ data }) => setClasses(data));
    api.get('/config').then(({ data }) => setThresholds({
      attention: data.attentionThreshold,
      critical: data.criticalThreshold,
    }));
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const params = {};
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const { data } = await api.get('/students', { params });
      setStudents(data);
    } finally { setLoading(false); }
  }

  function setFilter(key, value) {
    const next = { ...filters, [key]: value };
    setSearchParams(Object.fromEntries(Object.entries(next).filter(([_, v]) => v)));
  }

  async function handleExport() {
    try {
      const params = {};
      if (filters.classId) params.classId = filters.classId;
      if (filters.status) params.status = filters.status;
      const { data } = await api.get('/export/students', { params, responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([data], { type: 'text/csv;charset=utf-8;' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `alunos_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Erro ao exportar alunos');
    }
  }

  return (
    <div className="max-w-7xl mx-auto fade-in">
      <PageHeader
        title="Alunos"
        subtitle={`${students.length} aluno(s) encontrado(s)`}
        breadcrumb="Sistema · Alunos"
        actions={hasRole('ADMIN', 'COORD_DISCIPLINAR', 'COORD_PEDAGOGICO') && (
          <div className="flex gap-2">
            <button
              onClick={() => setImportOpen(true)}
              className="btn-secondary flex items-center gap-2"
            >
              <Upload size={14} /> Importar CSV
            </button>
            <button
              onClick={handleExport}
              className="btn-secondary flex items-center gap-2"
            >
              <Download size={14} /> Exportar CSV
            </button>
            <button onClick={() => { setEditing(null); setModalOpen(true); }} className="btn-primary flex items-center gap-2">
              <Plus size={16} /> Novo Aluno
            </button>
          </div>
        )}
      />

      {/* Filtros */}
      <div className="card p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input-field pl-9"
              placeholder="Buscar por nome ou matrícula..."
              value={filters.search}
              onChange={(e) => setFilter('search', e.target.value)}
            />
          </div>
          <select className="input-field" value={filters.classId} onChange={(e) => setFilter('classId', e.target.value)}>
            <option value="">Todas as turmas</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="input-field" value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
            {Object.entries(STUDENT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="input-field" value={filters.scoreLevel} onChange={(e) => setFilter('scoreLevel', e.target.value)}>
            <option value="">Todos os níveis</option>
            <option value="critico">Crítico</option>
            <option value="atencao">Atenção</option>
            <option value="normal">Normal</option>
          </select>
        </div>
      </div>

      {loading ? <Loading /> : students.length === 0 ? (
        <EmptyState icon={Users} title="Nenhum aluno encontrado" description="Ajuste os filtros ou cadastre novos alunos." />
      ) : (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-widest">
                <tr>
                  <th className="text-left py-3 px-5">Aluno</th>
                  <th className="text-left py-3 px-5">Matrícula</th>
                  <th className="text-left py-3 px-5">Turma</th>
                  <th className="text-left py-3 px-5 w-48">Conceito</th>
                  <th className="text-right py-3 px-5"></th>
                </tr>
              </thead>
              <tbody>
                {students.map((s, idx) => (
                  <tr key={s.id} className={`border-b border-slate-200 hover:bg-slate-50 transition ${idx % 2 === 0 ? '' : 'bg-slate-50'}`}>
                    <td className="py-3 px-5">
                      <Link to={`/students/${s.id}`} className="flex items-center gap-3 group">
                        <div className="w-9 h-9 bg-slate-100 group-hover:bg-solar-400 group-hover:text-slate-900 transition flex items-center justify-center font-sans font-semibold text-slate-900">
                          {s.name[0]}
                        </div>
                        <span className="font-medium text-slate-900 group-hover:text-amber-700">{s.name}</span>
                      </Link>
                    </td>
                    <td className="py-3 px-5 font-mono text-sm text-slate-600">{s.registration}</td>
                    <td className="py-3 px-5 text-sm text-slate-600">{s.class.name}</td>
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-3">
                        <ScoreBadge score={s.currentScore} size="md" thresholds={thresholds} />
                        <div className="flex-1 max-w-[100px]">
                          <ScoreBar score={s.currentScore} thresholds={thresholds} />
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-5 text-right">
                      <div className="inline-flex items-center gap-2">
                        {hasRole('ADMIN', 'COORD_DISCIPLINAR', 'COORD_PEDAGOGICO') && (
                          <button
                            type="button"
                            title="Editar aluno"
                            onClick={() => { setEditing(s); setModalOpen(true); }}
                            className="inline-flex p-2 text-slate-500 hover:text-amber-700 hover:bg-amber-50 rounded transition"
                          >
                            <Pencil size={16} />
                          </button>
                        )}
                        <Link to={`/students/${s.id}`} className="inline-flex p-2 text-slate-500 hover:text-amber-700">
                          <ChevronRight size={18} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <StudentFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        classes={classes}
        onSaved={() => { setModalOpen(false); fetchData(); }}
      />

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => { fetchData(); toast.success('Lista de alunos atualizada'); }}
      />
    </div>
  );
}

function StudentFormModal({ open, onClose, editing, classes, onSaved }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) setForm({ ...editing, birthDate: editing.birthDate?.split('T')[0] });
    else setForm({ classId: classes[0]?.id, status: 'ATIVO' });
  }, [editing, open, classes]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/students/${editing.id}`, form);
        toast.success('Aluno atualizado');
      } else {
        await api.post('/students', form);
        toast.success('Aluno cadastrado');
      }
      onSaved();
    } catch {} finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar Aluno' : 'Novo Aluno'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label-field">Matrícula *</label>
            <input className="input-field" value={form.registration || ''} onChange={(e) => setForm({ ...form, registration: e.target.value })} required />
          </div>
          <div>
            <label className="label-field">Turma *</label>
            <select className="input-field" value={form.classId || ''} onChange={(e) => setForm({ ...form, classId: e.target.value })} required>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="label-field">Nome completo *</label>
          <input className="input-field" value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label-field">Data de nascimento</label>
            <input type="date" className="input-field" value={form.birthDate || ''} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />
          </div>
          <div>
            <label className="label-field">Status</label>
            <select className="input-field" value={form.status || 'ATIVO'} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {Object.entries(STUDENT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <p className="label-field">Responsável</p>
          <div className="grid grid-cols-2 gap-4 mt-2">
            <input className="input-field" placeholder="Nome do responsável" value={form.guardianName || ''} onChange={(e) => setForm({ ...form, guardianName: e.target.value })} />
            <input className="input-field" placeholder="Parentesco" value={form.guardianRelation || ''} onChange={(e) => setForm({ ...form, guardianRelation: e.target.value })} />
            <input className="input-field" placeholder="Telefone" value={form.guardianPhone || ''} onChange={(e) => setForm({ ...form, guardianPhone: e.target.value })} />
            <input className="input-field" placeholder="E-mail" type="email" value={form.guardianEmail || ''} onChange={(e) => setForm({ ...form, guardianEmail: e.target.value })} />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </form>
    </Modal>
  );
}
