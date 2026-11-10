import { useState, useRef, useCallback } from 'react';
import { Upload, FileText, Check, X, AlertTriangle, ChevronDown, ChevronUp, Loader2, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api.js';

const FIELD_MAP = {
  matricula: 'registration', registration: 'registration', ra: 'registration',
  'numero': 'registration',
  nome: 'name', name: 'name', 'nome completo': 'name',
  turma: 'className', 'nome da turma': 'className', serie: 'className',
  'ano letivo': 'schoolYear', ano: 'schoolYear',
  turno: 'shift', shift: 'shift',
  nascimento: 'birthDate', 'data de nascimento': 'birthDate',
  responsavel: 'guardianName', 'nome do responsavel': 'guardianName',
  parentesco: 'guardianRelation', relacao: 'guardianRelation',
  telefone: 'guardianPhone', celular: 'guardianPhone', fone: 'guardianPhone',
  email: 'guardianEmail', 'e-mail': 'guardianEmail',
  cidade: 'city', city: 'city',
  estado: 'state', uf: 'state',
};

const REQUIRED_FIELDS = ['registration', 'name', 'className'];

const FIELD_LABELS = {
  registration: 'Matrícula *',
  name: 'Nome *',
  className: 'Turma *',
  schoolYear: 'Ano Letivo',
  shift: 'Turno',
  birthDate: 'Data de Nascimento',
  guardianName: 'Nome do Responsável',
  guardianRelation: 'Parentesco',
  guardianPhone: 'Telefone',
  guardianEmail: 'E-mail',
  city: 'Cidade',
  state: 'Estado/UF',
};

function normalizeKey(h) {
  return h.trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, '').trim();
}

