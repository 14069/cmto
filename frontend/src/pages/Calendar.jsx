import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalIcon } from 'lucide-react';
import api from '../lib/api.js';
import { Loading, PageHeader } from '../components/ui/Misc.jsx';

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export default function Calendar() {
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());
  const [data, setData] = useState({ occurrences: [], tacs: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); }, [month, year]);

  async function fetchData() {
    setLoading(true);
    try {
      const { data } = await api.get('/dashboard/calendar', { params: { month, year } });
      setData(data);
    } finally { setLoading(false); }
  }

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(year - 1); }
    else setMonth(month - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(year + 1); }
    else setMonth(month + 1);
  }

  // Construir grid do calendário
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const startWeekday = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function getEventsForDay(day) {
    if (!day) return [];
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const occs = data.occurrences.filter(o => o.occurredAt.startsWith(dateStr));
    const tacs = data.tacs.filter(t => t.startDate.startsWith(dateStr) || t.endDate.startsWith(dateStr));
    return { occs, tacs };
  }

  return (
    <div className="max-w-7xl mx-auto fade-in">
      <PageHeader
        title="Calendário Disciplinar"
        subtitle="Visualize ocorrências e prazos de TACs"
        breadcrumb="Sistema · Calendário"
      />

      <div className="card">
        <div className="flex items-center justify-between p-6 border-b border-slate-200 bg-slate-50 text-slate-900">
          <button onClick={prevMonth} className="p-2 hover:bg-slate-100 transition rounded"><ChevronLeft size={18} /></button>
          <div className="text-center">
            <h2 className="font-sans text-2xl">{MONTHS[month - 1]}</h2>
            <p className="text-xs uppercase tracking-widest text-slate-500">{year}</p>
          </div>
          <button onClick={nextMonth} className="p-2 hover:bg-slate-100 transition rounded"><ChevronRight size={18} /></button>
        </div>

        {loading ? <Loading /> : (
          <div className="p-4">
            <div className="grid grid-cols-7 gap-1 mb-2">
              {DAYS.map((d, i) => (
                <div key={i} className="text-center text-[10px] uppercase tracking-widest text-slate-500 py-2">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((day, i) => {
                if (!day) return <div key={i} />;
                const { occs, tacs } = getEventsForDay(day);
                const total = occs.length + tacs.length;
                const isToday = day === today.getDate() && month === today.getMonth() + 1 && year === today.getFullYear();

                return (
                  <div key={i} className={`min-h-[80px] p-2 border ${isToday ? 'border-solar-400 bg-solar-400/10' : 'border-slate-200'} hover:border-slate-200 transition`}>
                    <p className={`text-sm font-medium ${isToday ? 'text-amber-700' : 'text-slate-900'}`}>{day}</p>
                    {occs.slice(0, 2).map(o => (
                      <p key={o.id} className="text-[10px] bg-red-50 text-red-700 px-1 mt-1 truncate">
                        {o.student.name.split(' ')[0]}
                      </p>
                    ))}
                    {tacs.slice(0, 1).map(t => (
                      <p key={t.id} className="text-[10px] bg-slate-100 text-slate-600 px-1 mt-1 truncate">
                        TAC {t.student.name.split(' ')[0]}
                      </p>
                    ))}
                    {total > 3 && <p className="text-[10px] text-slate-500 mt-1">+{total - 3} mais</p>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Legenda */}
      <div className="flex gap-4 mt-4 text-xs text-slate-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-50" /> Ocorrência</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-slate-100" /> TAC</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 border-2 border-solar-400" /> Hoje</span>
      </div>
    </div>
  );
}
