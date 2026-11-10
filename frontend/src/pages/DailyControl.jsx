import { useEffect, useMemo, useState } from 'react';
import {
  Plus, ClipboardList, Printer, Download, Edit3, Trash2,
  ChevronDown, ChevronUp, UserX, Users, FileText,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { openPdf, downloadPdf } from '../lib/api.js';
import { Loading, EmptyState, PageHeader } from '../components/ui/Misc.jsx';
import Modal from '../components/ui/Modal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { formatDate } from '../lib/constants.js';

const todayInput = () => new Date().toISOString().slice(0, 10);
const dateInput = (value) => value ? new Date(value).toISOString().slice(0, 10) : '';

// Mesma sequência institucional usada na Condecoração.
const CLASS_SEQUENCE = [
  '33.01', '33.02', '23.01', '24.01',
  '13.01', '13.02', '92.01', '92.02',
  '82.01', '82.02', '72.01', '62.01',
];

function classSequenceIndex(name) {
  const value = String(name || '').trim().toUpperCase();
  const index = CLASS_SEQUENCE.findIndex((code) =>
    value === code || value.startsWith(`${code}/`) || value.startsWith(`${code} `) || value.startsWith(`${code}-`)
  );
  return index === -1 ? CLASS_SEQUENCE.length : index;
}

function sortClassesBySequence(rows = []) {
  return [...rows].sort((a, b) => {
    const ai = classSequenceIndex(a?.name);
    const bi = classSequenceIndex(b?.name);
    if (ai !== bi) return ai - bi;
    return String(a?.name || '').localeCompare(String(b?.name || ''), 'pt-BR', { numeric: true, sensitivity: 'base' });
  });
}

export default function DailyControl() {
  const { hasRole } = useAuth();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState(undefined); // undefined fechado; null novo; objeto editar
  const [deletingId, setDeletingId] = useState(null);

  const canUse = hasRole('ADMIN', 'COORD_DISCIPLINAR', 'COORD_PEDAGOGICO', 'MONITOR');
  const canDelete = hasRole('ADMIN', 'COORD_DISCIPLINAR', 'COORD_PEDAGOGICO');

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const { data } = await api.get('/daily-controls');
      setRecords(data);
    } finally { setLoading(false); }
  }

  async function handleDelete(record) {
    const label = `Controle Diário de ${formatDate(record.controlDate)}`;
    if (!window.confirm(`Excluir definitivamente o ${label}?\n\nOs registros de faltosos deste dia também serão removidos. Esta ação não pode ser desfeita.`)) return;
    setDeletingId(record.id);
    try {
      await api.delete(`/daily-controls/${record.id}`);
      toast.success(`${label} excluído`);
      fetchData();
    } finally { setDeletingId(null); }
  }

  return (
    <div className="max-w-7xl mx-auto fade-in">
      <PageHeader
        title="Controle Diário"
        subtitle="Efetivo, presentes, ausentes e alunos faltosos por dia"
        breadcrumb="Sistema · Gestão e controle"
        actions={canUse && (
          <button onClick={() => setEditor(null)} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Novo controle do dia
          </button>
        )}
      />

      <div className="mb-5 rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        Marque apenas os <strong className="text-slate-800">alunos faltosos</strong>. O sistema calcula automaticamente o efetivo,
        presentes e ausentes de cada turma. Os campos de chefe geral, subchefe e respectivas turmas são manuais e opcionais.
      </div>

      {loading ? <Loading /> : records.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Nenhum controle diário registrado"
          description="Crie o primeiro registro do dia selecionando os alunos faltosos."
        />
      ) : (
        <div className="space-y-4">
          {records.map((record) => (
            <div key={record.id} className="card p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-[280px] flex-1">
                  <div className="flex gap-2 flex-wrap mb-2">
                    <span className="badge bg-blue-50 text-blue-700 border-blue-200">{formatDate(record.controlDate)}</span>
                    <span className="badge bg-slate-100 text-slate-700 border-slate-200">{record.classes?.length || 0} turma(s)</span>
                  </div>
                  <h3 className="font-semibold text-slate-900">Controle Diário</h3>
                  <p className="text-xs text-slate-500 mt-1">Registrado por {record.createdBy?.name || '—'}</p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                    <Metric label="Efetivo" value={record.totals?.effective ?? 0} icon={Users} />
                    <Metric label="Presentes" value={record.totals?.present ?? 0} icon={ClipboardList} />
                    <Metric label="Ausentes" value={record.totals?.absent ?? record.absenceCount ?? 0} icon={UserX} danger />
                  </div>

                  {(record.chiefGeneral || record.deputyChief) && (
                    <div className="grid sm:grid-cols-2 gap-3 mt-4 text-xs text-slate-600">
                      <div><strong className="text-slate-800">Chefe geral:</strong> {record.chiefGeneral || '—'} {record.chiefGeneralClass ? `· ${record.chiefGeneralClass}` : ''}</div>
                      <div><strong className="text-slate-800">Subchefe:</strong> {record.deputyChief || '—'} {record.deputyChiefClass ? `· ${record.deputyChiefClass}` : ''}</div>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-200 flex flex-wrap gap-2">
                <button className="btn-secondary text-xs inline-flex items-center gap-1.5" onClick={() => openPdf(`/daily-controls/${record.id}/pdf`)}>
                  <Printer size={14} /> Abrir / imprimir
                </button>
                <button className="btn-secondary text-xs inline-flex items-center gap-1.5" onClick={() => openPdf(`/daily-controls/${record.id}/counting-pdf`)}>
                  <FileText size={14} /> Fichas de contagem
                </button>
                <button
                  className="btn-secondary text-xs inline-flex items-center gap-1.5"
                  onClick={() => downloadPdf(`/daily-controls/${record.id}/pdf`, `CONTROLE-DIARIO-${dateInput(record.controlDate)}.pdf`)}
                >
                  <Download size={14} /> Baixar PDF
                </button>
                {canUse && (
                  <button className="btn-secondary text-xs inline-flex items-center gap-1.5" onClick={() => setEditor(record)}>
                    <Edit3 size={14} /> Editar
                  </button>
                )}
                {canDelete && (
                  <button
                    className="text-xs inline-flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50"
                    onClick={() => handleDelete(record)}
                    disabled={deletingId === record.id}
                  >
                    <Trash2 size={14} /> {deletingId === record.id ? 'Excluindo...' : 'Excluir'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <DailyControlModal
        open={editor !== undefined}
        record={editor || null}
        onClose={() => setEditor(undefined)}
        onSaved={() => { setEditor(undefined); fetchData(); }}
      />
    </div>
  );
}

function Metric({ label, value, icon: Icon, danger = false }) {
  return (
    <div className={`border p-3 flex items-center gap-3 ${danger ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-slate-50'}`}>
      <Icon size={18} className={danger ? 'text-red-600' : 'text-slate-500'} />
      <div>
        <span className="block text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
        <strong className={danger ? 'text-red-700' : 'text-slate-900'}>{value}</strong>
      </div>
    </div>
  );
}

function DailyControlModal({ open, record, onClose, onSaved }) {
  const [classes, setClasses] = useState([]);
  const [form, setForm] = useState({});
  const [expanded, setExpanded] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    loadData();
  }, [open, record?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    setLoading(true);
    setSearch('');
    setExpanded(new Set());
    try {
      const setupPromise = api.get('/daily-controls/setup');
      if (record?.id) {
        const [setup, detail] = await Promise.all([setupPromise, api.get(`/daily-controls/${record.id}`)]);
        setClasses(sortClassesBySequence(setup.data));
        const d = detail.data;
        setForm({
          controlDate: dateInput(d.controlDate),
          chiefGeneral: d.chiefGeneral || '',
          chiefGeneralClass: d.chiefGeneralClass || '',
          deputyChief: d.deputyChief || '',
          deputyChiefClass: d.deputyChiefClass || '',
          observations: d.observations || '',
          absentStudentIds: (d.absences || []).map((a) => a.studentId).filter(Boolean),
        });
      } else {
        const setup = await setupPromise;
        setClasses(sortClassesBySequence(setup.data));
        setForm({
          controlDate: todayInput(),
          chiefGeneral: '', chiefGeneralClass: '',
          deputyChief: '', deputyChiefClass: '',
          observations: '', absentStudentIds: [],
        });
      }
    } finally { setLoading(false); }
  }

  const absentSet = useMemo(() => new Set(form.absentStudentIds || []), [form.absentStudentIds]);

  const summary = useMemo(() => sortClassesBySequence(classes).map((c) => {
    const effective = c.students?.length || 0;
    const absent = (c.students || []).filter((s) => absentSet.has(s.id)).length;
    return { ...c, effective, absent, present: Math.max(0, effective - absent) };
  }), [classes, absentSet]);

  const totals = useMemo(() => summary.reduce((a, c) => ({
    effective: a.effective + c.effective,
    present: a.present + c.present,
    absent: a.absent + c.absent,
  }), { effective: 0, present: 0, absent: 0 }), [summary]);

  function toggleStudent(id) {
    setForm((f) => {
      const next = new Set(f.absentStudentIds || []);
      if (next.has(id)) next.delete(id); else next.add(id);
      return { ...f, absentStudentIds: [...next] };
    });
  }

  function toggleClass(id) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function clearClass(classId) {
    const ids = new Set((classes.find((c) => c.id === classId)?.students || []).map((s) => s.id));
    setForm((f) => ({ ...f, absentStudentIds: (f.absentStudentIds || []).filter((id) => !ids.has(id)) }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.controlDate) return toast.error('Informe a data do Controle Diário.');
    setSaving(true);
    try {
      const payload = {
        ...form,
        chiefGeneral: form.chiefGeneral?.trim() || null,
        chiefGeneralClass: form.chiefGeneralClass?.trim() || null,
        deputyChief: form.deputyChief?.trim() || null,
        deputyChiefClass: form.deputyChiefClass?.trim() || null,
        observations: form.observations?.trim() || null,
      };
      if (record?.id) await api.put(`/daily-controls/${record.id}`, payload);
      else await api.post('/daily-controls', payload);
      toast.success(record?.id ? 'Controle Diário atualizado' : 'Controle Diário registrado');
      onSaved();
    } catch (err) {
      if (err.response?.status !== 409) toast.error(err.response?.data?.error || 'Não foi possível salvar o Controle Diário.');
    } finally { setSaving(false); }
  }

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={record ? 'Editar Controle Diário' : 'Registrar Controle Diário'}
      subtitle="Selecione somente os estudantes ausentes. Os totais são calculados automaticamente."
      size="xl"
    >
      {loading ? <Loading /> : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Data *">
              <input type="date" className="input" required value={form.controlDate || ''} onChange={(e) => setForm((f) => ({ ...f, controlDate: e.target.value }))} />
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Metric label="Efetivo" value={totals.effective} icon={Users} />
              <Metric label="Presentes" value={totals.present} icon={ClipboardList} />
              <Metric label="Ausentes" value={totals.absent} icon={UserX} danger />
            </div>
          </div>

          <div className="border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3">Campos manuais e opcionais</p>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Chefe geral">
                <input className="input" placeholder="Nome do chefe geral" value={form.chiefGeneral || ''} onChange={(e) => setForm((f) => ({ ...f, chiefGeneral: e.target.value }))} />
              </Field>
              <Field label="Turma do chefe geral">
                <input className="input" placeholder="Ex.: 33.01" value={form.chiefGeneralClass || ''} onChange={(e) => setForm((f) => ({ ...f, chiefGeneralClass: e.target.value }))} />
              </Field>
              <Field label="Subchefe">
                <input className="input" placeholder="Nome do subchefe" value={form.deputyChief || ''} onChange={(e) => setForm((f) => ({ ...f, deputyChief: e.target.value }))} />
              </Field>
              <Field label="Turma do subchefe">
                <input className="input" placeholder="Ex.: 23.01" value={form.deputyChiefClass || ''} onChange={(e) => setForm((f) => ({ ...f, deputyChiefClass: e.target.value }))} />
              </Field>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <div>
                <h3 className="font-semibold text-slate-900">Alunos faltosos</h3>
                <p className="text-xs text-slate-500 mt-0.5">Abra uma turma e marque os estudantes que faltaram.</p>
              </div>
              <input
                className="input max-w-xs"
                placeholder="Buscar aluno..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="border border-slate-200 overflow-hidden">
              <div className="grid grid-cols-[1fr_90px_90px_90px_44px] bg-slate-100 px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                <span>Turma</span><span className="text-center">Efetivo</span><span className="text-center">Presentes</span><span className="text-center">Ausentes</span><span />
              </div>
              {summary.map((cls) => {
                const isOpen = expanded.has(cls.id) || !!search.trim();
                const students = (cls.students || []).filter((s) => !search.trim() || s.name.toLowerCase().includes(search.toLowerCase()) || String(s.callNumber || '').includes(search));
                return (
                  <div key={cls.id} className="border-t border-slate-200 first:border-t-0">
                    <button type="button" onClick={() => toggleClass(cls.id)} className="w-full grid grid-cols-[1fr_90px_90px_90px_44px] items-center px-3 py-3 text-sm hover:bg-slate-50">
                      <span className="text-left font-medium text-slate-900">{cls.name}</span>
                      <span className="text-center">{cls.effective}</span>
                      <span className="text-center text-emerald-700 font-semibold">{cls.present}</span>
                      <span className={`text-center font-semibold ${cls.absent ? 'text-red-700' : 'text-slate-500'}`}>{cls.absent}</span>
                      <span className="flex justify-end">{isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
                    </button>
                    {isOpen && (
                      <div className="bg-slate-50 border-t border-slate-200 p-3">
                        <div className="flex justify-between gap-3 mb-2">
                          <span className="text-xs text-slate-500">{students.length} aluno(s) exibido(s)</span>
                          {cls.absent > 0 && <button type="button" className="text-xs text-red-700 hover:underline" onClick={() => clearClass(cls.id)}>Limpar faltosos da turma</button>}
                        </div>
                        {students.length === 0 ? (
                          <p className="text-sm text-slate-500 py-2">Nenhum aluno encontrado.</p>
                        ) : (
                          <div className="grid md:grid-cols-2 gap-2">
                            {students.map((student) => {
                              const checked = absentSet.has(student.id);
                              return (
                                <label key={student.id} className={`flex items-center gap-3 p-3 border cursor-pointer transition ${checked ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                                  <input type="checkbox" checked={checked} onChange={() => toggleStudent(student.id)} />
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium text-slate-900 truncate">{student.callNumber != null ? `${student.callNumber}. ` : ''}{student.name}</div>
                                    <div className="text-[11px] text-slate-500">Matrícula: {student.registration || '—'}</div>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <Field label="Observações">
            <textarea
              className="input min-h-[110px] resize-y"
              placeholder="Campo opcional para observações gerais do dia."
              value={form.observations || ''}
              onChange={(e) => setForm((f) => ({ ...f, observations: e.target.value }))}
            />
          </Field>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Salvando...' : (record ? 'Salvar alterações' : 'Registrar dia')}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-600 mb-1.5">{label}</span>
      {children}
    </label>
  );
}
