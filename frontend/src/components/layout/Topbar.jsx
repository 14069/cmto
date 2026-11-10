import { useState, useEffect } from 'react';
import { Bell, Menu } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../../lib/api.js';
import { timeAgo } from '../../lib/constants.js';

export default function Topbar({ onMenuClick }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    fetchUnread();
    const interval = setInterval(fetchUnread, 60000);
    return () => clearInterval(interval);
  }, []);

  async function fetchUnread() {
    try {
      const { data } = await api.get('/notifications/unread-count');
      setUnread(data.count);
    } catch {}
  }

  async function fetchNotifications() {
    try {
      const { data } = await api.get('/notifications');
      setNotifications(data);
    } catch {}
  }

  function handleOpen() {
    setOpen(!open);
    if (!open) fetchNotifications();
  }

  async function handleClick(n) {
    await api.post(`/notifications/${n.id}/read`).catch(() => {});
    if (n.link) navigate(n.link);
    setOpen(false);
    fetchUnread();
  }

  async function markAllRead() {
    await api.post('/notifications/read-all');
    fetchNotifications();
    fetchUnread();
  }

  const titles = { '/': 'Painel geral', '/classes': 'Turmas', '/students': 'Alunos', '/discipline': 'Ocorrências disciplinares', '/praises': 'Elogios', '/tac': 'Termos de Ajustamento', '/calendar': 'Calendário', '/reports': 'Relatórios', '/users': 'Usuários', '/audit': 'Auditoria', '/settings': 'Configurações', '/profile': 'Meu perfil' };
  const currentTitle = titles[location.pathname] || 'Gestão Disciplinar';

  return (
    <header className="h-[72px] bg-slate-50 border-b border-slate-100 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-40"> 
      <div className="flex items-center gap-3 min-w-0">
        <button onClick={onMenuClick} className="lg:hidden icon-button" aria-label="Abrir menu">
          <Menu size={20} />
        </button>
        <div className="block">
          <p className="text-[11px] uppercase tracking-[.2em] text-slate-500">CMTO · Araguatins</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.45)]" />
            <span className="text-xs text-slate-500">Operacional</span>
            <span className="text-slate-400">/</span>
            <span className="text-sm font-medium text-slate-900 truncate">{currentTitle}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 relative">
        <button
          aria-label="Notificações"
          aria-expanded={open}
          onClick={handleOpen}
          className="relative icon-button"
        >
          <Bell size={20} />
          {unread > 0 && (
            <span className="absolute top-0 right-0 min-w-[18px] h-[18px] bg-solar-400 text-slate-900 text-[10px] flex items-center justify-center px-1 rounded-full font-bold">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-14 w-[min(24rem,calc(100vw-2rem))] card overflow-hidden z-50">
              <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                <h3 className="font-sans text-lg text-slate-900">Notificações</h3>
                <button onClick={markAllRead} className="text-xs uppercase tracking-wider text-slate-500 hover:text-amber-700 transition">
                  Marcar todas
                </button>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {notifications.length === 0 && (
                  <p className="p-6 text-center text-sm text-slate-500">
                    Nenhuma notificação
                  </p>
                )}
                {notifications.map(n => (
                  <div
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={`p-4 border-b border-slate-200 cursor-pointer transition
                      ${!n.read ? 'bg-white border-l-2 border-l-solar-400' : 'hover:bg-white'}`}
                  >
                    <p className="font-medium text-sm text-slate-900">{n.title}</p>
                    <p className="text-xs text-slate-600 mt-1">{n.message}</p>
                    <p className="text-[10px] text-slate-500 mt-2 uppercase tracking-wider">
                      {timeAgo(n.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
