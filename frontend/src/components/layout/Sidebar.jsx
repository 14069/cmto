import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, GraduationCap, AlertTriangle, Award,
  FileText, ShieldCheck, Settings, LogOut, Calendar, ScrollText,
  ClipboardList, Medal,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLE_LABELS } from '../../lib/constants.js';

const NAV_GROUPS = [
  {
    label: 'Visão geral',
    items: [
      { to: '/', label: 'Painel geral', icon: LayoutDashboard, roles: ['ADMIN', 'COORD_DISCIPLINAR', 'COORD_PEDAGOGICO', 'MONITOR', 'PROFESSOR'] },
      { to: '/calendar', label: 'Calendário', icon: Calendar, roles: ['ADMIN', 'COORD_DISCIPLINAR', 'COORD_PEDAGOGICO', 'MONITOR'] },
    ],
  },
  {
    label: 'Gestão escolar',
    items: [
      { to: '/classes', label: 'Turmas', icon: GraduationCap, roles: ['ADMIN', 'COORD_DISCIPLINAR', 'COORD_PEDAGOGICO', 'MONITOR', 'PROFESSOR'] },
      { to: '/students', label: 'Alunos', icon: Users, roles: ['ADMIN', 'COORD_DISCIPLINAR', 'COORD_PEDAGOGICO', 'MONITOR', 'PROFESSOR'] },
    ],
  },
  {
    label: 'Disciplina',
    items: [
      { to: '/discipline', label: 'Ocorrências', icon: AlertTriangle, roles: ['ADMIN', 'COORD_DISCIPLINAR', 'COORD_PEDAGOGICO', 'MONITOR', 'PROFESSOR'] },
      { to: '/praises', label: 'Elogios', icon: Award, roles: ['ADMIN', 'COORD_DISCIPLINAR', 'COORD_PEDAGOGICO', 'MONITOR'] },
      { to: '/tac', label: 'TAC', icon: ScrollText, roles: ['ADMIN', 'COORD_DISCIPLINAR', 'COORD_PEDAGOGICO', 'MONITOR'] },
    ],
  },
  {
    label: 'Gestão e controle',
    items: [
      { to: '/daily-control', label: 'Controle Diário', icon: ClipboardList, roles: ['ADMIN', 'COORD_DISCIPLINAR', 'COORD_PEDAGOGICO', 'MONITOR'] },
      { to: '/reports', label: 'Relatórios', icon: FileText, roles: ['ADMIN', 'COORD_DISCIPLINAR', 'COORD_PEDAGOGICO', 'MONITOR'] },
      { to: '/honors', label: 'Condecorações', icon: Medal, roles: ['ADMIN', 'COORD_DISCIPLINAR', 'COORD_PEDAGOGICO'] },
      { to: '/users', label: 'Usuários', icon: ShieldCheck, roles: ['ADMIN'] },
      { to: '/audit', label: 'Auditoria', icon: ClipboardList, roles: ['ADMIN'] },
      { to: '/settings', label: 'Configurações', icon: Settings, roles: ['ADMIN'] },
    ],
  },
];

export default function Sidebar({ onClose }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const groups = NAV_GROUPS.map(group => ({ ...group, items: group.items.filter(i => i.roles.includes(user?.role)) })).filter(group => group.items.length);

  return (
    <aside className="w-64 bg-slate-50 text-slate-900 flex flex-col h-screen sticky top-0 border-r border-slate-200">
      {/* Logo */}
      <div className="px-5 pt-5 pb-4 border-b border-slate-100">
        <div className="brand-lockup">
          <div className="brand-mark">CM</div>
          <div className="min-w-0">
            <h1 className="font-sans text-[22px] leading-none text-slate-900">CMTO</h1>
            <p className="text-[11px] uppercase tracking-[.18em] text-amber-700 mt-1.5">Gestão Disciplinar</p>
          </div>
        </div>
        <div className="mt-4 px-3 py-2.5 rounded-xl bg-slate-100 border border-slate-100">
          <p className="text-[11px] uppercase tracking-[.14em] text-slate-500">Araguatins · TO</p>
          <p className="text-[11px] text-slate-700 mt-1 leading-relaxed">Colégio Militar do Estado do Tocantins</p>
          <p className="text-xs text-slate-500 mt-0.5">Professora Antonina Milhomem</p>
        </div>
      </div>

      {/* Navegação */}
      <nav className="flex-1 overflow-y-auto py-4">
        {groups.map(group => (
          <div key={group.label} className="mb-5">
            <p className="px-6 mb-2 text-[11px] uppercase tracking-[.18em] text-slate-500 font-semibold">{group.label}</p>
            {group.items.map(item => {
              const Icon = item.icon;
              return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-6 py-3 text-sm transition-all duration-200 border-l-2
                ${isActive
                  ? 'bg-slate-100 text-slate-900 border-solar-400'
                  : 'text-slate-600 border-transparent hover:bg-slate-50 hover:text-slate-900'
                }`
              }
            >
              <span className="nav-icon"><Icon size={16} strokeWidth={1.8} /></span>
              <span className="tracking-wide flex-1">{item.label}</span>
            </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Usuário */}
      <div className="border-t border-slate-100 p-4 bg-slate-50">
        <div
          className="flex items-center gap-3 mb-3 cursor-pointer hover:bg-slate-50 p-2 -m-2 rounded transition"
          onClick={() => navigate('/profile')}
        >
          <div className="avatar avatar-gold">
            {user?.name?.[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate text-slate-900">{user?.name}</p>
            <p className="text-xs uppercase tracking-wider text-slate-500">
              {ROLE_LABELS[user?.role]}
            </p>
          </div>
        </div>
        <button
          onClick={() => { logout(); navigate('/login'); }}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-xs uppercase tracking-wider rounded-xl
                     text-slate-600 border border-slate-200 hover:bg-slate-100 hover:text-slate-900 hover:border-slate-200 transition"
        >
          <LogOut size={14} />
          Sair
        </button>
      </div>
    </aside>
  );
}
