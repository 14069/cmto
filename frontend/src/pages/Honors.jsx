import { useState, useEffect, useMemo, useCallback } from 'react';
import { Medal, FileUp, SlidersHorizontal, Download, Search, Star } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { openPdf } from '../lib/api.js';
import Modal from '../components/ui/Modal.jsx';
import { Loading, PageHeader } from '../components/ui/Misc.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const FIELDS = ['DISC_MEDALHA', 'DISC_ALAMAR', 'PED_MEDALHA', 'PED_ALAMAR'];
const COLUMN_LABEL = { DISC_MEDALHA: 'Medalha', DISC_ALAMAR: 'Alamar', PED_MEDALHA: 'Medalha', PED_ALAMAR: 'Alamar' };
const COLOR = { DISC_MEDALHA: '#0070C0', DISC_ALAMAR: '#0070C0', PED_MEDALHA: '#FF0000', PED_ALAMAR: '#FF0000' };
const GOLD = '#FFC000';

const CRITERIA_FIELDS = [
  { group: 'Média pedagógica', items: [
    { k: 'bimesters', label: 'Bimestres que entram na média', step: 1 },
    { k: 'tolerance', label: 'Aproximação permitida (Art. 3º)', step: 0.01 },
    { k: 'minNote', label: 'Nenhuma nota menor que', step: 0.1 },
  ] },
  { group: 'Medalhas e alamares', items: [
    { k: 'discMedalMin', label: 'Medalha disciplinar: conceito mínimo', step: 0.1 },
    { k: 'discAlamarMin', label: 'Alamar disciplinar: conceito mínimo', step: 0.1 },
    { k: 'pedMedalMin', label: 'Medalha pedagógica: média mínima', step: 0.1 },
    { k: 'pedAlamarMin', label: 'Alamar pedagógico: média mínima', step: 0.1 },
    { k: 'pedAlamarMaxTmd', label: 'Alamar pedagógico: máximo de TMDs no ano', step: 1 },
    { k: 'duploPedMin', label: 'Alamar duplo: média pedagógica mínima', step: 0.1 },
    { k: 'duploDiscMin', label: 'Alamar duplo: conceito mínimo', step: 0.1 },
  ] },
  { group: 'Descontos no ano', items: [
    { k: 'deductionLimit', label: 'Não pode ter desconto igual ou maior que', step: 0.1 },
  ] },
];

const fmt = (n) => (n == null ? '—' : Number(n).toFixed(2).replace('.', ','));