function parseCSV(text) {
  const firstLine = text.split('\n')[0];
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';

  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) throw new Error('Arquivo precisa ter pelo menos um cabeçalho e uma linha de dados');

  const rawHeaders = lines[0].split(delimiter).map(h => h.replace(/^["']|["']$/g, '').trim());

  const headerMap = {};
  const unmapped = [];

  rawHeaders.forEach((h, i) => {
    const norm = normalizeKey(h);
    const field = FIELD_MAP[norm];
    if (field) headerMap[i] = field;
    else unmapped.push(h);
  });

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delimiter).map(c => c.replace(/^["']|["']$/g, '').trim());
    if (cols.every(c => !c)) continue;
    const row = {};
    Object.entries(headerMap).forEach(([idx, field]) => {
      row[field] = cols[parseInt(idx)] || '';
    });
    rows.push(row);
  }

  return { rows, unmapped, headerMap, rawHeaders };
}

export default function ImportModal({ open, onClose, onImported }) {
  const [step, setStep] = useState('upload');
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [columnMapping, setColumnMapping] = useState({});
  const [previewResult, setPreviewResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [showWarnings, setShowWarnings] = useState(false);
  const [doneResult, setDoneResult] = useState(null);
  const fileRef = useRef();

  const reset = useCallback(() => {
    setStep('upload');
    setFile(null);
    setParsed(null);
    setColumnMapping({});
    setPreviewResult(null);
    setDoneResult(null);
    setShowErrors(false);
    setShowWarnings(false);
  }, []);

  function handleClose() {
    reset();
    onClose();
  }

  async function handleFile(f) {
    if (!f) return;
    setFile(f);
    const text = await f.text();
    try {
      const result = parseCSV(text);
      setParsed(result);
      const initial = {};
      result.rawHeaders.forEach((h, i) => {
        const norm = normalizeKey(h);
        const field = FIELD_MAP[norm];
        if (field) initial[i] = field;
      });
      setColumnMapping(initial);
      setStep('mapping');
    } catch (err) {
      toast.error(err.message);
    }
  }

  function remapRows() {
    const rows = parsed.rows.map(originalRow => {
      const newRow = {};
      parsed.rawHeaders.forEach((header, idx) => {
        const field = columnMapping[idx];
        if (field) {
          const oldField = FIELD_MAP[normalizeKey(header)];
          newRow[field] = oldField ? originalRow[oldField] : '';
        }
      });
      return newRow;
    });
    return rows;
  }

  async function handlePreview() {
    setLoading(true);
    try {
      const rows = remapRows();
      const { data } = await api.post('/import/preview', { rows });
      setPreviewResult(data);
      setStep('preview');
    } catch {} finally { setLoading(false); }
  }

  async function handleCommit() {
    setLoading(true);
    try {
      const rows = remapRows();
      const { data } = await api.post('/import/commit', { rows });
      setDoneResult(data);
      setStep('done');
      toast.success(`Importação concluída! ${data.created} criados, ${data.updated} atualizados.`);
      onImported?.();
    } catch {} finally { setLoading(false); }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-16">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full max-w-4xl bg-slate-50 border border-slate-200 shadow-2xl fade-in my-8">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 bg-slate-50">
          <div>
            <h2 className="font-sans text-2xl text-slate-900">Importar Alunos via CSV</h2>
            <p className="text-slate-500 text-sm mt-1">
              {step === 'upload' && 'Selecione o arquivo CSV exportado do seu sistema atual'}
              {step === 'mapping' && 'Confirme o mapeamento das colunas'}
              {step === 'preview' && 'Revise os dados antes de confirmar'}
              {step === 'done' && 'Importação concluída'}
            </p>
          </div>
          <button onClick={handleClose} className="text-slate-500 hover:text-slate-900 transition">
            <X size={22} />
          </button>
        </div>

        {/* Steps */}
        <div className="flex border-b border-slate-200">
          {[
            { key: 'upload', label: '1. Arquivo' },
            { key: 'mapping', label: '2. Colunas' },
            { key: 'preview', label: '3. Revisão' },
            { key: 'done', label: '4. Concluído' },
          ].map(s => (
            <div
              key={s.key}
              className={`flex-1 py-3 text-center text-xs uppercase tracking-widest
                ${step === s.key ? 'border-b-2 border-solar-400 text-slate-900 font-medium'
                  : 'text-slate-500'}`}
            >
              {s.label}
            </div>
          ))}
        </div>

        <div className="p-6">
          {/* STEP 1: Upload */}
          {step === 'upload' && (
            <div>
              <div className="bg-blue-50 border border-blue-200 p-4 mb-6 text-sm">
                <div className="flex gap-2">
                  <Info size={16} className="text-blue-700 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-blue-700 mb-2">Como preparar seu arquivo CSV</p>
                    <p className="text-blue-700 mb-1">O arquivo pode usar <strong>vírgula (,)</strong> ou <strong>ponto-e-vírgula (;)</strong> como separador.</p>
                    <p className="text-blue-700 mb-2">Os nomes das colunas são detectados automaticamente. Colunas sugeridas:</p>
                    <div className="grid grid-cols-3 gap-1 text-xs text-blue-700 font-mono">
                      {Object.entries(FIELD_LABELS).map(([k, v]) => (
                        <span key={k}>{v.replace(' *', '')}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
                className="border-2 border-dashed border-slate-200 p-12 text-center cursor-pointer hover:border-solar-400 transition group"
              >
                <Upload size={40} className="mx-auto text-slate-500 group-hover:text-amber-700 transition mb-4" />
                <p className="text-slate-900 font-medium">Arraste o arquivo CSV aqui</p>
                <p className="text-slate-500 text-sm mt-1">ou clique para selecionar</p>
                <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden"
                  onChange={(e) => handleFile(e.target.files[0])} />
              </div>

              <div className="mt-4 text-center">
                <button
                  onClick={() => {
                    const csv = 'Matricula;Nome;Turma;Ano Letivo;Turno;Nascimento;Responsavel;Parentesco;Telefone;Email;Cidade;Estado\n2026001;João da Silva;9º Ano A;2026;Matutino;15/03/2010;Maria da Silva;Mãe;(63) 99999-0001;mae@email.com;Araguatins;TO';
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
                    a.download = 'modelo-importacao-cmto.csv';
                    a.click();
                  }}
                  className="text-xs uppercase tracking-wider text-slate-500 hover:text-amber-700 flex items-center gap-1 mx-auto transition"
                >
                  <FileText size={12} /> Baixar modelo CSV
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Mapeamento */}
          {step === 'mapping' && parsed && (
            <div>
              <p className="text-sm text-slate-600 mb-4">
                Arquivo: <strong className="text-slate-900">{file?.name}</strong> — <strong className="text-slate-900">{parsed.rows.length}</strong> linha(s) detectada(s)
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-sm mb-4">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-widest">
                      <th className="text-left py-2 px-4">Coluna no CSV</th>
                      <th className="text-left py-2 px-4">Exemplo</th>
                      <th className="text-left py-2 px-4">Mapear para</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rawHeaders.map((header, idx) => {
                      const firstRow = parsed.rows[0];
                      const field = FIELD_MAP[normalizeKey(header)];
                      const exampleValue = field ? firstRow[field] : '—';

                      return (
                        <tr key={idx} className={`border-b border-slate-200 ${idx % 2 !== 0 ? 'bg-slate-50' : ''}`}>
                          <td className="py-2 px-4 font-mono text-xs text-slate-900">{header}</td>
                          <td className="py-2 px-4 text-slate-500 text-xs truncate max-w-[150px]">{exampleValue || '—'}</td>
                          <td className="py-2 px-4">
                            <select
                              className="input-field py-1 text-xs"
                              value={columnMapping[idx] || ''}
                              onChange={(e) => setColumnMapping({ ...columnMapping, [idx]: e.target.value || null })}
                            >
                              <option value="">— Ignorar coluna —</option>
                              {Object.entries(FIELD_LABELS).map(([k, v]) => (
                                <option key={k} value={k}>{v}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {(() => {
                const mappedFields = Object.values(columnMapping).filter(Boolean);
                const missing = REQUIRED_FIELDS.filter(f => !mappedFields.includes(f));
                if (missing.length > 0) {
                  return (
                    <div className="bg-red-50 border border-red-200 p-3 mb-4 text-xs text-red-700 flex gap-2">
                      <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                      <span>Campos obrigatórios sem mapeamento: <strong>{missing.map(f => FIELD_LABELS[f]).join(', ')}</strong></span>
                    </div>
                  );
                }
                return null;
              })()}

              <div className="flex justify-between">
                <button className="btn-secondary" onClick={reset}>Voltar</button>
                <button
                  className="btn-primary flex items-center gap-2"
                  onClick={handlePreview}
                  disabled={loading || !REQUIRED_FIELDS.every(f => Object.values(columnMapping).includes(f))}
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                  Pré-visualizar Importação
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Preview */}
          {step === 'preview' && previewResult && (
            <div>
              <div className="grid grid-cols-4 gap-3 mb-6">
                {[
                  { label: 'Serão criados', value: previewResult.created, color: 'text-emerald-700' },
                  { label: 'Serão atualizados', value: previewResult.updated, color: 'text-blue-700' },
                  { label: 'Com avisos', value: previewResult.warnings.length, color: 'text-amber-700' },
                  { label: 'Com erros', value: previewResult.errors.length, color: 'text-red-700' },
                ].map(m => (
                  <div key={m.label} className="card p-4 text-center">
                    <p className={`font-sans text-3xl font-semibold ${m.color}`}>{m.value}</p>
                    <p className="text-xs uppercase tracking-widest text-slate-500 mt-1">{m.label}</p>
                  </div>
                ))}
              </div>

              {previewResult.errors.length > 0 && (
                <div className="mb-4">
                  <button
                    className="flex items-center gap-2 text-sm font-medium text-red-700 mb-2"
                    onClick={() => setShowErrors(!showErrors)}
                  >
                    <AlertTriangle size={14} />
                    {previewResult.errors.length} erro(s) — linhas que NÃO serão importadas
                    {showErrors ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  {showErrors && (
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {previewResult.errors.map((e, i) => (
                        <div key={i} className="bg-red-50 border border-red-200 p-2 text-xs text-red-700">
                          Linha {e.row}: {e.message}
                          {e.data?.registration && ` (mat. ${e.data.registration})`}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {previewResult.warnings.length > 0 && (
                <div className="mb-4">
                  <button
                    className="flex items-center gap-2 text-sm font-medium text-amber-700 mb-2"
                    onClick={() => setShowWarnings(!showWarnings)}
                  >
                    <AlertTriangle size={14} />
                    {previewResult.warnings.length} aviso(s) — matrículas já existentes serão atualizadas
                    {showWarnings ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  {showWarnings && (
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {previewResult.warnings.map((w, i) => (
                        <div key={i} className="bg-amber-50 border border-amber-200 p-2 text-xs text-amber-700">
                          Linha {w.row}: {w.message}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="max-h-60 overflow-auto mb-6">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500 sticky top-0">
                    <tr>
                      <th className="py-2 px-3 text-left">Linha</th>
                      <th className="py-2 px-3 text-left">Ação</th>
                      <th className="py-2 px-3 text-left">Matrícula</th>
                      <th className="py-2 px-3 text-left">Nome</th>
                      <th className="py-2 px-3 text-left">Turma</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewResult.preview.map((p, i) => (
                      <tr key={i} className={`border-b border-slate-200 ${i % 2 !== 0 ? 'bg-slate-50' : ''}`}>
                        <td className="py-1.5 px-3 text-slate-500">{p.row}</td>
                        <td className="py-1.5 px-3">
                          <span className={`badge ${p.action === 'CREATE' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                            {p.action === 'CREATE' ? 'Criar' : 'Atualizar'}
                          </span>
                        </td>
                        <td className="py-1.5 px-3 font-mono text-slate-900">{p.registration}</td>
                        <td className="py-1.5 px-3 text-slate-900">{p.name}</td>
                        <td className="py-1.5 px-3 text-slate-600">
                          {p.className}
                          {p.classIsNew && <span className="ml-1 text-[10px] text-amber-700">(nova)</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {previewResult.errors.length > 0 && previewResult.created === 0 && previewResult.updated === 0 ? (
                <div className="bg-red-50 border border-red-200 p-3 text-sm text-red-700 mb-4">
                  Todos os registros têm erros. Corrija o arquivo e tente novamente.
                </div>
              ) : null}

              <div className="flex justify-between">
                <button className="btn-secondary" onClick={() => setStep('mapping')}>Voltar</button>
                <button
                  className="btn-primary flex items-center gap-2"
                  onClick={handleCommit}
                  disabled={loading || (previewResult.created === 0 && previewResult.updated === 0)}
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  Confirmar Importação ({previewResult.created + previewResult.updated} registros)
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Done */}
          {step === 'done' && doneResult && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-slate-100 border border-slate-200 flex items-center justify-center mx-auto mb-4">
                <Check size={32} className="text-amber-700" />
              </div>
              <h3 className="font-sans text-2xl text-slate-900 mb-2">Importação Concluída!</h3>
              <div className="flex justify-center gap-8 mt-6 mb-8">
                <div className="text-center">
                  <p className="font-sans text-4xl text-emerald-700">{doneResult.created}</p>
                  <p className="text-xs uppercase tracking-widest text-slate-500 mt-1">Alunos criados</p>
                </div>
                <div className="text-center">
                  <p className="font-sans text-4xl text-blue-700">{doneResult.updated}</p>
                  <p className="text-xs uppercase tracking-widest text-slate-500 mt-1">Atualizados</p>
                </div>
                {doneResult.skipped > 0 && (
                  <div className="text-center">
                    <p className="font-sans text-4xl text-red-700">{doneResult.skipped}</p>
                    <p className="text-xs uppercase tracking-widest text-slate-500 mt-1">Ignorados</p>
                  </div>
                )}
              </div>
              <div className="flex gap-3 justify-center">
                <button className="btn-secondary" onClick={reset}>Importar outro arquivo</button>
                <button className="btn-primary" onClick={handleClose}>Fechar</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
