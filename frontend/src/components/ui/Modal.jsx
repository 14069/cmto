import { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Modal({ open, onClose, title, subtitle, children, size = 'md' }) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [open]);

  if (!open) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8" onClick={onClose}>
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" />
      <div
        role="dialog" aria-modal="true" aria-label={title}
        className={`relative w-full ${sizes[size]} bg-white shadow-2xl border border-slate-200 fade-in my-8 rounded-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-6 border-b border-slate-200 bg-slate-50 rounded-t">
          <div>
            <h2 className="font-sans text-2xl text-slate-900">{title}</h2>
            {subtitle && <p className="text-slate-600 text-sm mt-1">{subtitle}</p>}
          </div>
          <button aria-label="Fechar janela" onClick={onClose} className="text-slate-500 hover:text-slate-900 transition ml-4 mt-1">
            <X size={22} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
