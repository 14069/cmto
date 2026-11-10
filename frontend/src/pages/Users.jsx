import { useState, useEffect } from 'react';
import { Plus, ShieldCheck, Edit, X, Mail } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api.js';
import { Loading, EmptyState, PageHeader } from '../components/ui/Misc.jsx';
import Modal from '../components/ui/Modal.jsx';
import { ROLE_LABELS, formatDateTime } from '../lib/constants.js';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [u, c] = await Promise.all([api.get('/users'), api.get('/classes')]);
      setUsers(u.data); setClasses(c.data);
    } finally { setLoading(false); }
  }

  return (
    <div className="max-w-7xl mx-auto fade-in">
      <PageHeader
        title="Usuários"
        subtitle="Gerencie acesso de coordenadores, monitores e professores"
        breadcrumb="Administração · Usuários"
        actions={
          <div className="flex gap-2">
            <button onClick={() => setInviteOpen(true)} className="btn-secondary flex items-center gap-2">
              <Mail size={14} /> Convidar
            </button>
            <button onClick={() => { setEditing(null); setModalOpen(true); }} className="btn-primary flex items-center gap-2">
              <Plus size={16} /> Novo Usuário
            </button>
          </div>
        }
      />

      {loading ? <Loading /> : users.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="Nenhum usuário" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-widest">
              <tr>
                <th className="text-left py-3 px-5">Nome</th>
                <th className="text-left py-3 px-5">E-mail</th>
                <th className="text-left py-3 px-5">Cargo</th>
                <th className="text-left py-3 px-5">Status</th>
                <th className="text-left py-3 px-5">Último login</th>
                <th className="text-right py-3 px-5"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id} className={`border-b border-slate-200 hover:bg-slate-50 transition ${i % 2 !== 0 ? 'bg-slate-50' : ''}`}>
                  <td className="py-3 px-5 font-medium text-slate-900">{u.name}</td>
                  <td className="py-3 px-5 text-slate-600">{u.email}</td>
                  <td className="py-3 px-5">
                    <span className="badge bg-slate-100 text-slate-700 border border-slate-200">{ROLE_LABELS[u.role]}</span>
                  </td>
                  <td className="py-3 px-5">
                    <span className={`text-xs uppercase ${u.active ? 'text-emerald-700' : 'text-red-700'}`}>
                      {u.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="py-3 px-5 text-xs text-slate-500">
                    {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : '—'}
                  </td>
                  <td className="py-3 px-5 text-right">
                    <button onClick={() => { setEditing(u); setModalOpen(true); }} className="text-slate-500 hover:text-amber-700 transition">
                      <Edit size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <UserModal open={modalOpen} onClose={() => setModalOpen(false)} editing={editing} classes={classes} onSaved={() => { setModalOpen(false); fetchData(); }} />
      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </div>
  );
}

function UserModal({ open, onClose, editing, classes, onSaved }) {
  const [form, setForm] = useState({ role: 'MONITOR', active: true, classIds: [] });
  const [saving, setSaving] = useState(false);
  const [tempPwd, setTempPwd] = useState(null);

  useEffect(() => {
    if (editing) setForm({ ...editing, classIds: editing.classAccess?.map(c => c.classId) || [] });
    else setForm({ role: 'MONITOR', active: true, classIds: [] });
    setTempPwd(null);
  }, [editing, open]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/users/${editing.id}`, form);
        toast.success('Usuário atualizado');
        onSaved();
      } else {
        const { data } = await api.post('/users', form);
        if (data.tempPassword) setTempPwd(data.tempPassword);
        else { toast.success('Usuário criado'); onSaved(); }
      }
    } catch {} finally { setSaving(false); }
  }

  if (tempPwd) {
    return (
      <Modal open={open} onClose={() => { setTempPwd(null); onSaved(); }} title="Usuário criado">
        <p className="mb-4">A senha temporária do usuário foi gerada:</p>
        <div className="bg-slate-50 text-amber-700 font-mono text-2xl p-4 text-center mb-4 border border-slate-200">{tempPwd}</div>
        <p className="text-sm text-slate-600 mb-4">Anote esta senha e compartilhe com o usuário. Ela só será exibida uma vez.</p>
        <button onClick={() => { setTempPwd(null); onSaved(); }} className="btn-primary w-full">Concluir</button>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar Usuário' : 'Novo Usuário'} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label-field">Nome completo *</label>
          <input className="input-field" value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} />
        </div>
        {!editing && (
          <div>
            <label className="label-field">E-mail *</label>
            <input type="email" className="input-field" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </div>
        )}
        <div>
          <label className="label-field">Cargo *</label>
          <select className="input-field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="label-field">Telefone</label>
          <input className="input-field" value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        {(form.role === 'MONITOR' || form.role === 'PROFESSOR') && (
          <div>
            <label className="label-field">Turmas que pode acessar</label>
            <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto border border-slate-200 p-2 bg-slate-50">
              {classes.map(c => (
                <label key={c.id} className="flex items-center gap-2 text-sm p-1">
                  <input
                    type="checkbox"
                    checked={form.classIds?.includes(c.id) || false}
                    onChange={(e) => {
                      const ids = form.classIds || [];
                      setForm({ ...form, classIds: e.target.checked ? [...ids, c.id] : ids.filter(id => id !== c.id) });
                    }}
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </div>
        )}
        {editing && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            Usuário ativo
          </label>
        )}
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </form>
    </Modal>
  );
}

function InviteModal({ open, onClose }) {
  const [form, setForm] = useState({ role: 'MONITOR' });
  const [saving, setSaving] = useState(false);
  const [link, setLink] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post('/users/invite', form);
      setLink(data.link);
      toast.success('Convite enviado');
    } catch {} finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={() => { setLink(null); setForm({ role: 'MONITOR' }); onClose(); }} title="Enviar Convite">
      {link ? (
        <div>
          <p className="text-sm text-slate-600 mb-3">Convite criado. Compartilhe este link:</p>
          <div className="bg-slate-50 border border-slate-200 p-3 break-all font-mono text-xs text-slate-900">{link}</div>
          <button onClick={() => { navigator.clipboard.writeText(link); toast.success('Link copiado'); }} className="btn-secondary w-full mt-3">
            Copiar Link
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label-field">E-mail</label>
            <input type="email" className="input-field" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div>
            <label className="label-field">Cargo</label>
            <select className="input-field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <button type="submit" className="btn-primary w-full" disabled={saving}>
            {saving ? 'Enviando...' : 'Gerar Convite'}
          </button>
        </form>
      )}
    </Modal>
  );
}
