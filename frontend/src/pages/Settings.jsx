import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api.js';
import { Loading, PageHeader } from '../components/ui/Misc.jsx';

export default function Settings() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/config').then(({ data }) => setConfig(data)).finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await api.put('/config', config);
      toast.success('Configurações atualizadas');
    } catch {} finally { setSaving(false); }
  }

  if (loading) return <Loading />;

  return (
    <div className="max-w-3xl mx-auto fade-in">
      <PageHeader
        title="Configurações do Sistema"
        subtitle="Parâmetros globais do sistema disciplinar"
        breadcrumb="Administração · Configurações"
      />

      <div className="card p-6 space-y-6">
        <Section title="Conceito Disciplinar" description="Parâmetros base do cálculo de conceito">
          <Field label="Conceito inicial" sub="Nota com a qual o aluno começa o ano">
            <input
              type="number" step="0.1" className="input-field"
              value={config.initialScore}
              onChange={(e) => setConfig({ ...config, initialScore: parseFloat(e.target.value) })}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Limiar de atenção" sub="Alerta amarelo quando nota cai abaixo">
              <input
                type="number" step="0.1" className="input-field"
                value={config.attentionThreshold}
                onChange={(e) => setConfig({ ...config, attentionThreshold: parseFloat(e.target.value) })}
              />
            </Field>
            <Field label="Limiar crítico" sub="Alerta vermelho quando nota cai abaixo">
              <input
                type="number" step="0.1" className="input-field"
                value={config.criticalThreshold}
                onChange={(e) => setConfig({ ...config, criticalThreshold: parseFloat(e.target.value) })}
              />
            </Field>
          </div>
        </Section>

        <Section title="Anotações Automáticas" description="Conversão de anotações em TMD">
          <Field label="Quantidade de anotações para gerar TMD Leve" sub="Após este número, um TMD Leve é gerado automaticamente">
            <input
              type="number" className="input-field"
              value={config.anotacoesToTMD}
              onChange={(e) => setConfig({ ...config, anotacoesToTMD: parseInt(e.target.value) })}
            />
          </Field>
        </Section>

        <Section title="Ciclo Letivo" description="Tipo de período avaliativo">
          <Field label="Tipo de ciclo">
            <select className="input-field" value={config.cycleType} onChange={(e) => setConfig({ ...config, cycleType: e.target.value })}>
              <option value="ANUAL">Anual</option>
              <option value="SEMESTRAL">Semestral</option>
              <option value="TRIMESTRAL">Trimestral</option>
              <option value="BIMESTRAL">Bimestral</option>
            </select>
          </Field>
        </Section>

        <Section title="Notificações" description="Envio de e-mails para responsáveis e equipe">
          <label className="flex items-center gap-3 p-3 border border-slate-200 hover:bg-slate-50 transition cursor-pointer">
            <input
              type="checkbox"
              checked={config.emailNotifications}
              onChange={(e) => setConfig({ ...config, emailNotifications: e.target.checked })}
            />
            <div>
              <p className="text-sm font-medium text-slate-900">Habilitar notificações por e-mail</p>
              <p className="text-xs text-slate-500">Requer SMTP configurado no servidor</p>
            </div>
          </label>
        </Section>

        <div className="flex justify-end pt-4 border-t border-slate-200">
          <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
            <Save size={16} /> {saving ? 'Salvando...' : 'Salvar Configurações'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, description, children }) {
  return (
    <div>
      <h3 className="font-sans text-xl text-slate-900 font-semibold">{title}</h3>
      <p className="text-sm text-slate-600 mb-4">{description}</p>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, sub, children }) {
  return (
    <div>
      <label className="label-field">{label}</label>
      {children}
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}
