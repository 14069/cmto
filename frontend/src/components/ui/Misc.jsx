import { Loader2 } from 'lucide-react';

export function Loading({ message = 'Carregando...' }) {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="animate-spin text-amber-700" size={32} />
        <p className="text-sm text-slate-500 tracking-wider uppercase">{message}</p>
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {Icon && (
        <div className="w-16 h-16 mb-4 flex items-center justify-center bg-slate-50 border border-slate-200 text-slate-500 rounded">
          <Icon size={28} strokeWidth={1.5} />
        </div>
      )}
      <h3 className="font-sans text-xl text-slate-900 mb-1">{title}</h3>
      {description && <p className="text-slate-600 text-sm max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, breadcrumb }) {
  return (
    <div className="border-b border-slate-200 pb-6 mb-8">
      {breadcrumb && (
        <p className="text-xs uppercase tracking-widest text-slate-500 mb-2">{breadcrumb}</p>
      )}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-sans text-2xl sm:text-3xl text-slate-900 font-semibold">{title}</h1>
          {subtitle && <p className="text-slate-600 mt-1">{subtitle}</p>}
        </div>
        {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
      </div>
      <div className="w-12 h-0.5 bg-solar-400 mt-4" />
    </div>
  );
}
