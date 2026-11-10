import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../lib/api.js';
import Modal from '../ui/Modal.jsx';
import { TMD_LABELS } from '../../lib/constants.js';
import ArticleRecommender from './ArticleRecommender.jsx';
import StudentMultiPicker from './StudentMultiPicker.jsx';

const NATUREZA_TO_TMD = { LEVE: 'LEVE', MEDIA: 'MEDIA', GRAVE: 'GRAVE', GRAVISSIMO: 'GRAVISSIMO' };
const ALLOWED_CATEGORIES = ['Natureza Grave', 'Natureza Gravíssima/Eliminatória', 'Natureza Leve', 'Natureza Média'];
const CATEGORY_LEVEL = {
  'Natureza Leve': 'LEVE',
  'Natureza Média': 'MEDIA',
  'Natureza Grave': 'GRAVE',
  'Natureza Gravíssima/Eliminatória': 'GRAVISSIMO',
};

const newOccurrenceForm = () => ({
  type: 'ANOTACAO',
  tmdLevel: 'LEVE',
  occurredAt: new Date().toISOString().slice(0, 16),
  description: '',
  location: '',
  notifyGuardian: false,
  artigo: '',
  inciso: '',
});

export default function OccurrenceModal({ open, onClose, studentId, onSaved }) {
  const fixedStudent = Boolean(studentId);
  const [form, setForm] = useState(() => newOccurrenceForm());
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [categories, setCategories] = useState([]);
  const [ranges, setRanges] = useState({});
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [classId, setClassId] = useState('');
  const [selectedIds, setSelectedIds] = useState(studentId ? [studentId] : []);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [saving, setSaving] = useState(false);

  const visibleCategories = useMemo(() => categories.filter(c => ALLOWED_CATEGORIES.includes(c.name)), [categories]);
  const currentRange = form.type === 'TMD' ? ranges[`TMD_${form.tmdLevel}`] : form.type === 'SUSPENSAO' ? { default: -1, min: -2, max: -0.5 } : { default: 0, min: 0, max: 0 };

  useEffect(() => {
    if (!open) return;
    Promise.all([
      api.get('/categories'),
      api.get('/occurrences/ranges'),
      api.get('/classes'),
    ]).then(([cats, rs, cls]) => {
      setCategories(cats.data);
      setRanges(rs.data);
      setClasses(cls.data);
    });
    setSelectedIds(studentId ? [studentId] : []);
    setSelectedStudents([]);
    setSelectedArticle(null);
    setClassId('');
    setForm({ ...newOccurrenceForm(), studentId, categoryId: undefined, suspensionDays: undefined, scoreImpact: undefined });
  }, [open, studentId]);

  useEffect(() => {
    if (!open || fixedStudent || !classId) { if (!classId) setStudents([]); return; }
    setLoadingStudents(true);
    api.get('/students', { params: { status: 'ATIVO', classId } })
      .then(({ data }) => setStudents(data))
      .finally(() => setLoadingStudents(false));
  }, [open, classId, fixedStudent]);

  function changeType(type) {
    if (type === 'SUSPENSAO') setSelectedArticle(null);
    setForm(f => ({
      ...f,
      type,
      artigo: type === 'SUSPENSAO' ? '' : f.artigo,
      categoryId: type === 'SUSPENSAO' ? undefined : f.categoryId,
      tmdLevel: type === 'TMD' ? (f.tmdLevel || 'LEVE') : f.tmdLevel,
      suspensionDays: type === 'SUSPENSAO' ? f.suspensionDays : undefined,
      scoreImpact: undefined,
    }));
  }

  function changeCategory(id) {
    const cat = visibleCategories.find(c => c.id === id);
    setForm(f => ({ ...f, categoryId: id, ...(form.type === 'TMD' && cat?.name && CATEGORY_LEVEL[cat.name] ? { tmdLevel: CATEGORY_LEVEL[cat.name], scoreImpact: undefined } : {}) }));
  }

  function handleArticleSelect(rec) {
    setSelectedArticle(rec);
    if (!rec) return setForm(f => ({ ...f, artigo: '' }));

    const newLevel = NATUREZA_TO_TMD[rec.natureza] || form.tmdLevel;
    const categoryId = visibleCategories.find(c => CATEGORY_LEVEL[c.name] === newLevel)?.id;

    // Selecionar um artigo apenas enquadra a ocorrência no regimento.
    // Uma ANOTAÇÃO continua sendo ANOTAÇÃO; o TMD é gerado depois,
    // a partir das anotações escolhidas na ficha do aluno.
    setForm(f => ({
      ...f,
      artigo: `Art. ${rec.artigo}, inciso ${rec.inciso}`,
      tmdLevel: newLevel,
      categoryId: categoryId || f.categoryId,
      ...(f.type === 'TMD' ? { scoreImpact: undefined } : {}),
    }));
  }

  function toggleStudent(student) {
    setSelectedIds(ids => ids.includes(student.id) ? ids.filter(id => id !== student.id) : [...ids, student.id]);
    setSelectedStudents(items => items.some(s => s.id === student.id) ? items.filter(s => s.id !== student.id) : [...items, student]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const ids = fixedStudent ? [studentId] : selectedIds;
    if (!ids.length) return toast.error('Selecione pelo menos um aluno.');
    if ((form.type === 'ANOTACAO' || form.type === 'TMD') && !form.categoryId) return toast.error('Selecione uma das quatro categorias permitidas.');
    if (form.type === 'SUSPENSAO' && (!form.suspensionDays || Number(form.suspensionDays) < 1 || Number(form.suspensionDays) > 5)) return toast.error('A suspensão deve ter de 1 a 5 dias.');
    setSaving(true);
    try {
      await api.post('/occurrences/bulk', {
        studentIds: ids,
        type: form.type,
        tmdLevel: form.type === 'TMD' ? form.tmdLevel : null,
        suspensionDays: form.type === 'SUSPENSAO' ? Number(form.suspensionDays) : null,
        categoryId: form.type === 'SUSPENSAO' ? null : form.categoryId,
        occurredAt: form.occurredAt,
        description: selectedArticle ? `[Art. ${selectedArticle.artigo}, inc. ${selectedArticle.inciso}] ${form.description}` : form.description,
        location: form.location,
        notifyGuardian: form.notifyGuardian,
        scoreImpact: form.type === 'ANOTACAO' ? 0 : (form.scoreImpact ?? currentRange?.default ?? 0),
      });
      toast.success(ids.length > 1 ? `Ocorrência lançada para ${ids.length} alunos` : 'Ocorrência registrada');
      onSaved();
    } catch {} finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nova Ocorrência Disciplinar" subtitle={!fixedStudent ? 'Lançamento individual ou coletivo' : 'Registro no perfil do aluno'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-5">
        {!fixedStudent && <StudentMultiPicker classes={classes} students={students} classId={classId} onClassChange={setClassId} selectedIds={selectedIds} onToggle={toggleStudent} onRemove={id => { setSelectedIds(ids => ids.filter(x => x !== id)); setSelectedStudents(items => items.filter(s => s.id !== id)); }} selectedStudents={selectedStudents} loading={loadingStudents} />}

        <div className="grid grid-cols-3 gap-3">
          {[['ANOTACAO', 'Anotação', 'Registro disciplinar'], ['TMD', 'TMD', 'Medida com impacto na nota'], ['SUSPENSAO', 'Suspensão', 'De 1 a 5 dias']].map(([v, label, desc]) => (
            <button key={v} type="button" onClick={() => changeType(v)} className={`rounded-xl border-2 p-4 text-left transition ${form.type === v ? 'border-solar-400 bg-solar-400/10 text-slate-900' : 'border-slate-200 text-slate-600 hover:border-slate-200'}`}>
              <p className="text-sm font-semibold uppercase tracking-wider">{label}</p><p className="mt-1 text-xs text-slate-500">{desc}</p>
            </button>
          ))}
        </div>

        {form.type === 'TMD' && <div className="grid grid-cols-2 gap-4">
          <div><label className="label-field">Nível do TMD</label><select className="input-field" value={form.tmdLevel} onChange={e => setForm({ ...form, tmdLevel: e.target.value, scoreImpact: undefined })}>{Object.entries(TMD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div><label className="label-field">Impacto na nota ({currentRange?.min} a {currentRange?.max})</label><input type="number" step="0.01" className="input-field" value={form.scoreImpact ?? currentRange?.default ?? ''} onChange={e => setForm({ ...form, scoreImpact: parseFloat(e.target.value) })} min={currentRange?.min} max={currentRange?.max} /></div>
        </div>}

        {form.type === 'SUSPENSAO' && <div className="grid grid-cols-2 gap-4">
          <div><label className="label-field">Dias de suspensão <span className="text-amber-700">(1–5)</span></label><input type="number" className="input-field" value={form.suspensionDays || ''} onChange={e => setForm({ ...form, suspensionDays: e.target.value })} min="1" max="5" required /></div>
          <div><label className="label-field">Impacto na nota</label><input type="number" step="0.01" className="input-field" value={form.scoreImpact ?? -1} onChange={e => setForm({ ...form, scoreImpact: parseFloat(e.target.value) })} /></div>
        </div>}

        {form.type !== 'SUSPENSAO' && <div>
          <label className="label-field">Categoria / Natureza *</label>
          <select className="input-field" value={form.categoryId || ''} onChange={e => changeCategory(e.target.value)} required>
            <option value="">Selecione a natureza...</option>
            {visibleCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <p className="mt-1 text-[11px] text-slate-500">Disponíveis somente: Grave, Gravíssima/Eliminatória, Leve e Média.</p>
        </div>}

        <div className="grid grid-cols-2 gap-4">
          <div><label className="label-field">Data e hora</label><input type="datetime-local" className="input-field" value={form.occurredAt} onChange={e => setForm({ ...form, occurredAt: e.target.value })} required /></div>
          <div><label className="label-field">Local (opcional)</label><input className="input-field" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Ex: Sala 7, pátio" /></div>
        </div>

        <div><label className="label-field">Descrição detalhada *</label><textarea className="input-field min-h-[120px]" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required minLength={5} placeholder="Descreva os fatos com clareza..." /></div>
        {form.type !== 'SUSPENSAO' && <ArticleRecommender descricao={form.description} onSelect={handleArticleSelect} />}
        {selectedArticle && form.type !== 'SUSPENSAO' && <div><label className="label-field">Fundamentação legal selecionada</label><input className="input-field font-mono text-sm bg-slate-50" value={form.artigo} readOnly /></div>}
        <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={form.notifyGuardian} onChange={e => setForm({ ...form, notifyGuardian: e.target.checked })} />Notificar responsável por e-mail</label>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200"><button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button><button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Registrando...' : selectedIds.length > 1 ? `Registrar para ${selectedIds.length} alunos` : 'Registrar Ocorrência'}</button></div>
      </form>
    </Modal>
  );
}
