import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, FileText, Phone, Mail, MapPin, Calendar,
  AlertTriangle, Award, ScrollText, Plus, Download, Archive, ArchiveRestore, Trash2, Pencil,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import toast from 'react-hot-toast';
import api, { downloadPdf } from '../lib/api.js';
import Modal from '../components/ui/Modal.jsx';
import { Loading, PageHeader } from '../components/ui/Misc.jsx';
import { ScoreBadge, ScoreBar } from '../components/ui/Score.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { TMD_LABELS, PRAISE_LABELS, STATUS_LABELS, STATUS_COLORS, formatDate, formatDateTime } from '../lib/constants.js';
import OccurrenceModal from '../components/forms/OccurrenceModal.jsx';
import PraiseModal from '../components/forms/PraiseModal.jsx';
import ArticleRecommender from '../components/forms/ArticleRecommender.jsx';

export default function StudentProfile() {
  const { id } = useParams();
  const { hasRole } = useAuth();
  const [student, setStudent] = useState(null);
  const [thresholds, setThresholds] = useState({ attention: 6.5, critical: 5.0 });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('timeline');
  const [occModal, setOccModal] = useState(false);
  const [praiseModal, setPraiseModal] = useState(false);
  const [statusModal, setStatusModal] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);

  useEffect(() => { fetchStudent(); }, [id]);
  useEffect(() => {
    api.get('/config').then(({ data }) => setThresholds({
      attention: data.attentionThreshold,
      critical: data.criticalThreshold,
    }));
  }, []);

  async function fetchStudent(silent = false) {
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get(`/students/${id}`);
      setStudent(data);
    } finally { if (!silent) setLoading(false); }
  }

  async function changeStudentStatus(nextStatus) {
    setChangingStatus(true);
    try {
      await api.put(`/students/${id}`, {
        status: nextStatus,
        statusDate: new Date().toISOString(),
      });
      toast.success(nextStatus === 'TRANSFERIDO' ? 'Aluno marcado como transferido' : 'Aluno reativado');
      setStatusModal(false);
      await fetchStudent(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Não foi possível alterar o status do aluno');
    } finally {
      setChangingStatus(false);
    }
  }

  if (loading) return <Loading message="Carregando perfil..." />;
  if (!student) return null;

  const events = [
    ...student.occurrences.map(o => ({ type: 'occurrence', date: o.occurredAt, data: o })),
    ...student.praises.map(p => ({ type: 'praise', date: p.occurredAt, data: p })),
    ...student.tacs.map(t => ({ type: 'tac', date: t.startDate, data: t })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  const chartData = student.scoreHistory.map((h, i) => ({
    index: i,
    date: new Date(h.createdAt).toLocaleDateString('pt-BR'),
    score: h.newScore,
  }));

  return (
    <div className="max-w-7xl mx-auto fade-in">
      <Link to="/students" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 mb-4 transition">
        <ArrowLeft size={14} /> Voltar à lista
      </Link>

      {/* Cabeçalho do aluno */}
      <div className="card p-8 mb-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-solar-400/5 rounded-full -translate-y-1/2 translate-x-1/2" />

        <div className="relative flex flex-col lg:flex-row gap-8 items-start">
          <div className="w-24 h-24 bg-slate-100 text-slate-900 flex items-center justify-center font-sans text-4xl font-bold flex-shrink-0">
            {student.name[0]}
          </div>

          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-widest text-slate-500">Aluno · Matrícula {student.registration}</p>
            <h1 className="font-sans text-4xl text-slate-900 font-semibold mt-1 mb-3">{student.name}</h1>
            <div className="w-12 h-0.5 bg-solar-400 mb-4" />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <Info icon={Calendar} label="Nascimento" value={formatDate(student.birthDate)} />
              <Info icon={MapPin} label="Cidade" value={student.city ? `${student.city} / ${student.state}` : '—'} />
              <Info icon={FileText} label="Turma" value={student.class.name} />
              <Info icon={AlertTriangle} label="Status" value={student.status} />
            </div>

            {student.guardianName && (
              <div className="mt-4 pt-4 border-t border-slate-200">
                <p className="label-field">Responsável</p>
                <p className="text-sm font-medium text-slate-900">{student.guardianName} {student.guardianRelation && <span className="text-slate-500">({student.guardianRelation})</span>}</p>
                <div className="flex gap-4 mt-1 text-xs text-slate-500">
                  {student.guardianPhone && <span className="flex items-center gap-1"><Phone size={12} /> {student.guardianPhone}</span>}
                  {student.guardianEmail && <span className="flex items-center gap-1"><Mail size={12} /> {student.guardianEmail}</span>}
                </div>
              </div>
            )}
          </div>

          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">Conceito Atual</p>
            <ScoreBadge score={student.currentScore} size="xl" thresholds={thresholds} />
            <div className="mt-3 max-w-[200px] ml-auto">
              <ScoreBar score={student.currentScore} thresholds={thresholds} />
            </div>
            <button
              type="button"
              onClick={() => downloadPdf(`/reports/student/${student.id}`, `Relatorio-${student.registration}.pdf`)}
              className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500 hover:text-amber-700 mt-4 transition"
            >
              <Download size={12} /> Relatório PDF
            </button>
          </div>
        </div>
      </div>

      {/* Ações */}
      <div className="flex gap-2 mb-6">
        <button onClick={() => setOccModal(true)} className="btn-primary flex items-center gap-2">
          <AlertTriangle size={14} /> Nova Ocorrência
        </button>
        {hasRole('ADMIN', 'COORD_DISCIPLINAR', 'COORD_PEDAGOGICO') && (
          <button onClick={() => setPraiseModal(true)} className="btn-secondary flex items-center gap-2">
            <Award size={14} /> Novo Elogio
          </button>
        )}
        {hasRole('ADMIN', 'COORD_DISCIPLINAR', 'COORD_PEDAGOGICO') && (
          <button
            onClick={() => setStatusModal(true)}
            className={student.status === 'ATIVO' ? 'btn-secondary flex items-center gap-2 text-red-700' : 'btn-secondary flex items-center gap-2 text-emerald-700'}
          >
            <Archive size={14} /> {student.status === 'ATIVO' ? 'Transferir aluno' : 'Reativar aluno'}
          </button>
        )}
      </div>

      {/* Gráfico de evolução */}
      {chartData.length > 1 && (
        <div className="card p-6 mb-6">
          <h3 className="section-title text-xl mb-4">Evolução do Conceito</h3>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis domain={[0, 10]} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', color: '#172033', borderRadius: 4 }} />
                <ReferenceLine y={thresholds.attention} stroke="#163a63" strokeDasharray="3 3" label={{ value: 'Atenção', fill: '#a16207', fontSize: 10 }} />
                <ReferenceLine y={thresholds.critical} stroke="#f87171" strokeDasharray="3 3" label={{ value: 'Crítico', fill: '#f87171', fontSize: 10 }} />
                <Line type="monotone" dataKey="score" stroke="#163a63" strokeWidth={2} dot={{ fill: '#a16207', r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Tabs de eventos */}
      <div className="card">
        <div className="flex border-b border-slate-200 overflow-x-auto">
          {[
            { key: 'timeline', label: 'Linha do Tempo', count: events.length },
            { key: 'occurrences', label: 'Ocorrências', count: student.occurrences.length },
            { key: 'praises', label: 'Elogios', count: student.praises.length },
            { key: 'tacs', label: 'TACs', count: student.tacs.length },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-6 py-3 text-sm uppercase tracking-wider border-b-2 transition whitespace-nowrap
                ${tab === t.key ? 'border-solar-400 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-900'}`}
            >
              {t.label} <span className="text-xs ml-1 opacity-60">({t.count})</span>
            </button>
          ))}
        </div>

        <div className="p-6">
          {tab === 'timeline' && <Timeline events={events} />}
          {tab === 'occurrences' && <OccurrenceList studentId={student.id} occurrences={student.occurrences} canManage={hasRole('ADMIN', 'COORD_DISCIPLINAR')} onChanged={() => fetchStudent(true)} />}
          {tab === 'praises' && <PraiseList praises={student.praises} />}
          {tab === 'tacs' && <TACList tacs={student.tacs} />}
        </div>
      </div>

      <OccurrenceModal
        open={occModal}
        onClose={() => setOccModal(false)}
        studentId={student.id}
        onSaved={() => { setOccModal(false); fetchStudent(); }}
      />
      <Modal
        open={statusModal}
        onClose={() => !changingStatus && setStatusModal(false)}
        title={student.status === 'ATIVO' ? 'Transferir aluno' : 'Reativar aluno'}
        size="md"
      >
        <div className="space-y-5">
          {student.status === 'ATIVO' ? (
            <>
              <p className="text-sm text-slate-600">
                O aluno <strong className="text-slate-900">{student.name}</strong> será marcado como <strong>TRANSFERIDO</strong>.
              </p>
              <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                O histórico não será excluído. Ocorrências, TMDs, TACs, elogios, conceito e relatórios permanecem preservados. O aluno deixará de aparecer no filtro padrão de alunos ativos.
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-600">
              O aluno <strong className="text-slate-900">{student.name}</strong> voltará para o status <strong>ATIVO</strong>.
            </p>
          )}
          <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
            <button type="button" className="btn-secondary" onClick={() => setStatusModal(false)} disabled={changingStatus}>Cancelar</button>
            <button
              type="button"
              className="btn-primary"
              disabled={changingStatus}
              onClick={() => changeStudentStatus(student.status === 'ATIVO' ? 'TRANSFERIDO' : 'ATIVO')}
            >
              {changingStatus ? 'Salvando...' : (student.status === 'ATIVO' ? 'Confirmar transferência' : 'Reativar aluno')}
            </button>
          </div>
        </div>
      </Modal>

      <PraiseModal
        open={praiseModal}
        onClose={() => setPraiseModal(false)}
        studentId={student.id}
        onSaved={() => { setPraiseModal(false); fetchStudent(); }}
      />
    </div>
  );
}

function Info({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-2">
      <Icon size={14} className="text-slate-500 mt-0.5" />
      <div>
        <p className="text-[10px] uppercase tracking-widest text-slate-500">{label}</p>
        <p className="text-slate-900">{value}</p>
      </div>
    </div>
  );
}

function Timeline({ events }) {
  if (events.length === 0) return <p className="text-sm text-slate-500 text-center py-8">Nenhum evento registrado.</p>;
  return (
    <div className="relative pl-8 space-y-6">
      <div className="absolute left-3 top-2 bottom-2 w-px bg-slate-100" />
      {events.map((e, i) => {
        const colors = e.type === 'occurrence' ? 'bg-red-500 border-red-200'
                     : e.type === 'praise' ? 'bg-solar-400 border-solar-500'
                     : 'bg-navy-500 border-slate-200';
        return (
          <div key={i} className="relative">
            <div className={`absolute left-[-26px] top-1 w-3 h-3 ${colors} border-2`} />
            <p className="text-[10px] uppercase tracking-widest text-slate-500">{formatDateTime(e.date)}</p>
            {e.type === 'occurrence' && (
              <div>
                <p className="font-medium text-slate-900 mt-1">
                  {e.data.type === 'TMD' ? `TMD ${e.data.tmdLevel}` : e.data.type}
                  {e.data.scoreImpact !== 0 && <span className="ml-2 text-xs text-red-700">({e.data.scoreImpact.toFixed(2)})</span>}
                </p>
                <p className="text-sm text-slate-600 mt-1">{e.data.description}</p>
              </div>
            )}
            {e.type === 'praise' && (
              <div>
                <p className="font-medium text-slate-900 mt-1">
                  {PRAISE_LABELS[e.data.type]}
                  <span className="ml-2 text-xs text-amber-700">(+{e.data.scoreImpact.toFixed(2)})</span>
                </p>
                <p className="text-sm text-slate-600 mt-1">{e.data.reason}</p>
              </div>
            )}
            {e.type === 'tac' && (
              <div>
                <p className="font-medium text-slate-900 mt-1">TAC: {e.data.title}</p>
                <p className="text-sm text-slate-600 mt-1">Status: {e.data.status}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const NATUREZA_ORDER = { LEVE: 0, MEDIA: 1, GRAVE: 2, GRAVISSIMO: 3 };
const NATUREZA_LABELS = { LEVE: 'Leve', MEDIA: 'Média', GRAVE: 'Grave', GRAVISSIMO: 'Gravíssima' };
const ARTICLE_NATURE = { 104: 'LEVE', 105: 'MEDIA', 106: 'GRAVE', 107: 'GRAVISSIMO' };
const TMD_DEFAULT_SCORE = { LEVE: 0.30, MEDIA: 0.50, GRAVE: 0.80, GRAVISSIMO: 1.50 };

function parseAnnotationLegal(description = '') {
  const match = String(description).match(/^\[Art\.\s*(\d+)\s*,\s*(?:inc\.|inciso)\s*([^\]]+)\]\s*/i);
  if (!match) return null;
  return {
    artigo: Number(match[1]),
    inciso: match[2].trim(),
    label: `Art. ${match[1]}, ${match[2].trim()}`,
    details: String(description).slice(match[0].length).trim(),
  };
}

function annotationNature(occurrence) {
  if (occurrence.category?.defaultLevel && NATUREZA_ORDER[occurrence.category.defaultLevel] !== undefined) {
    return occurrence.category.defaultLevel;
  }
  const legal = parseAnnotationLegal(occurrence.description);
  return legal ? (ARTICLE_NATURE[legal.artigo] || 'LEVE') : 'LEVE';
}

function OccurrenceList({ studentId, occurrences, canManage, onChanged }) {
  const [confirm, setConfirm] = useState(null); // { kind: 'remove' | 'archive' | 'unarchive', occ }
  const [editing, setEditing] = useState(null); // ocorrência sendo editada
  const [busy, setBusy] = useState(false);
  const [selectedAnnotationIds, setSelectedAnnotationIds] = useState([]);
  const [tmdModal, setTmdModal] = useState(false);
  const [generatingTmd, setGeneratingTmd] = useState(false);
  const [tmdNumber, setTmdNumber] = useState('');
  const [tmdScore, setTmdScore] = useState('');

  const linkedAnnotationIds = new Set(
    occurrences
      .filter(o => o.type === 'TMD' && o.status !== 'REJEITADO' && o.generatedFromIds)
      .flatMap(o => String(o.generatedFromIds).split(',').filter(Boolean))
  );

  const selectableAnnotations = occurrences.filter(o =>
    o.type === 'ANOTACAO' &&
    ['APROVADO', 'ARQUIVADO'].includes(o.status) &&
    !linkedAnnotationIds.has(o.id) &&
    Boolean(parseAnnotationLegal(o.description))
  );

  useEffect(() => {
    const availableIds = new Set(selectableAnnotations.map(o => o.id));
    setSelectedAnnotationIds(ids => ids.filter(id => availableIds.has(id)));
  }, [occurrences]);

  const selectedAnnotations = occurrences
    .filter(o => selectedAnnotationIds.includes(o.id))
    .sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt));

  const highestLevel = selectedAnnotations.reduce((highest, occurrence) => {
    const level = annotationNature(occurrence);
    return NATUREZA_ORDER[level] > NATUREZA_ORDER[highest] ? level : highest;
  }, 'LEVE');

  if (occurrences.length === 0) return <p className="text-sm text-slate-500 text-center py-8">Sem ocorrências registradas.</p>;

  const label = (o) => (o.type === 'TMD' ? `${o.tmdNumber ? `TMD Nº ${o.tmdNumber} — ` : ''}${TMD_LABELS[o.tmdLevel] || `TMD ${o.tmdLevel}`}` : o.type === 'ANOTACAO' ? 'Anotação' : 'Suspensão');
  const canArchive = (o) => ['APROVADO', 'AUTO_GERADO'].includes(o.status);

  function toggleAnnotation(id) {
    setSelectedAnnotationIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  }

  async function generateTmd() {
    const number = tmdNumber.trim();
    const score = Number(String(tmdScore).replace(',', '.'));
    if (!selectedAnnotationIds.length || !number || !Number.isFinite(score) || score < 0 || score > 2) {
      if (!number) toast.error('Informe o número do TMD');
      else if (!Number.isFinite(score) || score < 0 || score > 2) toast.error('Informe um desconto entre 0,00 e 2,00 pontos');
      return;
    }
    setGeneratingTmd(true);
    try {
      const { data } = await api.post('/occurrences/tmd/from-annotations', {
        studentId,
        annotationIds: selectedAnnotationIds,
        tmdNumber: number,
        scoreImpact: score,
      });
      const generated = data.tmd;
      toast.success(`TMD Nº ${generated.tmdNumber || number} gerado com ${selectedAnnotationIds.length} anotação(ões)`);
      setSelectedAnnotationIds([]);
      setTmdNumber('');
      setTmdScore('');
      setTmdModal(false);
      onChanged?.();
    } catch {
      // o interceptor do axios já mostra o erro
    } finally {
      setGeneratingTmd(false);
    }
  }

  async function run() {
    if (!confirm) return;
    const { kind, occ } = confirm;
    setBusy(true);
    try {
      if (kind === 'remove') {
        const { data } = await api.delete(`/occurrences/${occ.id}`);
        toast.success(data.scoreReverted ? `Removida. Conceito devolvido: +${data.scoreReverted.toFixed(2)}` : 'Ocorrência removida');
      } else if (kind === 'archive') {
        await api.post(`/occurrences/${occ.id}/archive`);
        toast.success('Ocorrência arquivada na ficha do aluno');
      } else {
        await api.post(`/occurrences/${occ.id}/unarchive`);
        toast.success('Ocorrência desarquivada');
      }
      setConfirm(null);
      onChanged?.();
    } catch {
      // o interceptor do axios já mostra o erro
    } finally { setBusy(false); }
  }

  const texts = {
    remove: {
      title: 'Remover ocorrência',
      body: 'Use esta opção quando o lançamento foi feito por engano. A ocorrência será apagada definitivamente e o conceito descontado será devolvido ao aluno. Esta ação não pode ser desfeita.',
      button: 'Remover definitivamente',
      cls: 'bg-red-700 hover:bg-red-800 text-white',
    },
    archive: {
      title: 'Arquivar ocorrência',
      body: 'Use esta opção quando o responsável já compareceu e assinou. O registro continua na ficha do aluno, marcado como Arquivado, e o conceito não é alterado. É possível desarquivar depois.',
      button: 'Arquivar',
      cls: 'btn-primary',
    },
    unarchive: {
      title: 'Desarquivar ocorrência',
      body: 'A ocorrência volta ao status anterior (Aprovado). O conceito não é alterado.',
      button: 'Desarquivar',
      cls: 'btn-primary',
    },
  };
  const t = confirm ? texts[confirm.kind] : null;

  return (
    <div className="space-y-3">
      {canManage && (
        <div className="border border-slate-200 bg-slate-50 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Gerar TMD a partir das anotações</p>
            <p className="text-xs text-slate-500 mt-1">
              Marque as anotações que irão compor o termo. Anotações já vinculadas a outro TMD não podem ser reutilizadas.
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {selectableAnnotations.length} anotação(ões) disponível(is) · {selectedAnnotationIds.length} selecionada(s)
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {selectedAnnotationIds.length > 0 && (
              <button type="button" className="btn-secondary" onClick={() => setSelectedAnnotationIds([])}>
                Limpar seleção
              </button>
            )}
            <button
              type="button"
              className="btn-primary inline-flex items-center gap-2"
              disabled={!selectedAnnotationIds.length}
              onClick={() => { setTmdNumber(''); setTmdScore(TMD_DEFAULT_SCORE[highestLevel].toFixed(2)); setTmdModal(true); }}
            >
              <ScrollText size={14} /> Gerar TMD {selectedAnnotationIds.length ? `(${selectedAnnotationIds.length})` : ''}
            </button>
          </div>
        </div>
      )}

      {occurrences.map(o => {
        const legal = parseAnnotationLegal(o.description);
        const isAnnotation = o.type === 'ANOTACAO';
        const alreadyLinked = isAnnotation && linkedAnnotationIds.has(o.id);
        const selectable = isAnnotation && ['APROVADO', 'ARQUIVADO'].includes(o.status) && !alreadyLinked && Boolean(legal);
        const linkedCount = o.type === 'TMD' && o.generatedFromIds ? String(o.generatedFromIds).split(',').filter(Boolean).length : 0;

        return (
          <div key={o.id} className={`border-l-2 pl-4 py-2 ${/^\[REVISAR/.test(o.description || '') ? 'border-amber-400 bg-amber-50/60' : o.status === 'ARQUIVADO' ? 'border-slate-300 opacity-80' : 'border-red-200'}`}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {canManage && isAnnotation && (
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-slate-900"
                    checked={selectedAnnotationIds.includes(o.id)}
                    disabled={!selectable}
                    onChange={() => toggleAnnotation(o.id)}
                    title={alreadyLinked ? 'Esta anotação já compõe outro TMD' : !legal ? 'Defina o artigo/inciso antes de gerar o TMD' : 'Selecionar para o TMD'}
                  />
                )}
                <p className="font-medium text-slate-900">
                  {label(o)}
                  {o.scoreImpact !== 0 && <span className="ml-2 text-xs text-red-700">({o.scoreImpact.toFixed(2)})</span>}
                </p>
                {isAnnotation && legal && (
                  <span className="text-[10px] border border-slate-200 bg-slate-50 text-slate-600 px-2 py-0.5">
                    {legal.label}
                  </span>
                )}
                {alreadyLinked && (
                  <span className="text-[10px] border border-emerald-200 bg-emerald-50 text-emerald-700 px-2 py-0.5">
                    Já vinculada a TMD
                  </span>
                )}
                {isAnnotation && !legal && (
                  <span className="text-[10px] border border-amber-200 bg-amber-50 text-amber-700 px-2 py-0.5">
                    Sem artigo/inciso
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {o.type === 'TMD' && (
                  <button
                    type="button"
                    onClick={() => downloadPdf(`/reports/tmd/${o.id}`, `TMD-${String(o.tmdNumber || o.id).replace(/[^a-zA-Z0-9_-]+/g, '-')}.pdf`)}
                    className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-amber-700 border border-slate-200 px-2 py-0.5 transition"
                  >
                    <Download size={11} /> TMD PDF
                  </button>
                )}
                {o.type === 'TMD' && o.generatedFromIds && (
                  <button
                    type="button"
                    onClick={() => downloadPdf(`/reports/tmd/${o.id}/annotations`, `Ficha-TMD-${String(o.tmdNumber || o.id).replace(/[^a-zA-Z0-9_-]+/g, '-')}.pdf`)}
                    className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-amber-700 border border-slate-200 px-2 py-0.5 transition"
                  >
                    <FileText size={11} /> Ficha das anotações
                  </button>
                )}
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setEditing(o)}
                    className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 border border-slate-200 px-2 py-0.5 transition"
                  >
                    <Pencil size={11} /> Editar
                  </button>
                )}
                {canManage && o.status === 'ARQUIVADO' && (
                  <button
                    type="button"
                    onClick={() => setConfirm({ kind: 'unarchive', occ: o })}
                    className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 border border-slate-200 px-2 py-0.5 transition"
                  >
                    <ArchiveRestore size={11} /> Desarquivar
                  </button>
                )}
                {canManage && canArchive(o) && (
                  <button
                    type="button"
                    onClick={() => setConfirm({ kind: 'archive', occ: o })}
                    className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 border border-slate-200 px-2 py-0.5 transition"
                  >
                    <Archive size={11} /> Arquivar
                  </button>
                )}
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setConfirm({ kind: 'remove', occ: o })}
                    className="inline-flex items-center gap-1 text-xs text-red-700 hover:bg-red-50 border border-red-200 px-2 py-0.5 transition"
                  >
                    <Trash2 size={11} /> Remover
                  </button>
                )}
                <span className={`badge ${STATUS_COLORS[o.status]}`}>{STATUS_LABELS[o.status]}</span>
              </div>
            </div>
            <p className="text-sm text-slate-600 mt-1">{isAnnotation && legal ? legal.details : o.description}</p>
            <p className="text-xs text-slate-500 mt-2">
              {formatDateTime(o.occurredAt)} · por {o.createdBy?.name || '—'}
              {linkedCount > 0 && <> · {linkedCount} anotação(ões) vinculada(s)</>}
            </p>
          </div>
        );
      })}

      <EditOccurrenceModal occ={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged?.(); }} />

      <Modal open={tmdModal} onClose={() => !generatingTmd && setTmdModal(false)} title="Gerar TMD pelas anotações" subtitle="Confirme os registros que irão fundamentar o termo" size="lg">
        <div className="space-y-4">
          <label className="text-sm block">
            <span className="block font-medium text-slate-700 mb-1">Número do TMD</span>
            <input
              type="text"
              className="input-field"
              value={tmdNumber}
              onChange={(e) => setTmdNumber(e.target.value)}
              placeholder="Ex.: 008/2026"
              maxLength={30}
              autoFocus
              required
            />
            <span className="block text-xs text-slate-500 mt-1">A numeração é manual e será impressa no TMD e na ficha das anotações.</span>
          </label>

          <div className="grid sm:grid-cols-3 gap-3">
            <div className="border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] uppercase tracking-widest text-slate-500">Anotações</p>
              <p className="text-2xl font-semibold text-slate-900 mt-1">{selectedAnnotations.length}</p>
            </div>
            <div className="border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] uppercase tracking-widest text-slate-500">Maior natureza</p>
              <p className="text-lg font-semibold text-slate-900 mt-1">{NATUREZA_LABELS[highestLevel]}</p>
            </div>
            <div className="border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] uppercase tracking-widest text-slate-500">Desconto sugerido</p>
              <p className="text-lg font-semibold text-red-700 mt-1">-{TMD_DEFAULT_SCORE[highestLevel].toFixed(2)} ponto(s)</p>
            </div>
          </div>

          <label className="text-sm block">
            <span className="block font-medium text-slate-700 mb-1">Desconto do TMD (pontos)</span>
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                className="input-field pr-20"
                value={tmdScore}
                onChange={(e) => setTmdScore(e.target.value.replace(/[^0-9.,]/g, ''))}
                placeholder={TMD_DEFAULT_SCORE[highestLevel].toFixed(2)}
                required
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">ponto(s)</span>
            </div>
            <span className="block text-xs text-slate-500 mt-1">
              Sugestão automática para natureza {NATUREZA_LABELS[highestLevel]}: {TMD_DEFAULT_SCORE[highestLevel].toFixed(2).replace('.', ',')} ponto(s). Você pode alterar o valor antes de gerar.
            </span>
          </label>

          <div className="border border-slate-200 divide-y divide-slate-200 max-h-80 overflow-y-auto">
            {selectedAnnotations.map((annotation, index) => {
              const legal = parseAnnotationLegal(annotation.description);
              const level = annotationNature(annotation);
              return (
                <div key={annotation.id} className="p-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-sm font-medium text-slate-900">
                      {String(index + 1).padStart(2, '0')} · {formatDate(annotation.occurredAt)} · {legal?.label}
                    </p>
                    <span className="text-[10px] border border-slate-200 bg-slate-50 text-slate-600 px-2 py-0.5">
                      Natureza {NATUREZA_LABELS[level]}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">{legal?.details}</p>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-slate-500">
            O TMD ficará vinculado a estas anotações. Elas continuarão preservadas na ficha do aluno e não poderão ser usadas em outro TMD enquanto este existir.
          </p>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button type="button" className="btn-secondary" onClick={() => setTmdModal(false)} disabled={generatingTmd}>Cancelar</button>
            <button type="button" className="btn-primary inline-flex items-center gap-2" onClick={generateTmd} disabled={generatingTmd || !selectedAnnotations.length || !tmdNumber.trim() || !tmdScore.trim()}>
              <ScrollText size={14} /> {generatingTmd ? 'Gerando...' : `Gerar ${TMD_LABELS[highestLevel] || 'TMD'}`}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!confirm} onClose={() => !busy && setConfirm(null)} title={t?.title || ''} size="sm">
        {confirm && (
          <div className="space-y-4">
            <div className="border border-slate-200 bg-slate-50 rounded-xl p-3 text-sm">
              <p className="font-medium text-slate-900">{label(confirm.occ)} · {formatDate(confirm.occ.occurredAt)}</p>
              <p className="text-slate-600 mt-1 line-clamp-3">{confirm.occ.description}</p>
            </div>
            <p className="text-sm text-slate-700">{t.body}</p>
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
              <button type="button" className="btn-secondary" onClick={() => setConfirm(null)} disabled={busy}>Cancelar</button>
              <button type="button" className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 ${t.cls}`} onClick={run} disabled={busy}>
                {busy ? 'Aguarde...' : t.button}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function EditOccurrenceModal({ occ, onClose, onSaved }) {
  const [form, setForm] = useState({});
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!occ) return;
    const legal = occ.type === 'ANOTACAO' ? parseAnnotationLegal(occ.description) : null;
    setSelectedArticle(legal ? {
      artigo: legal.artigo,
      inciso: legal.inciso,
      natureza: annotationNature(occ),
    } : null);
    setForm({
      occurredAt: occ.occurredAt ? String(occ.occurredAt).slice(0, 10) : '',
      description: legal ? legal.details : (occ.description || ''),
      tmdLevel: occ.tmdLevel || 'LEVE',
      tmdNumber: occ.tmdNumber || '',
      valor: occ.scoreImpact ? Math.abs(occ.scoreImpact).toFixed(2) : '',
      suspensionDays: occ.suspensionDays || '',
    });
  }, [occ]);

  if (!occ) return null;
  const isTmd = occ.type === 'TMD';
  const isSusp = occ.type === 'SUSPENSAO';
  const isAnnotation = occ.type === 'ANOTACAO';
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const levelByValue = (v) => (v <= 0.4 ? 'LEVE' : v <= 0.6 ? 'MEDIA' : v <= 1 ? 'GRAVE' : 'GRAVISSIMO');

  async function save(e) {
    e.preventDefault();
    const description = isAnnotation && selectedArticle
      ? `[Art. ${selectedArticle.artigo}, inc. ${selectedArticle.inciso}] ${form.description}`
      : form.description;
    const body = { description, occurredAt: form.occurredAt };
    if (isTmd || isSusp) {
      const v = parseFloat(String(form.valor).replace(',', '.'));
      const antigo = Math.abs(occ.scoreImpact || 0);
      if (Number.isFinite(v) && Math.abs(v - antigo) > 0.0001) {
        body.scoreImpact = -Math.abs(v);
        if (isTmd && form.tmdLevel === occ.tmdLevel) body.tmdLevel = levelByValue(Math.abs(v));
      }
      if (isTmd && form.tmdLevel !== occ.tmdLevel) body.tmdLevel = form.tmdLevel;
      if (isTmd && String(form.tmdNumber || '').trim() !== String(occ.tmdNumber || '').trim()) body.tmdNumber = String(form.tmdNumber || '').trim();
      if (isSusp) body.suspensionDays = form.suspensionDays ? Number(form.suspensionDays) : null;
    }
    setSaving(true);
    try {
      await api.put(`/occurrences/${occ.id}`, body);
      toast.success('Ocorrência atualizada');
      onSaved?.();
    } catch {
      // o interceptor do axios já mostra o erro
    } finally { setSaving(false); }
  }

  return (
    <Modal open onClose={() => !saving && onClose()} title="Editar ocorrência" size="md">
      <form onSubmit={save} className="space-y-4">
        {/^\[REVISAR/.test(occ.description || '') && (
          <p className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3">
            Este registro veio da ficha manual com algo a conferir. Corrija abaixo e apague o trecho “[REVISAR …]” da descrição.
          </p>
        )}
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="text-sm">
            <span className="block text-slate-600 mb-1">Data da ocorrência</span>
            <input type="date" className="input-field" value={form.occurredAt || ''} onChange={set('occurredAt')} required />
          </label>
          {isTmd && (
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Número do TMD</span>
              <input type="text" className="input-field" value={form.tmdNumber || ''} onChange={set('tmdNumber')} placeholder="Ex.: 008/2026" maxLength={30} required />
            </label>
          )}
          {isTmd && (
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Nível do TMD</span>
              <select className="input-field" value={form.tmdLevel} onChange={set('tmdLevel')}>
                <option value="LEVE">Leve</option>
                <option value="MEDIA">Médio</option>
                <option value="GRAVE">Grave</option>
                <option value="GRAVISSIMO">Gravíssimo</option>
              </select>
            </label>
          )}
          {(isTmd || isSusp) && (
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Valor descontado do conceito</span>
              <input type="text" inputMode="decimal" className="input-field" placeholder="ex.: 0,65" value={form.valor} onChange={set('valor')} />
              <span className="block text-xs text-slate-500 mt-1">Ao mudar o valor, a diferença é aplicada no conceito do aluno.</span>
            </label>
          )}
          {isSusp && (
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Dias de suspensão</span>
              <select className="input-field" value={form.suspensionDays} onChange={set('suspensionDays')}>
                <option value="">Não informado</option>
                {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
          )}
        </div>
        <label className="text-sm block">
          <span className="block text-slate-600 mb-1">Descrição</span>
          <textarea className="input-field" rows={4} value={form.description || ''} onChange={set('description')} required minLength={3} />
        </label>
        {isAnnotation && (
          <div className="space-y-2">
            <ArticleRecommender descricao={form.description || ''} onSelect={setSelectedArticle} />
            {selectedArticle && (
              <div className="border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                Enquadramento que será salvo: <b>Art. {selectedArticle.artigo}, inciso {selectedArticle.inciso}</b>
              </div>
            )}
          </div>
        )}
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </form>
    </Modal>
  );
}

function PraiseList({ praises }) {
  if (praises.length === 0) return <p className="text-sm text-slate-500 text-center py-8">Sem elogios registrados.</p>;
  return (
    <div className="space-y-3">
      {praises.map(p => (
        <div key={p.id} className="border-l-2 border-solar-400 pl-4 py-2">
          <p className="font-medium text-slate-900">
            {PRAISE_LABELS[p.type]}
            <span className="ml-2 text-xs text-amber-700">(+{p.scoreImpact.toFixed(2)})</span>
          </p>
          <p className="text-sm text-slate-600 mt-1">{p.reason}</p>
          <p className="text-sm text-slate-500 mt-1 italic">{p.description}</p>
          <p className="text-xs text-slate-500 mt-2">{formatDateTime(p.occurredAt)}</p>
        </div>
      ))}
    </div>
  );
}

function TACList({ tacs }) {
  const STATUS_TAC = {
    ATIVO: 'bg-blue-50 text-blue-700 border-blue-200',
    CUMPRIDO: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    DESCUMPRIDO: 'bg-red-50 text-red-700 border-red-200',
    CANCELADO: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  if (tacs.length === 0) return <p className="text-sm text-slate-500 text-center py-8">Sem TACs registrados.</p>;
  return (
    <div className="space-y-3">
      {tacs.map(t => (
        <div key={t.id} className="border-l-2 border-slate-200 pl-4 py-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="font-medium text-slate-900">{t.title}</p>
            <span className={`badge ${STATUS_TAC[t.status] || 'bg-slate-100 text-slate-600'}`}>
              {t.status}
            </span>
          </div>
          <p className="text-sm text-slate-600 mt-1">{t.description}</p>
          <p className="text-xs text-slate-500 mt-2">
            {formatDate(t.startDate)} a {formatDate(t.endDate)}
          </p>
        </div>
      ))}
    </div>
  );
}
