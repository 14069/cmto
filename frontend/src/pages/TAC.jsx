import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus, ScrollText, Printer, Download, FileText, Files, Edit3, Trash2,
  CheckCircle2, Link2, Sparkles, ClipboardList,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { openPdf, downloadPdf } from '../lib/api.js';
import { Loading, EmptyState, PageHeader } from '../components/ui/Misc.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import Modal from '../components/ui/Modal.jsx';
import { formatDate, TMD_LABELS } from '../lib/constants.js';

const TAC_STATUS = {
  ATIVO: { label: 'Em andamento', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  CUMPRIDO: { label: 'Cumprido', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  DESCUMPRIDO: { label: 'Descumprido', color: 'bg-red-50 text-red-700 border-red-200' },
  CANCELADO: { label: 'Cancelado', color: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const NATURES = ['Leve', 'Média', 'Grave', 'Gravíssima'];
const LEVEL_NATURE = { LEVE: 'Leve', MEDIA: 'Média', GRAVE: 'Grave', GRAVISSIMO: 'Gravíssima' };
const LEVEL_PRIORITY = { LEVE: 1, MEDIA: 2, GRAVE: 3, GRAVISSIMO: 4 };
const COORD_DEFAULT = '1° SGT RR VALDINÉA PEREIRA';

const dateInput = (value) => value ? new Date(value).toISOString().slice(0, 10) : '';
const idsFromString = (value) => String(value || '').split(',').map((x) => x.trim()).filter(Boolean);
const fmtScore = (value) => Number.isFinite(Number(value)) ? Number(value).toFixed(1).replace('.', ',') : '—';

function highestNature(tmds) {
  const level = tmds.reduce((best, item) => {
    return (LEVEL_PRIORITY[item.tmdLevel] || 0) > (LEVEL_PRIORITY[best] || 0) ? item.tmdLevel : best;
  }, null);
  return LEVEL_NATURE[level] || '';
}

export default function TAC() {
  const { hasRole } = useAuth();
  const [tacs, setTacs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editorTac, setEditorTac] = useState(undefined); // undefined fechado; null novo; objeto editar
  const [closeModal, setCloseModal] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const { data } = await api.get('/tacs');
      setTacs(data);
    } finally { setLoading(false); }
  }

  const canManage = hasRole('ADMIN', 'COORD_DISCIPLINAR', 'COORD_PEDAGOGICO');

  async function handleDelete(tac) {
    const label = tac.tacNumber ? `TAC Nº ${tac.tacNumber}` : 'este TAC';
    const confirmed = window.confirm(
      `Excluir definitivamente o ${label} de ${tac.student?.name || 'este estudante'}?\n\nEsta ação não pode ser desfeita.`
    );
    if (!confirmed) return;

    setDeletingId(tac.id);
    try {
      await api.delete(`/tacs/${tac.id}`);
      toast.success(`${label} excluído`);
      await fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Não foi possível excluir o TAC.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="max-w-7xl mx-auto fade-in">
      <PageHeader
        title="Termos de Ajuste de Conduta"
        subtitle={`${tacs.length} TAC(s) registrado(s)`}
        breadcrumb="Sistema · TAC"
        actions={canManage && (
          <button onClick={() => setEditorTac(null)} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Confeccionar TAC
          </button>
        )}
      />

      <div className="mb-5 rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <strong className="text-slate-800">Fluxo do TAC:</strong> selecione o aluno, informe a numeração,
        vincule os TMDs que fundamentam o termo e revise o texto dos fatos. Depois, o sistema permite
        imprimir o TAC oficial, o anexo disciplinar, o conjunto completo ou a ficha do aluno.
      </div>

      {loading ? <Loading /> : tacs.length === 0 ? (
        <EmptyState icon={ScrollText} title="Nenhum TAC registrado" description="Os termos serão exibidos aqui após a confecção." />
      ) : (
        <div className="space-y-4">
          {tacs.map((t) => {
            const linkedCount = idsFromString(t.linkedTmdIds).length;
            return (
              <div key={t.id} className="card p-5">
                <div className="flex items-start justify-between flex-wrap gap-4">
                  <div className="flex-1 min-w-[280px]">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className={`badge ${TAC_STATUS[t.status]?.color || TAC_STATUS.ATIVO.color}`}>
                        {TAC_STATUS[t.status]?.label || t.status}
                      </span>
                      <span className="badge bg-slate-100 text-slate-700 border-slate-200">
                        TAC Nº {t.tacNumber || 'sem numeração'}
                      </span>
                      {t.disciplinaryNature && (
                        <span className="badge bg-red-50 text-red-700 border-red-200">Natureza {t.disciplinaryNature}</span>
                      )}
                    </div>

                    <Link to={`/students/${t.student.id}`} className="font-semibold text-slate-900 hover:text-amber-700">
                      {t.student.name}
                    </Link>
                    <span className="text-xs text-slate-500 ml-2">{t.student.class.name}</span>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-xs">
                      <Info label="Nota no TAC" value={t.scoreAtCreation != null ? fmtScore(t.scoreAtCreation) : '—'} />
                      <Info label="Conceito" value={t.conceptAtCreation || '—'} />
                      <Info label="TMDs vinculados" value={String(linkedCount)} />
                      <Info label="Acompanhamento" value={`${formatDate(t.startDate)} a ${formatDate(t.endDate)}`} />
                    </div>

                    <p className="text-sm text-slate-600 mt-4 line-clamp-3">{t.description}</p>
                    <p className="text-xs text-slate-500 mt-2">Confeccionado por {t.createdBy?.name || '—'}</p>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-200 flex flex-wrap gap-2">
                  <button className="btn-secondary text-xs inline-flex items-center gap-1.5" onClick={() => openPdf(`/tacs/${t.id}/pdf`)}>
                    <Printer size={14} /> Abrir / imprimir TAC
                  </button>
                  <button className="btn-secondary text-xs inline-flex items-center gap-1.5" onClick={() => openPdf(`/tacs/${t.id}/package`)}>
                    <Files size={14} /> TAC + anexo
                  </button>
                  <button className="btn-secondary text-xs inline-flex items-center gap-1.5" onClick={() => openPdf(`/tacs/${t.id}/annex`)}>
                    <FileText size={14} /> Anexo disciplinar
                  </button>
                  <button className="btn-secondary text-xs inline-flex items-center gap-1.5" onClick={() => openPdf(`/reports/student/${t.student.id}`)}>
                    <ClipboardList size={14} /> Ficha do aluno
                  </button>
                  <button
                    className="btn-secondary text-xs inline-flex items-center gap-1.5"
                    onClick={() => downloadPdf(`/tacs/${t.id}/pdf`, `TAC-${String(t.tacNumber || t.id).replace(/[^a-zA-Z0-9_-]+/g, '-')}.pdf`)}
                  >
                    <Download size={14} /> Baixar TAC
                  </button>

                  {canManage && (
                    <button className="btn-secondary text-xs inline-flex items-center gap-1.5" onClick={() => setEditorTac(t)}>
                      <Edit3 size={14} /> Editar
                    </button>
                  )}
                  {canManage && (
                    <button
                      className="text-xs inline-flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50"
                      onClick={() => handleDelete(t)}
                      disabled={deletingId === t.id}
                    >
                      <Trash2 size={14} /> {deletingId === t.id ? 'Excluindo...' : 'Excluir'}
                    </button>
                  )}
                  {t.status === 'ATIVO' && canManage && (
                    <button onClick={() => setCloseModal(t)} className="btn-secondary text-xs ml-auto inline-flex items-center gap-1.5">
                      <CheckCircle2 size={14} /> Encerrar TAC
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <TACModal
        open={editorTac !== undefined}
        tac={editorTac || null}
        onClose={() => setEditorTac(undefined)}
        onSaved={() => { setEditorTac(undefined); fetchData(); }}
      />
      <CloseTACModal tac={closeModal} onClose={() => setCloseModal(null)} onSaved={() => { setCloseModal(null); fetchData(); }} />
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="border border-slate-200 bg-slate-50 p-2.5">
      <span className="block uppercase tracking-wider text-[10px] text-slate-500">{label}</span>
      <strong className="block mt-1 text-slate-900">{value}</strong>
    </div>
  );
}

function TACModal({ open, tac, onClose, onSaved }) {
  const { user } = useAuth();
  const [form, setForm] = useState({});
  const [students, setStudents] = useState([]);
  const [studentDetail, setStudentDetail] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loadingStudent, setLoadingStudent] = useState(false);

  const isEdit = !!tac;

  useEffect(() => {
    if (!open) return;

    api.get('/students', { params: { status: 'ATIVO' } }).then(({ data }) => setStudents(data));

    const today = new Date().toISOString().slice(0, 10);
    if (tac) {
      setForm({
        studentId: tac.studentId,
        tacNumber: tac.tacNumber || '',
        description: tac.description || '',
        goals: tac.goals || '',
        startDate: dateInput(tac.startDate),
        endDate: dateInput(tac.endDate),
        scoreAtCreation: tac.scoreAtCreation ?? '',
        conceptAtCreation: tac.conceptAtCreation || '',
        disciplinaryNature: tac.disciplinaryNature || '',
        linkedTmdIds: idsFromString(tac.linkedTmdIds),
        coordinatorName: tac.coordinatorName || COORD_DEFAULT,
        responsibleName: tac.responsibleName || '',
        monitorName: tac.monitorName || '',
      });
      loadStudent(tac.studentId, false);
    } else {
      setStudentDetail(null);
      setForm({
        studentId: '', tacNumber: '', description: '', goals: '',
        startDate: today, endDate: '', scoreAtCreation: '', conceptAtCreation: '',
        disciplinaryNature: '', linkedTmdIds: [], coordinatorName: COORD_DEFAULT,
        responsibleName: '', monitorName: user?.role === 'MONITOR' ? user.name : '',
      });
    }
  }, [open, tac]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadStudent(studentId, applyDefaults = true) {
    if (!studentId) { setStudentDetail(null); return; }
    setLoadingStudent(true);
    try {
      const { data } = await api.get(`/students/${studentId}`);
      setStudentDetail(data);
      if (applyDefaults) {
        setForm((f) => ({
          ...f,
          studentId,
          scoreAtCreation: data.currentScore,
          conceptAtCreation: data.currentScore < 6.5 ? 'Regular' : (f.conceptAtCreation || ''),
          responsibleName: data.guardianName || f.responsibleName || '',
          linkedTmdIds: [],
          disciplinaryNature: '',
          description: '',
        }));
      }
    } finally { setLoadingStudent(false); }
  }

  const tmds = useMemo(() => {
    return (studentDetail?.occurrences || [])
      .filter((o) => o.type === 'TMD' && !['REJEITADO', 'RASCUNHO'].includes(o.status))
      .sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt));
  }, [studentDetail]);

  const selectedTmds = useMemo(() => {
    const ids = new Set(form.linkedTmdIds || []);
    return tmds.filter((t) => ids.has(t.id));
  }, [tmds, form.linkedTmdIds]);

  function toggleTmd(id) {
    setForm((f) => {
      const current = new Set(f.linkedTmdIds || []);
      if (current.has(id)) current.delete(id); else current.add(id);
      const ids = [...current];
      const selected = tmds.filter((t) => current.has(t.id));
      return {
        ...f,
        linkedTmdIds: ids,
        disciplinaryNature: selected.length ? highestNature(selected) : f.disciplinaryNature,
      };
    });
  }

  function selectAllTmds() {
    const ids = tmds.map((t) => t.id);
    setForm((f) => ({ ...f, linkedTmdIds: ids, disciplinaryNature: highestNature(tmds) || f.disciplinaryNature }));
  }

  function generateFacts() {
    if (!studentDetail) return;
    const count = selectedTmds.length;
    const words = ['ZERO', 'UM', 'DOIS', 'TRÊS', 'QUATRO', 'CINCO', 'SEIS', 'SETE', 'OITO', 'NOVE', 'DEZ'];
    const numberText = words[count] || String(count);
    const tmdText = selectedTmds.length
      ? selectedTmds.map((t) => `TMD ${t.tmdNumber || 's/n'}`).join('; ')
      : 'sem TMD específico vinculado, por determinação da gestão';
    const score = fmtScore(form.scoreAtCreation);
    const concept = form.conceptAtCreation || 'Regular';

    const text = `O(A) estudante se envolveu em diversas ocorrências durante o ano, apresentando comportamento incompatível com os padrões disciplinares do CMTO e dificuldades em cumprir as normas estabelecidas pelo Regimento Padrão dos Colégios Militares do Estado do Tocantins. Em razão da reiteração das condutas, foi submetido(a) a ${String(count).padStart(2, '0')} (${numberText}) medida(s) disciplinar(es), sendo elas: ${tmdText}, encontrando-se com a nota disciplinar ${score}, com conceito disciplinar ${concept.toLowerCase()}. O(A) estudante foi cientificado(a) sobre sua situação disciplinar e, mesmo assim, permaneceu apresentando registros de descumprimento das normas que regem o colégio.`;
    setForm((f) => ({ ...f, description: text }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const score = Number(String(form.scoreAtCreation).replace(',', '.'));
    if (!Number.isFinite(score) || score < 0 || score > 10) {
      toast.error('Informe uma nota disciplinar válida entre 0 e 10.');
      return;
    }
    if (!form.tacNumber?.trim()) {
      toast.error('Informe o número do TAC.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        tacNumber: form.tacNumber.trim(),
        scoreAtCreation: score,
        linkedTmdIds: form.linkedTmdIds || [],
      };
      if (isEdit) await api.put(`/tacs/${tac.id}`, payload);
      else await api.post('/tacs', payload);
      toast.success(isEdit ? 'TAC atualizado' : `TAC Nº ${payload.tacNumber} confeccionado`);
      onSaved();
    } catch { /* interceptor já exibe erro */ } finally { setSaving(false); }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Editar TAC Nº ${tac.tacNumber || ''}` : 'Confeccionar Termo de Ajuste de Conduta'}
      subtitle="Estrutura baseada no documento oficial da Coordenação Disciplinar"
      size="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <section>
          <SectionTitle number="1" title="Identificação do termo" />
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label-field">Aluno *</label>
              <select
                className="input-field"
                value={form.studentId || ''}
                onChange={(e) => loadStudent(e.target.value, true)}
                required
                disabled={isEdit}
              >
                <option value="">Selecione...</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.name} - {s.class.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label-field">Número do TAC *</label>
              <input className="input-field" value={form.tacNumber || ''} onChange={(e) => setForm({ ...form, tacNumber: e.target.value })} required placeholder="Ex.: 007/2026" maxLength={30} />
            </div>
            <div>
              <label className="label-field">Data de confecção *</label>
              <input type="date" className="input-field" value={form.startDate || ''} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required />
            </div>
            <div>
              <label className="label-field">Acompanhamento até *</label>
              <input type="date" className="input-field" value={form.endDate || ''} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required />
              <span className="text-[11px] text-slate-500 mt-1 block">Controle interno do sistema; não altera o fundamento jurídico do documento.</span>
            </div>
          </div>
        </section>

        {studentDetail && (
          <section>
            <SectionTitle number="2" title="Situação disciplinar e TMDs que fundamentam o TAC" />
            <div className="grid md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="label-field">Nota disciplinar no TAC *</label>
                <input
                  type="text" inputMode="decimal" className="input-field"
                  value={form.scoreAtCreation ?? ''}
                  onChange={(e) => setForm({ ...form, scoreAtCreation: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="label-field">Conceito disciplinar</label>
                <input className="input-field" value={form.conceptAtCreation || ''} onChange={(e) => setForm({ ...form, conceptAtCreation: e.target.value })} placeholder="Ex.: Regular" />
              </div>
              <div>
                <label className="label-field">Natureza predominante</label>
                <select className="input-field" value={form.disciplinaryNature || ''} onChange={(e) => setForm({ ...form, disciplinaryNature: e.target.value })}>
                  <option value="">Selecione...</option>
                  {NATURES.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>

            <div className="border border-slate-200">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <strong className="text-sm text-slate-800">TMDs do aluno</strong>
                  <p className="text-xs text-slate-500">Selecione os TMDs que serão citados e anexados ao TAC.</p>
                </div>
                {!!tmds.length && (
                  <button type="button" className="btn-secondary text-xs" onClick={selectAllTmds}>Selecionar todos</button>
                )}
              </div>
              {loadingStudent ? <div className="p-6"><Loading /></div> : tmds.length === 0 ? (
                <p className="p-4 text-sm text-slate-500">Nenhum TMD elegível encontrado. O TAC ainda pode ser confeccionado por determinação da gestão.</p>
              ) : (
                <div className="divide-y divide-slate-200 max-h-64 overflow-y-auto">
                  {tmds.map((tmd) => {
                    const selected = (form.linkedTmdIds || []).includes(tmd.id);
                    return (
                      <label key={tmd.id} className={`p-3 flex gap-3 cursor-pointer ${selected ? 'bg-blue-50/60' : 'hover:bg-slate-50'}`}>
                        <input type="checkbox" className="mt-1" checked={selected} onChange={() => toggleTmd(tmd.id)} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap text-sm">
                            <strong>TMD Nº {tmd.tmdNumber || 's/n'}</strong>
                            <span className="text-slate-500">{formatDate(tmd.occurredAt)}</span>
                            <span className="badge bg-red-50 text-red-700 border-red-200">{TMD_LABELS[tmd.tmdLevel] || tmd.tmdLevel}</span>
                            <span className="text-red-700">{Number(tmd.scoreImpact || 0).toFixed(2)} ponto(s)</span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1 truncate">{tmd.description}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
              <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 text-xs text-slate-600">
                <Link2 size={12} className="inline mr-1" /> {selectedTmds.length} TMD(s) vinculado(s) ao termo.
              </div>
            </div>
          </section>
        )}

        <section>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <SectionTitle number="3" title="I – Dos Fatos" />
            {studentDetail && (
              <button type="button" className="btn-secondary text-xs inline-flex items-center gap-1.5" onClick={generateFacts}>
                <Sparkles size={14} /> Gerar texto com os TMDs selecionados
              </button>
            )}
          </div>
          <textarea
            className="input-field min-h-[190px] leading-relaxed"
            value={form.description || ''}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            required
            minLength={20}
            placeholder="Descreva a reiteração das ocorrências, as medidas disciplinares já aplicadas e a situação atual do estudante..."
          />
          <p className="text-xs text-slate-500 mt-1">O texto é editável antes da impressão. O botão acima usa os TMDs selecionados apenas como base.</p>
        </section>

        <section>
          <SectionTitle number="4" title="Assinaturas e identificação" />
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="label-field">Coordenadora Disciplinar</label>
              <input className="input-field" value={form.coordinatorName || ''} onChange={(e) => setForm({ ...form, coordinatorName: e.target.value })} />
            </div>
            <div>
              <label className="label-field">Responsável</label>
              <input className="input-field" value={form.responsibleName || ''} onChange={(e) => setForm({ ...form, responsibleName: e.target.value })} placeholder="Nome do pai/responsável" />
            </div>
            <div>
              <label className="label-field">Monitor Disciplinar</label>
              <input className="input-field" value={form.monitorName || ''} onChange={(e) => setForm({ ...form, monitorName: e.target.value })} placeholder="Nome do monitor" />
            </div>
          </div>
        </section>

        <section>
          <SectionTitle number="5" title="Compromissos/observações complementares" />
          <textarea
            className="input-field min-h-[90px]"
            value={form.goals || ''}
            onChange={(e) => setForm({ ...form, goals: e.target.value })}
            placeholder="Opcional. Use somente se houver algum compromisso específico além das cláusulas padrão do TAC."
          />
        </section>

        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          O PDF oficial já inclui automaticamente os blocos <strong>II – Do Dispositivo Legal</strong> e <strong>III – Da Medida Disciplinar</strong>, conforme o modelo adotado pela Coordenação Disciplinar. Você não precisa redigitar essas cláusulas em cada TAC.
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={saving || !form.studentId}>
            {saving ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Confeccionar TAC'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SectionTitle({ number, title }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold">{number}</span>
      <h3 className="font-semibold text-slate-900">{title}</h3>
    </div>
  );
}

function CloseTACModal({ tac, onClose, onSaved }) {
  const [status, setStatus] = useState('CUMPRIDO');
  const [evaluation, setEvaluation] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (tac) { setStatus('CUMPRIDO'); setEvaluation(''); }
  }, [tac]);

  if (!tac) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/tacs/${tac.id}/close`, { status, finalEvaluation: evaluation });
      toast.success('TAC encerrado');
      onSaved();
    } catch { /* interceptor */ } finally { setSaving(false); }
  }

  return (
    <Modal open={!!tac} onClose={onClose} title={`Encerrar TAC Nº ${tac.tacNumber || ''}`} subtitle={tac.student?.name} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label-field">Resultado</label>
          <div className="grid grid-cols-3 gap-2">
            {['CUMPRIDO', 'DESCUMPRIDO', 'CANCELADO'].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`p-3 border-2 text-xs uppercase tracking-wider transition ${
                  status === s ? 'border-slate-400 bg-slate-100 text-slate-900' : 'border-slate-200 text-slate-600'
                }`}
              >
                {TAC_STATUS[s].label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label-field">Avaliação final</label>
          <textarea className="input-field min-h-[120px]" value={evaluation} onChange={(e) => setEvaluation(e.target.value)} placeholder="Registre a evolução, o cumprimento ou as razões do descumprimento..." />
        </div>
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Salvando...' : 'Encerrar TAC'}</button>
        </div>
      </form>
    </Modal>
  );
}
