import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../lib/api.js';
import Modal from '../ui/Modal.jsx';
import StudentMultiPicker from './StudentMultiPicker.jsx';

export default function PraiseModal({ open, onClose, studentId, classId: fixedClassId, onSaved }) {
  const fixedStudent = Boolean(studentId);
  const [form, setForm] = useState({ type: 'COLETIVO', occurredAt: new Date().toISOString().slice(0, 16), reason: '', description: '' });
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [ranges, setRanges] = useState({});
  const [classId, setClassId] = useState(fixedClassId || '');
  const [selectedIds, setSelectedIds] = useState(studentId ? [studentId] : []);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [saving, setSaving] = useState(false);

  const rangeKey = form.type === 'COLETIVO' ? 'PRAISE_COLETIVO' : form.type === 'INDIVIDUAL' ? 'PRAISE_INDIVIDUAL' : 'PRAISE_MENCAO';
  const currentRange = ranges[rangeKey];

  useEffect(() => {
    if (!open) return;
    Promise.all([api.get('/classes'), api.get('/occurrences/ranges')]).then(([cls, rs]) => { setClasses(cls.data); setRanges(rs.data); });
    setClassId(fixedClassId || '');
    setSelectedIds(studentId ? [studentId] : []);
    setSelectedStudents([]);
    setForm({ type: fixedStudent ? 'INDIVIDUAL' : 'COLETIVO', occurredAt: new Date().toISOString().slice(0, 16), reason: '', description: '' });
  }, [open, studentId, fixedClassId]);

  useEffect(() => {
    if (!open || fixedStudent || !classId) { if (!classId) setStudents([]); return; }
    setLoadingStudents(true);
    api.get('/students', { params: { status: 'ATIVO', classId } }).then(({ data }) => setStudents(data)).finally(() => setLoadingStudents(false));
  }, [open, classId, fixedStudent]);

  function toggleStudent(student) { setSelectedIds(ids => ids.includes(student.id) ? ids.filter(id => id !== student.id) : [...ids, student.id]); }

  async function handleSubmit(e) {
    e.preventDefault();
    const ids = fixedStudent ? [studentId] : selectedIds;
    if (!ids.length) return toast.error('Selecione pelo menos um aluno.');
    setSaving(true);
    try {
      await api.post('/praises/bulk', { studentIds: ids, type: form.type, occurredAt: form.occurredAt, reason: form.reason, description: form.description, scoreImpact: form.scoreImpact ?? currentRange?.default });
      toast.success(ids.length > 1 ? `Elogio lançado para ${ids.length} alunos` : 'Elogio registrado');
      onSaved();
    } catch {} finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Novo Elogio" subtitle={!fixedStudent ? 'Selecione alunos de uma ou várias turmas' : 'Registro no perfil do aluno'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-5">
        {!fixedStudent && <StudentMultiPicker classes={classes} students={students} classId={classId} onClassChange={setClassId} selectedIds={selectedIds} onToggle={toggleStudent} onRemove={id => { setSelectedIds(ids => ids.filter(x => x !== id)); setSelectedStudents(items => items.filter(s => s.id !== id)); }} selectedStudents={selectedStudents} loading={loadingStudents} />}

        <div className="grid grid-cols-3 gap-3">
          {[['COLETIVO', 'Coletivo', 'Mesmo elogio para vários alunos'], ['INDIVIDUAL', 'Individual', 'Reconhecimento individual'], ['MENCAO_HONROSA', 'Menção Honrosa', 'Destaque especial']].map(([v, label, desc]) => (
            <button key={v} type="button" onClick={() => setForm({ ...form, type: v, scoreImpact: undefined })} className={`rounded-xl border-2 p-4 text-left transition ${form.type === v ? 'border-solar-400 bg-solar-400/10 text-slate-900' : 'border-slate-200 text-slate-600 hover:border-slate-200'}`}>
              <p className="text-sm font-semibold uppercase tracking-wider">{label}</p><p className="mt-1 text-xs text-slate-500">{desc}</p>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div><label className="label-field">Data</label><input type="datetime-local" className="input-field" value={form.occurredAt} onChange={e => setForm({ ...form, occurredAt: e.target.value })} required /></div>
          <div><label className="label-field">Bonificação ({currentRange?.min} a {currentRange?.max})</label><input type="number" step="0.01" className="input-field" value={form.scoreImpact ?? currentRange?.default ?? ''} onChange={e => setForm({ ...form, scoreImpact: parseFloat(e.target.value) })} min={currentRange?.min} max={currentRange?.max} /></div>
        </div>
        <div><label className="label-field">Motivo *</label><input className="input-field" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} required minLength={2} placeholder="Ex: Excelência em formatura" /></div>
        <div><label className="label-field">Descrição detalhada *</label><textarea className="input-field min-h-[100px]" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required minLength={5} /></div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200"><button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button><button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Registrando...' : selectedIds.length > 1 ? `Registrar para ${selectedIds.length} alunos` : 'Registrar Elogio'}</button></div>
      </form>
    </Modal>
  );
}
