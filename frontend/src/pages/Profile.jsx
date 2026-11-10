import { useState } from 'react';
import { User, Lock, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api.js';
import { PageHeader } from '../components/ui/Misc.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { ROLE_LABELS, formatDateTime } from '../lib/constants.js';

export default function Profile() {
  const { user } = useAuth();
  const [pwd, setPwd] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [saving, setSaving] = useState(false);

  async function handleChangePassword(e) {
    e.preventDefault();
    if (pwd.newPassword !== pwd.confirm) {
      toast.error('As senhas não conferem');
      return;
    }
    if (pwd.newPassword.length < 6) {
      toast.error('A senha deve ter ao menos 6 caracteres');
      return;
    }
    setSaving(true);
    try {
      await api.post('/auth/change-password', { currentPassword: pwd.currentPassword, newPassword: pwd.newPassword });
      toast.success('Senha alterada');
      setPwd({ currentPassword: '', newPassword: '', confirm: '' });
    } catch {} finally { setSaving(false); }
  }

  return (
    <div className="max-w-3xl mx-auto fade-in">
      <PageHeader
        title="Meu Perfil"
        subtitle="Informações pessoais e segurança"
        breadcrumb="Perfil"
      />

      <div className="card p-8 mb-6">
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 bg-solar-400 text-slate-900 flex items-center justify-center font-sans text-3xl font-bold">
            {user.name[0]}
          </div>
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-widest text-slate-500">{ROLE_LABELS[user.role]}</p>
            <h2 className="font-sans text-2xl text-slate-900 font-semibold">{user.name}</h2>
            <p className="text-sm text-slate-600 mt-1">{user.email}</p>
          </div>
        </div>
      </div>

      <div className="card p-6">
        <div className="flex items-center gap-3 mb-4">
          <Lock size={18} className="text-slate-500" />
          <h3 className="section-title">Alterar Senha</h3>
        </div>

        <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
          <div>
            <label className="label-field">Senha atual</label>
            <input type="password" className="input-field" value={pwd.currentPassword} onChange={(e) => setPwd({ ...pwd, currentPassword: e.target.value })} required />
          </div>
          <div>
            <label className="label-field">Nova senha</label>
            <input type="password" className="input-field" value={pwd.newPassword} onChange={(e) => setPwd({ ...pwd, newPassword: e.target.value })} required minLength={6} />
          </div>
          <div>
            <label className="label-field">Confirmar nova senha</label>
            <input type="password" className="input-field" value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} required />
          </div>
          <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
            <Save size={14} /> {saving ? 'Salvando...' : 'Atualizar Senha'}
          </button>
        </form>
      </div>
    </div>
  );
}
