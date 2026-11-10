import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, GraduationCap, AlertTriangle, Award, Clock,
  TrendingDown, ScrollText, ArrowRight, ChevronRight,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import api from '../lib/api.js';
import { Loading, PageHeader } from '../components/ui/Misc.jsx';
import { ScoreBadge, ScoreBar } from '../components/ui/Score.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { timeAgo, formatDate } from '../lib/constants.js';

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/dashboard/overview')
      .then(({ data }) => setData(data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading message="Carregando painel..." />;
  if (!data) return null;

  const { metrics, studentsAtRisk, recentOccurrences, occurrencesByType, thresholds } = data;

  const typeData = occurrencesByType.map(o => ({
    name: o.type === 'ANOTACAO' ? 'Anotações'
        : o.type === 'TMD' ? 'TMD'
        : 'Suspensões',
    count: o._count,
    color: o.type === 'ANOTACAO' ? '#fbbf24'
         : o.type === 'TMD' ? '#f59e0b'
         : '#ef4444',
  }));

  return (
    <div className="max-w-7xl mx-auto fade-in">
      <PageHeader
        title={`Bem-vindo(a), ${user?.name?.split(' ')[0]}`}
        subtitle="Painel geral do sistema disciplinar"
        breadcrumb="Início"
      />

      {/* Cartões principais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <MetricCard
          icon={Users}
          label="Alunos Ativos"
          value={metrics.totalStudents}
          accent="primary"
          link="/students"
        />
        <MetricCard
          icon={GraduationCap}
          label="Turmas"
          value={metrics.totalClasses}
          accent="primary"
          link="/classes"
        />
        <MetricCard
          icon={AlertTriangle}
          label="Em Atenção"
          value={metrics.attentionStudents}
          accent="warning"
          sub={`Conceito < ${thresholds.attention.toFixed(1)}`}
        />
        <MetricCard
          icon={TrendingDown}
          label="Críticos"
          value={metrics.criticalStudents}
          accent="danger"
          sub={`Conceito < ${thresholds.critical.toFixed(1)}`}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <MetricCard
          icon={Clock}
          label="Aprovações Pendentes"
          value={metrics.pendingApprovals}
          link="/discipline?status=PENDENTE_APROVACAO"
        />
        <MetricCard
          icon={ScrollText}
          label="TACs Ativos"
          value={metrics.activeTacs}
          link="/tac"
        />
        <MetricCard
          icon={AlertTriangle}
          label="Ocorrências (30d)"
          value={metrics.totalOccurrences}
        />
        <MetricCard
          icon={Award}
          label="Elogios (30d)"
          value={metrics.totalPraises}
          accent="solar"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna esquerda - Alunos em risco */}
        <div className="lg:col-span-2 card p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="section-title">Alunos em Risco</h2>
              <p className="text-sm text-slate-500 mt-1">
                Conceito abaixo de {thresholds.attention.toFixed(1)}
              </p>
            </div>
            <Link to="/students?scoreLevel=critico" className="text-xs uppercase tracking-wider text-slate-600 hover:text-amber-700 flex items-center gap-1 transition">
              Ver todos <ArrowRight size={12} />
            </Link>
          </div>

          {studentsAtRisk.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <p className="text-sm">Nenhum aluno em situação de risco no momento.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {studentsAtRisk.map(s => (
                <Link
                  key={s.id}
                  to={`/students/${s.id}`}
                  className="flex items-center gap-4 p-4 border border-slate-200 hover:border-slate-200 hover:bg-slate-50 transition group rounded"
                >
                  <div className="w-10 h-10 bg-slate-200 flex items-center justify-center font-sans text-slate-900 font-semibold rounded">
                    {s.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-slate-900 truncate">{s.name}</p>
                    <p className="text-xs text-slate-500">{s.class.name} · Mat. {s.registration}</p>
                    <div className="mt-1.5 max-w-[160px]">
                      <ScoreBar score={s.currentScore} thresholds={thresholds} />
                    </div>
                  </div>
                  <ScoreBadge score={s.currentScore} size="lg" thresholds={thresholds} />
                  <ChevronRight size={16} className="text-slate-500 group-hover:text-slate-900 transition" />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Coluna direita - Estatísticas */}
        <div className="space-y-6">
          {/* Conceito médio */}
          <div className="card p-6 bg-slate-50 border-slate-200">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">
              Conceito Médio Geral
            </p>
            <p className="font-sans text-6xl font-semibold text-amber-700">
              {metrics.averageScore.toFixed(2)}
            </p>
            <div className="w-12 h-0.5 bg-solar-400 mt-3 mb-3" />
            <p className="text-xs text-slate-500">
              Média ponderada dos {metrics.totalStudents} alunos ativos
            </p>
          </div>

          {/* Distribuição de ocorrências */}
          <div className="card p-6">
            <h3 className="section-title text-lg mb-4">Distribuição (30 dias)</h3>
            {typeData.length === 0 ? (
              <p className="text-sm text-slate-500">Sem dados.</p>
            ) : (
              <div style={{ width: '100%', height: 180 }}>
                <ResponsiveContainer>
                  <BarChart data={typeData} layout="vertical" margin={{ left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: '#64748b' }} width={80} />
                    <Tooltip
                      contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', color: '#172033', borderRadius: 10 }}
                      cursor={{ fill: 'rgba(251, 191, 36, 0.08)' }}
                    />
                    <Bar dataKey="count" radius={2}>
                      {typeData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Ocorrências recentes */}
      <div className="card p-6 mt-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="section-title">Ocorrências Recentes</h2>
            <p className="text-sm text-slate-500 mt-1">Últimos registros disciplinares</p>
          </div>
          <Link to="/discipline" className="text-xs uppercase tracking-wider text-slate-600 hover:text-amber-700 flex items-center gap-1 transition">
            Ver todas <ArrowRight size={12} />
          </Link>
        </div>

        {recentOccurrences.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-4">Sem ocorrências recentes.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="py-2 pr-4 font-medium text-[10px] uppercase tracking-widest text-slate-500">Aluno</th>
                  <th className="py-2 pr-4 font-medium text-[10px] uppercase tracking-widest text-slate-500">Tipo</th>
                  <th className="py-2 pr-4 font-medium text-[10px] uppercase tracking-widest text-slate-500">Categoria</th>
                  <th className="py-2 pr-4 font-medium text-[10px] uppercase tracking-widest text-slate-500">Quando</th>
                </tr>
              </thead>
              <tbody>
                {recentOccurrences.map(o => (
                  <tr key={o.id} className="border-b border-slate-200 hover:bg-slate-50 transition">
                    <td className="py-3 pr-4">
                      <Link to={`/students/${o.student.id}`} className="text-slate-900 hover:text-amber-700 font-medium transition">
                        {o.student.name}
                      </Link>
                      <p className="text-xs text-slate-500">{o.student.class.name}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="text-xs uppercase tracking-wider text-slate-600">
                        {o.type === 'TMD' ? `TMD ${o.tmdLevel}` : o.type}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-slate-600">{o.category?.name || '—'}</td>
                    <td className="py-3 pr-4 text-slate-500 text-xs">{timeAgo(o.occurredAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, sub, accent, link }) {
  const accentColors = {
    primary: 'text-slate-600',
    warning: 'text-amber-700',
    danger: 'text-red-700',
    solar: 'text-amber-700',
  };
  const Wrapper = link ? Link : 'div';
  const wrapperProps = link ? { to: link } : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={`card metric-card p-5 group rounded-2xl ${link ? 'hover:border-slate-200 hover:bg-slate-50 transition cursor-pointer' : ''}`}
    >
      <div className="flex items-start justify-between mb-5">
        <div className="metric-icon">
          <Icon size={17} className={accentColors[accent] || 'text-slate-500'} strokeWidth={1.8} />
        </div>
        {link && <ArrowRight size={15} className="text-slate-500 group-hover:text-amber-700 transition" />}
      </div>
      <p className="font-sans metric-value font-semibold text-slate-900">{value}</p>
      <p className="text-[10px] uppercase tracking-[.16em] text-slate-500 mt-2">{label}</p>
      {sub && <p className="text-[11px] text-slate-500 mt-1">{sub}</p>}
    </Wrapper>
  );
}
