import { useState, useEffect, useRef, useCallback } from 'react';
import { Sparkles, BookOpen, ChevronDown, ChevronUp, AlertCircle, Loader2, Check } from 'lucide-react';
import api from '../../lib/api.js';

const NATUREZA_COLORS = {
  LEVE: 'border-amber-200 bg-amber-50 text-amber-700',
  MEDIA: 'border-orange-200 bg-orange-50 text-orange-700',
  GRAVE: 'border-red-200 bg-red-50 text-red-700',
  GRAVISSIMO: 'border-red-200 bg-red-50 text-red-700',
};

const NATUREZA_LABELS = {
  LEVE: 'Leve',
  MEDIA: 'Médio',
  GRAVE: 'Grave',
  GRAVISSIMO: 'Gravíssimo / Eliminatório',
};

const RELEVANCIA_ORDER = { ALTA: 0, MEDIA: 1, BAIXA: 2 };
const RELEVANCIA_COLORS = {
  ALTA: 'bg-slate-200 text-slate-900 border-slate-200',
  MEDIA: 'bg-solar-400/20 text-amber-700 border-solar-400/50',
  BAIXA: 'bg-slate-100 text-slate-500 border-slate-200',
};

/**
 * Componente que analisa a descrição da ocorrência e sugere artigos do regimento
 * Props:
 *  - descricao: string (texto da ocorrência sendo digitado)
 *  - onSelect: ({ artigo, inciso, natureza, texto }) => void
 *  - disabled: boolean
 */
export default function ArticleRecommender({ descricao, onSelect, disabled }) {
  const [recomendacoes, setRecomendacoes] = useState([]);
  const [naturezaSugerida, setNaturezaSugerida] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState(null);
  const [lastSearched, setLastSearched] = useState('');
  const debounceRef = useRef(null);

  const buscar = useCallback(async (texto) => {
    if (texto.trim().length < 10 || texto === lastSearched) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post('/regimento/recommend-article', { descricao: texto });
      setRecomendacoes(data.recomendacoes || []);
      setNaturezaSugerida(data.naturezaSugerida || null);
      setLastSearched(texto);
      if ((data.recomendacoes || []).length > 0) setExpanded(true);
    } catch (err) {
      setError('Não foi possível consultar a IA. Verifique sua conexão.');
    } finally {
      setLoading(false);
    }
  }, [lastSearched]);

  // Debounce: espera 1.5s após parar de digitar
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!descricao || descricao.trim().length < 10) {
      setRecomendacoes([]);
      setNaturezaSugerida(null);
      return;
    }
    debounceRef.current = setTimeout(() => buscar(descricao), 1500);
    return () => clearTimeout(debounceRef.current);
  }, [descricao]);

  function handleSelect(rec) {
    setSelected(rec);
    onSelect?.(rec);
    setExpanded(false);
  }

  const hasResults = recomendacoes.length > 0;

  return (
    <div className={`border rounded-none transition-all ${
      hasResults ? 'border-solar-400/50 bg-solar-400/5' : 'border-slate-200 bg-slate-50'
    }`}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between p-3 text-left"
        disabled={!hasResults && !loading}
      >
        <div className="flex items-center gap-2">
          {loading ? (
            <Loader2 size={15} className="animate-spin text-amber-700" />
          ) : hasResults ? (
            <Sparkles size={15} className="text-amber-700" />
          ) : (
            <BookOpen size={15} className="text-slate-500" />
          )}
          <span className="text-xs uppercase tracking-widest font-medium text-slate-900">
            {loading && 'Consultando regimento...'}
            {!loading && !hasResults && descricao?.length >= 10 && !error && 'Aguardando análise...'}
            {!loading && !hasResults && (!descricao || descricao.length < 10) && 'Recomendação de artigos (digite a descrição)'}
            {!loading && hasResults && `${recomendacoes.length} artigo(s) recomendado(s) pelo regimento`}
            {!loading && error && 'Erro ao consultar IA'}
          </span>
          {naturezaSugerida && !loading && (
            <span className={`badge text-[10px] ml-1 ${NATUREZA_COLORS[naturezaSugerida]}`}>
              Natureza sugerida: {NATUREZA_LABELS[naturezaSugerida]}
            </span>
          )}
        </div>
        {hasResults && (
          expanded ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />
        )}
      </button>

      {error && (
        <div className="px-3 pb-3 flex items-center gap-2 text-xs text-red-700">
          <AlertCircle size={13} />
          {error}
          <button
            type="button"
            onClick={() => buscar(descricao)}
            className="underline hover:no-underline ml-1"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Selected badge */}
      {selected && !expanded && (
        <div className="px-3 pb-3">
          <div className="flex items-center gap-2 text-xs bg-slate-100 border border-slate-200 text-slate-900 px-3 py-2">
            <Check size={12} className="text-amber-700" />
            <span>
              Art. {selected.artigo}, inciso {selected.inciso} ({NATUREZA_LABELS[selected.natureza]}) selecionado
            </span>
            <button
              type="button"
              onClick={() => { setSelected(null); onSelect?.(null); setExpanded(true); }}
              className="ml-auto text-slate-500 hover:text-slate-900 transition"
            >
              trocar
            </button>
          </div>
        </div>
      )}

      {/* Lista de recomendações */}
      {expanded && hasResults && (
        <div className="border-t border-slate-200 divide-y divide-slate-200">
          <p className="px-3 py-2 text-[10px] uppercase tracking-widest text-slate-500">
            Clique para selecionar o artigo que melhor descreve a infração:
          </p>
          {recomendacoes
            .sort((a, b) => RELEVANCIA_ORDER[a.relevancia] - RELEVANCIA_ORDER[b.relevancia])
            .map((rec, idx) => (
            <div
              key={idx}
              onClick={() => handleSelect(rec)}
              className={`p-4 cursor-pointer hover:bg-slate-50 transition group ${
                selected?.artigo === rec.artigo && selected?.inciso === rec.inciso
                  ? 'bg-solar-400/10 border-l-4 border-l-solar-400'
                  : ''
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <span className={`badge text-[10px] ${RELEVANCIA_COLORS[rec.relevancia]}`}>
                    {rec.relevancia}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-medium text-sm text-slate-900">
                      Art. {rec.artigo}, inciso {rec.inciso}
                    </span>
                    <span className={`badge text-[10px] border ${NATUREZA_COLORS[rec.natureza]}`}>
                      {NATUREZA_LABELS[rec.natureza]}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {rec.texto}
                  </p>
                  {rec.justificativa && (
                    <p className="text-[10px] text-slate-500 mt-1 italic">
                      💡 {rec.justificativa}
                    </p>
                  )}
                </div>
                <div className="flex-shrink-0">
                  {selected?.artigo === rec.artigo && selected?.inciso === rec.inciso ? (
                    <Check size={16} className="text-amber-700" />
                  ) : (
                    <div className="w-4 h-4 border border-slate-200 group-hover:border-solar-400 transition" />
                  )}
                </div>
              </div>
            </div>
          ))}
          <p className="px-3 py-2 text-[10px] text-slate-500 italic">
            Análise gerada por IA com base no Regimento Escolar CMTO. Confirme com a coordenação disciplinar.
          </p>
        </div>
      )}
    </div>
  );
}