export default function Honors() {
  const { hasRole } = useAuth();
  const canEdit = hasRole('ADMIN', 'COORD_DISCIPLINAR');
  const [year, setYear] = useState(new Date().getFullYear());
  const [classId, setClassId] = useState('');
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [critOpen, setCritOpen] = useState(false);
  const [impOpen, setImpOpen] = useState(false);

  useEffect(() => { api.get('/classes').then((r) => setClasses(r.data)).catch(() => {}); }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get('/honors', { params: { year, classId: classId || undefined } });
      setData(data);
    } catch { /* o interceptor mostra o erro */ } finally { setLoading(false); }
  }, [year, classId]);
  useEffect(() => { load(); }, [load]);

  async function setOverride(student, field, value) {
    try {
      await api.put('/honors/override', { studentId: student.studentId, year, field, value });
      setData((d) => ({
        ...d,
        turmas: d.turmas.map((t) => ({
          ...t,
          students: t.students.map((s) => {
            if (s.studentId !== student.studentId) return s;
            const overrides = { ...s.overrides };
            if (value === null) delete overrides[field]; else overrides[field] = value;
            const final = { ...s.final };
            if (FIELDS.includes(field)) final[field] = field in overrides ? overrides[field] : s.auto[field];
            return { ...s, overrides, final, dourado: !!overrides.DOURADO };
          }),
        })),
      }));
    } catch { /* interceptor */ }
  }

  function clickCell(s, f) {
    if (!canEdit) return;
    if (f in s.overrides) setOverride(s, f, null);          // já estava ajustado: volta ao automático
    else setOverride(s, f, !s.final[f]);                      // inverte o resultado automático
  }

  const turmas = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.turmas || []).map((t) => ({
      ...t, students: q ? t.students.filter((s) => s.name.toLowerCase().includes(q)) : t.students,
    })).filter((t) => t.students.length);
  }, [data, search]);

  const totals = useMemo(() => {
    const c = { DISC_MEDALHA: 0, DISC_ALAMAR: 0, PED_MEDALHA: 0, PED_ALAMAR: 0, DOURADO: 0 };
    for (const t of data?.turmas || []) for (const s of t.students) {
      FIELDS.forEach((f) => { if (s.final[f]) c[f]++; });
      if (s.dourado) c.DOURADO++;
    }
    return c;
  }, [data]);

  return (
    <div className="max-w-7xl mx-auto fade-in">
      <PageHeader
        title="Solenidade de Condecoração"
        subtitle="Medalhas e alamares calculados pela portaria de critérios"
        breadcrumb="Gestão e controle · Condecorações"
      />

      <div className="card p-4 mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label-field">Ano</label>
          <input type="number" className="input-field w-28" value={year} onChange={(e) => setYear(Number(e.target.value) || year)} />
        </div>
        <div>
          <label className="label-field">Turma</label>
          <select className="input-field w-56" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">Todas as turmas</option>
            {(data?.opcoes || classes.map((c) => ({ classId: c.id, name: c.name }))).map((c) => <option key={c.classId} value={c.classId}>{c.name}{c.cia ? ` — ${c.cia}` : ''}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="label-field">Buscar aluno</label>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input-field pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome do aluno" />
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={() => setImpOpen(true)}>
            <FileUp size={16} /> Importar boletim
          </button>
          {canEdit && (
            <>
              <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={() => setCritOpen(true)}>
                <SlidersHorizontal size={16} /> Critérios
              </button>
              <button
                type="button" className="btn-primary inline-flex items-center gap-2"
                onClick={() => openPdf(`/honors/pdf?year=${year}${classId ? `&classId=${classId}` : ''}`)}
              >
                <Download size={16} /> Gerar PDF
              </button>
            </>
          )}
        </div>
      </div>

      <div className="card p-4 mb-4 text-sm text-slate-700 flex flex-wrap items-center gap-x-6 gap-y-2">
        <Legend color="#0070C0" text={`Disciplinar · ${totals.DISC_MEDALHA} medalhas, ${totals.DISC_ALAMAR} alamares`} />
        <Legend color="#FF0000" text={`Pedagógico · ${totals.PED_MEDALHA} medalhas, ${totals.PED_ALAMAR} alamares`} />
        <Legend color={GOLD} text={`Alamar dourado (comandante) · ${totals.DOURADO}`} />
        {canEdit && <span className="text-slate-500">Clique numa célula para conceder ou retirar; clique de novo para voltar ao automático. O ponto ● marca ajuste manual.</span>}
      </div>

      {loading ? <Loading /> : !turmas.length ? (
        <p className="text-center text-slate-500 py-12">Nenhum aluno encontrado.</p>
      ) : turmas.map((t, idx) => (
        <div key={t.classId}>
        {(idx === 0 || turmas[idx - 1].cia !== t.cia) && (
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-600 mb-2 mt-2">{t.ciaTitulo || t.cia}</h3>
        )}
        <div className="card mb-5 overflow-hidden">
          <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
            <h2 className="font-semibold">{t.name}</h2>
            <span className="text-xs text-slate-300">{t.students.length} alunos</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 border-b border-slate-200">
                  <th className="px-3 py-2 text-left w-10">Nº</th>
                  <th className="px-3 py-2 text-left">Nome</th>
                  <th className="px-3 py-2 text-right">Conceito</th>
                  <th className="px-3 py-2 text-right">Maior desc.</th>
                  <th className="px-3 py-2 text-center">TMDs</th>
                  <th className="px-3 py-2 text-center">Média 1º · 2º · 3º bim.</th>
                  <th className="px-3 py-2 text-right">Média ped.</th>
                  <th className="px-3 py-2 text-right">Menor nota</th>
                  <th className="px-2 py-2 text-center" colSpan={2}>Disciplinar</th>
                  <th className="px-2 py-2 text-center" colSpan={2}>Pedagógico</th>
                  <th className="px-2 py-2 text-center" title="Alamar dourado — concedido pelo comandante">Ouro</th>
                </tr>
                <tr className="text-[10px] uppercase text-slate-400 border-b border-slate-200">
                  <th colSpan={8} />
                  {FIELDS.map((f) => <th key={f} className="px-1 pb-1 text-center">{COLUMN_LABEL[f]}</th>)}
                  <th />
                </tr>
              </thead>
              <tbody>
                {t.students.map((s, i) => (
                  <tr key={s.studentId} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-1.5 text-slate-500">{s.callNumber || i + 1}</td>
                    <td className="px-3 py-1.5 font-medium text-slate-900">{s.name}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fmt(s.disc)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{s.maxDeduction ? fmt(s.maxDeduction) : '—'}</td>
                    <td className="px-3 py-1.5 text-center">{s.tmdCount || '—'}</td>
                    <td className="px-3 py-1.5 text-center text-slate-600 tabular-nums whitespace-nowrap">
                      {s.ped.bimesters.map((m, k) => (
                        <span key={k}>
                          {k > 0 && ' · '}
                          <span className={s.ped.incomplete.includes(k + 1) ? 'text-amber-700' : ''} title={s.ped.incomplete.includes(k + 1) ? 'Bimestre com menos disciplinas lançadas' : undefined}>{fmt(m)}</span>
                        </span>
                      ))}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-medium">{fmt(s.ped.avg)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{fmt(s.ped.minNote)}</td>
                    {FIELDS.map((f) => {
                      const on = s.final[f];
                      const manual = f in s.overrides;
                      const color = s.dourado && f.endsWith('ALAMAR') ? GOLD : COLOR[f];
                      const why = on
                        ? (manual ? 'Concedido manualmente' : f.endsWith('ALAMAR') && s.duplo ? 'Atende (alamar duplo)' : 'Atende aos critérios')
                        : (manual ? 'Retirado manualmente' : (s.why[f] || []).join('; ') || 'Não atende aos critérios');
                      return (
                        <td key={f} className="px-1 py-1 text-center">
                          <button
                            type="button" disabled={!canEdit} title={why} onClick={() => clickCell(s, f)}
                            className="relative inline-block w-12 h-6 border border-slate-400 align-middle disabled:cursor-default"
                            style={{ background: on || (s.dourado && f.endsWith('ALAMAR')) ? color : '#fff' }}
                          >
                            {manual && <span className="absolute -top-1 -right-0.5 text-[10px] leading-none text-slate-900">●</span>}
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-2 py-1 text-center">
                      <button
                        type="button" disabled={!canEdit} title="Alamar dourado (comandante)"
                        onClick={() => setOverride(s, 'DOURADO', s.dourado ? null : true)}
                        className={`disabled:cursor-default ${s.dourado ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'}`}
                      >
                        <Star size={16} fill={s.dourado ? 'currentColor' : 'none'} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </div>
      ))}

      <CriteriaModal open={critOpen} onClose={() => setCritOpen(false)} year={year} onSaved={() => { setCritOpen(false); load(true); }} />
      <ImportModal open={impOpen} onClose={() => setImpOpen(false)} onDone={() => load(true)} />
    </div>
  );
}

function Legend({ color, text }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-block w-4 h-4 border border-slate-400" style={{ background: color }} /> {text}
    </span>
  );
}

function CriteriaModal({ open, onClose, year, onSaved }) {
  const [c, setC] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setC(null);
    api.get('/honors/criteria', { params: { year } }).then((r) => setC(r.data.criteria)).catch(() => {});
  }, [open, year]);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/honors/criteria', c, { params: { year } });
      toast.success('Critérios salvos');
      onSaved?.();
    } catch { /* interceptor */ } finally { setSaving(false); }
  }
  const set = (k) => (e) => setC((x) => ({ ...x, [k]: e.target.value }));

  return (
    <Modal open={open} onClose={() => !saving && onClose()} title={`Critérios da portaria — ${year}`} subtitle="Os valores iniciais são os da Portaria nº 001/2025. Ajuste conforme a portaria do ano." size="lg">
      {!c ? <Loading /> : (
        <form onSubmit={save} className="space-y-5">
          {CRITERIA_FIELDS.map((g) => (
            <div key={g.group}>
              <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">{g.group}</p>
              <div className="grid sm:grid-cols-2 gap-3">
                {g.items.map((it) => (
                  <label key={it.k} className="text-sm">
                    <span className="block text-slate-600 mb-1">{it.label}</span>
                    <input type="number" step={it.step} className="input-field" value={c[it.k] ?? ''} onChange={set(it.k)} required />
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">“Nenhuma nota menor que” vale para</span>
              <select className="input-field" value={c.minNoteMode} onChange={set('minNoteMode')}>
                <option value="NOTAS">Cada nota de cada bimestre</option>
                <option value="MEDIA_DISCIPLINA">A média de cada disciplina</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">“Desconto de 1 ponto ou mais” conta</span>
              <select className="input-field" value={c.deductionMode} onChange={set('deductionMode')}>
                <option value="UNICO">Um único desconto (TMD ou suspensão)</option>
                <option value="SOMA">A soma dos descontos do ano</option>
              </select>
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Salvando...' : 'Salvar critérios'}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function ImportModal({ open, onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setFile(null); setRes(null); } }, [open]);

  async function send(f, apply) {
    setBusy(true);
    try {
      const { data } = await api.post(`/honors/import-boletim${apply ? '?apply=1' : ''}`, f, {
        headers: { 'Content-Type': 'application/pdf' }, timeout: 180000,
      });
      setRes(data);
      if (apply) { toast.success('Notas gravadas'); onDone?.(); }
    } catch { /* interceptor */ } finally { setBusy(false); }
  }

  function pick(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f); setRes(null);
    send(f, false);
  }

  return (
    <Modal open={open} onClose={() => !busy && onClose()} title="Importar boletim (PDF)" subtitle="PDF exportado do sistema de notas, com uma página por aluno. Pode ser de uma turma ou de todas." size="lg">
      <div className="space-y-4">
        <input type="file" accept="application/pdf,.pdf" onChange={pick} disabled={busy} className="block w-full text-sm" />
        {busy && <p className="text-sm text-slate-500">Lendo o PDF…</p>}
        {res && (
          <div className="space-y-3 text-sm">
            <div className="border border-slate-200 bg-slate-50 rounded-xl p-3">
              <p><b>{res.paginas}</b> boletins lidos · <b>{res.ligados}</b> ligados a alunos do sistema · <b>{res.semAluno.length}</b> sem aluno · ano <b>{res.year}</b></p>
              <p className="text-slate-600 mt-1">Alunos com notas: 1º bim. {res.porBimestre[0]} · 2º bim. {res.porBimestre[1]} · 3º bim. {res.porBimestre[2]} · 4º bim. {res.porBimestre[3]}</p>
            </div>
            {res.avisos.length > 0 && (
              <ul className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 list-disc pl-6">
                {res.avisos.map((a, i) => <li key={i} className="whitespace-pre-line">{a}</li>)}
              </ul>
            )}
            {res.semAluno.length > 0 && (
              <div className="border border-slate-200 rounded-xl p-3 max-h-40 overflow-y-auto">
                <p className="font-medium mb-1">Sem aluno no sistema (não serão gravados):</p>
                {res.semAluno.map((a, i) => <p key={i} className="text-slate-600">{a.nome} — {a.turma} ({a.matricula})</p>)}
              </div>
            )}
            {res.aplicado ? (
              <p className="text-emerald-700 font-medium">Notas gravadas. A prévia já foi atualizada.</p>
            ) : (
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancelar</button>
                <button type="button" className="btn-primary" onClick={() => send(file, true)} disabled={busy || !res.ligados}>Gravar notas de {res.ligados} alunos</button>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
