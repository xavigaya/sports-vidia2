// Botó amb un menú desplegable d'opcions
import { useEffect, useRef, type ReactNode } from 'react';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

export function Menu({ label, items, disabled, title }: { label: ReactNode; items: MenuItem[]; disabled?: boolean; title?: string }) {
  const ref = useRef<HTMLDetailsElement>(null);
  // Es tanca en clicar fora
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);
  if (disabled) {
    return (
      <button className="btn btn-sm" disabled title={title}>
        {label}
      </button>
    );
  }
  return (
    <details className="menu" ref={ref}>
      <summary className="btn btn-sm" title={title}>
        {label} ▾
      </summary>
      <div className="menu-items" role="menu">
        {items.map((it) => (
          <button
            key={it.label}
            role="menuitem"
            disabled={it.disabled}
            onClick={() => {
              if (ref.current) ref.current.open = false;
              it.onSelect();
            }}
          >
            {it.label}
          </button>
        ))}
      </div>
    </details>
  );
}
