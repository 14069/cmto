import { Check, Users, X } from 'lucide-react';

export default function StudentMultiPicker({
  classes = [],
  students = [],
  classId,
  onClassChange,
  selectedIds = [],
  onToggle,
  onRemove,
  loading = false,
  selectedStudents = [],
}) {

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Users size={16} className="text-amber-700" />
          <div>
            <p className="text-sm font-semibold text-slate-900">Seleção de alunos</p>
            <p className="text-xs text-slate-500">Escolha uma turma e marque quem receberá o lançamento.</p>
          </div>
          <span className="ml-auto rounded-full bg-solar-400/15 px-3 py-1 text-xs font-bold text-amber-700">
            {selectedIds.length} selecionado{selectedIds.length === 1 ? '' : 's'}
          </span>
        </div>

        <label className="label-field">Turma</label>
        <select className="input-field" value={classId || ''} onChange={e => onClassChange(e.target.value)}>
          <option value="">Selecione a turma...</option>
          {classes.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {selectedIds.length > 0 && (
        <div className="rounded-xl border border-solar-400/30 bg-solar-400/5 p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Lista mantida</p>
            <p className="text-[11px] text-slate-500">Trocar de turma não remove estes alunos.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedStudents.map(s => {
              return (
                <span key={s.id} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900">
                  <span className="max-w-[220px] truncate">{s.name}</span>
                  <span className="text-slate-500">{s.class?.name}</span>
                  <button type="button" onClick={() => onRemove(s.id)} className="text-slate-500 hover:text-red-700" title="Remover da seleção">
                    <X size={13} />
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {classId && (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-slate-900">Alunos da turma selecionada</p>
              <p className="text-xs text-slate-500">Clique para selecionar ou retirar da lista.</p>
            </div>
            <span className="text-xs text-slate-500">{students.length} aluno(s)</span>
          </div>
          <div className="max-h-56 overflow-y-auto divide-y divide-slate-200">
            {loading ? (
              <div className="p-6 text-center text-sm text-slate-500">Carregando alunos...</div>
            ) : students.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">Nenhum aluno ativo nesta turma.</div>
            ) : students.map(s => {
              const checked = selectedIds.includes(s.id);
              return (
                <button key={s.id} type="button" onClick={() => onToggle(s)} className={`w-full flex items-center gap-3 px-4 py-3 text-left transition ${checked ? 'bg-solar-400/10' : 'hover:bg-slate-50'}`}>
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${checked ? 'border-solar-400 bg-solar-400 text-slate-900' : 'border-slate-200 text-transparent'}`}>
                    <Check size={13} strokeWidth={3} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">{s.name}</span>
                    <span className="block text-[11px] text-slate-500">Matrícula: {s.registration}</span>
                  </span>
                  {checked && <span className="text-xs font-semibold text-amber-700">Selecionado</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
