import { ShieldCheck, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ServerHealthInfo } from '../types/gap';

interface HeadersModalProps {
  open: boolean;
  onClose: () => void;
}

export function HeadersModal({ open, onClose }: HeadersModalProps) {
  const [health, setHealth] = useState<ServerHealthInfo | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ServerHealthInfo | null) => setHealth(data))
      .catch(() => setHealth(null));
  }, [open]);

  if (!open) return null;

  const clientChecks = [
    {
      label: 'window.crossOriginIsolated',
      value: String(window.crossOriginIsolated),
      ok: window.crossOriginIsolated === true,
    },
    {
      label: 'SharedArrayBuffer',
      value: typeof SharedArrayBuffer !== 'undefined' ? 'Available' : 'Unavailable',
      ok: typeof SharedArrayBuffer !== 'undefined',
    },
    {
      label: 'Atomics.wait',
      value: typeof Atomics !== 'undefined' ? 'Available' : 'Unavailable',
      ok: typeof Atomics !== 'undefined',
    },
    {
      label: 'WebAssembly Engine',
      value: typeof WebAssembly === 'object' ? 'Supported' : 'Unsupported',
      ok: typeof WebAssembly === 'object',
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="headers-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-lg border border-slate-200 bg-white p-5 text-slate-900 dark:border-slate-800 dark:bg-[#0F141E] dark:text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-cyan-600 dark:text-cyan-400" aria-hidden="true" />
            <h2 id="headers-modal-title" className="font-display text-sm font-semibold">
              WebAssembly Security Headers &amp; Runtime Verification
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded border border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Browser Isolation &amp; Wasm Capabilities
            </h3>
            <div className="mt-2 divide-y divide-slate-200 rounded border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {clientChecks.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between px-3 py-2 font-mono text-xs"
                >
                  <span className="text-slate-600 dark:text-slate-400">{item.label}</span>
                  <span
                    className={
                      item.ok
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }
                  >
                    {item.ok ? '✓ ' : '✖ '}
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Server Response Headers (COOP / COEP / CSP)
            </h3>
            <div className="mt-2 divide-y divide-slate-200 rounded border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {health ? (
                Object.entries(health.headers).map(([name, value]) => (
                  <div
                    key={name}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 px-3 py-2 font-mono text-[11px]"
                  >
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {name}
                    </span>
                    <span className="text-cyan-700 dark:text-cyan-400 break-all">{value}</span>
                  </div>
                ))
              ) : (
                <div className="px-3 py-2 text-xs text-slate-500">Loading server headers…</div>
              )}
            </div>
          </div>

          <div className="border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            Powered by GAP 4 WebAssembly (<span className="font-mono">gap-system/gap</span>,{' '}
            <span className="font-mono">fraubentz/gap-in-the-browser</span>) with Semigroup
            Theory tools inspired by <span className="font-mono">semigroups/Semigroups</span>,{' '}
            <span className="font-mono">smallsemi</span>, and{' '}
            <span className="font-mono">numericalsgps</span>.
          </div>
        </div>
      </div>
    </div>
  );
}
