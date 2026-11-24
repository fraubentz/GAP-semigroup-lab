import { CornerDownLeft, Play, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { GAP_EXAMPLES } from '../data/examples';
import type { ExampleCategory } from '../types/gap';

interface ExamplesPanelProps {
  onInsert: (code: string) => void;
  onRun: (code: string) => void;
}

const CATEGORIES: Array<{ id: ExampleCategory; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'bentz', label: 'Research' },
  { id: 'eggbox', label: 'Egg-Box' },
  { id: 'semigroups', label: 'Semigroups' },
  { id: 'packages', label: 'Packages' },
  { id: 'groups', label: 'Groups' },
];

export function ExamplesPanel({ onInsert, onRun }: ExamplesPanelProps) {
  const [category, setCategory] = useState<ExampleCategory>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GAP_EXAMPLES.filter((ex) => {
      if (category !== 'all' && ex.category !== category) return false;
      if (!q) return true;
      return (
        ex.title.toLowerCase().includes(q) ||
        ex.summary.toLowerCase().includes(q) ||
        ex.code.toLowerCase().includes(q)
      );
    });
  }, [category, query]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 space-y-2.5 border-b border-slate-200 p-4 dark:border-slate-800">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search semigroup or GAP examples…"
            className="w-full min-h-[38px] rounded-md border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-cyan-500 focus:outline-none dark:border-slate-700 dark:bg-[#0B0E14] dark:text-slate-100"
          />
        </div>

        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 workbench-scroll">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id)}
              className={`min-h-[32px] px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                category === cat.id
                  ? 'bg-slate-900 text-white dark:bg-cyan-500 dark:text-slate-950'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800 workbench-scroll">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
            No matching examples found.
          </div>
        ) : (
          filtered.map((ex) => (
            <div key={ex.id} className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {ex.title}
                  </h3>
                  <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="capitalize">{ex.category}</span>
                    {ex.packages && ex.packages.length > 0 && (
                      <>
                        <span aria-hidden="true"> · </span>
                        <span className="font-mono">{ex.packages.join(', ')}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                {ex.summary}
              </p>

              <pre className="overflow-x-auto rounded border border-slate-200 bg-slate-50 p-2.5 font-mono text-[11px] leading-relaxed text-slate-800 dark:border-slate-800 dark:bg-[#0B0E14] dark:text-slate-300 workbench-scroll">
                {ex.code}
              </pre>

              <div className="flex items-center gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => onRun(ex.code)}
                  className="inline-flex min-h-[34px] items-center gap-1.5 rounded bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Play className="h-3 w-3" aria-hidden="true" />
                  Run in GAP
                </button>
                <button
                  type="button"
                  onClick={() => onInsert(ex.code)}
                  className="inline-flex min-h-[34px] items-center gap-1.5 rounded border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <CornerDownLeft className="h-3 w-3" aria-hidden="true" />
                  Paste
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
