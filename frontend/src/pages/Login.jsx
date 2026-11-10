import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success('Bem-vindo(a) ao CMTO');
      navigate('/');
    } catch (err) {
      // tratado pelo interceptor
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      <section className="login-brand hidden lg:flex lg:w-5/12 p-12 xl:p-16 flex-col justify-between">
        <div className="brand-lockup">
          <div className="brand-mark">CM</div>
          <div><h1 className="text-xl font-semibold">CMTO</h1><p className="text-sm text-slate-300 mt-1">Araguatins · Tocantins</p></div>
        </div>
        <div className="max-w-md">
          <div className="w-10 h-0.5 bg-solar-400 mb-6" />
          <h2 className="text-3xl xl:text-4xl font-semibold leading-tight">Cuidado e disciplina na gestão escolar.</h2>
          <p className="mt-6 text-slate-300 leading-relaxed">Plataforma de acompanhamento disciplinar do Colégio Militar do Estado do Tocantins – Professora Antonina Milhomem.</p>
        </div>
        <p className="text-xs text-slate-300">Acesso institucional · {new Date().getFullYear()}</p>
      </section>
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8"><div className="brand-lockup"><div className="brand-mark">CM</div><span className="font-semibold text-slate-900">CMTO · Araguatins</span></div><p className="text-sm text-slate-600 mt-4">Colégio Militar do Estado do Tocantins – Professora Antonina Milhomem</p></div>
          <p className="text-xs font-semibold tracking-widest uppercase text-slate-500 mb-3">Gestão disciplinar</p>
          <h2 className="text-3xl font-semibold text-slate-900">Acesse sua conta</h2>
          <p className="text-sm text-slate-500 mt-3 mb-8">Informe suas credenciais para continuar.</p>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div><label htmlFor="login-email" className="label-field">E-mail institucional</label><input id="login-email" type="email" className="input-field" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="username" placeholder="seu.email@exemplo.com" /></div>
            <div><label htmlFor="login-password" className="label-field">Senha</label><input id="login-password" type="password" className="input-field" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" /></div>
            <button type="submit" className="w-full btn-primary" disabled={loading}>{loading ? <Loader2 className="animate-spin" size={18} /> : <Shield size={16} />}{loading ? 'Entrando...' : 'Entrar no sistema'}</button>
          </form>
          <p className="text-xs text-slate-500 mt-8 pt-6 border-t border-slate-200">Ambiente de uso restrito à equipe autorizada da unidade escolar.</p>
        </div>
      </div>
    </div>
  );
}
