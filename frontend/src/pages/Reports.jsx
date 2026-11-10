import { useState, useEffect } from 'react';
import { FileText, Download, Users, GraduationCap } from 'lucide-react';
import api, { openPdf } from '../lib/api.js';
import { Loading, PageHeader } from '../components/ui/Misc.jsx';
import { ScoreBadge } from '../components/ui/Score.jsx';

export default function Reports() {
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/classes').then(r => setClasses(r.data)),
      api.get('/students', { params: { status: 'ATIVO' } }).then(r => setStudents(r.data)),
    ]).finally(() => setLoading(false));
  }, []);

  const filteredStudents = students.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.registration.includes(search)
  );

  if (loading) return <Loading />;

  return (
    <div className="max-w-7xl mx-auto fade-in">
      <PageHeader
        title="Relatórios"
        subtitle="Gere relatórios em PDF de alunos e turmas"
        breadcrumb="Sistema · Relatórios"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Relatórios por turma */}
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <GraduationCap size={20} className="text-slate-500" />
            <h2 className="section-title">Relatórios por Turma</h2>
          </div>
          <p className="text-sm text-slate-600 mb-4">
            Ranking completo dos alunos da turma com conceito médio e estatísticas.
          </p>
          <div className="space-y-2">
            {classes.map(c => (
              <button
                type="button"
                key={c.id}
                onClick={() => openPdf(`/reports/class/${c.id}`)}
                className="w-full text-left flex items-center justify-between p-3 border border-slate-200 hover:border-slate-200 hover:bg-slate-50 transition group"
              >
                <div>
                  <p className="font-medium text-slate-900">{c.name}</p>
                  <p className="text-xs text-slate-500">{c.activeStudentsCount} alunos · Média {c.averageScore.toFixed(2)}</p>
                </div>
                <Download size={16} className="text-slate-500 group-hover:text-amber-700 transition" />
              </button>
            ))}
          </div>
        </div>

        {/* Relatórios individuais */}
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <Users size={20} className="text-slate-500" />
            <h2 className="section-title">Relatórios Individuais</h2>
          </div>
          <p className="text-sm text-slate-600 mb-4">
            Ficha completa do aluno: conceito, ocorrências, elogios e histórico.
          </p>
          <input
            type="text"
            className="input-field mb-3"
            placeholder="Buscar aluno..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filteredStudents.map(s => (
              <button
                type="button"
                key={s.id}
                onClick={() => openPdf(`/reports/student/${s.id}`)}
                className="w-full text-left flex items-center justify-between p-3 border border-slate-200 hover:border-slate-200 hover:bg-slate-50 transition group"
              >
                <div>
                  <p className="font-medium text-slate-900">{s.name}</p>
                  <p className="text-xs text-slate-500">{s.class.name} · Mat. {s.registration}</p>
                </div>
                <div className="flex items-center gap-3">
                  <ScoreBadge score={s.currentScore} size="sm" />
                  <Download size={16} className="text-slate-500 group-hover:text-amber-700 transition" />
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
