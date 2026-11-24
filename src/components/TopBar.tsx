import type { MobilePane, WorkspaceTab } from '../types/gap';

interface TopBarProps {
  activeTab: WorkspaceTab;
  mobilePane: MobilePane;
  onSelectView: (view: 'terminal' | WorkspaceTab) => void;
  onOpenHeaders: () => void;
  onRestartGap: () => void;
}

export function TopBar({
  activeTab,
  mobilePane,
  onSelectView,
  onOpenHeaders,
  onRestartGap,
}: TopBarProps) {
  const isEggBoxActive = mobilePane === 'eggbox' || activeTab === 'eggbox';
  const isExamplesActive = mobilePane === 'examples' || activeTab === 'examples';

  return (
    <header className="safe-top safe-x shrink-0 border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0F141E]">
      <div className="flex h-13 items-center justify-between gap-8 px-4 lg:px-6">
        <a
          href="#terminal"
          onClick={(e) => {
            e.preventDefault();
            onSelectView('terminal');
          }}
          className="font-display text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500"
        >
          GAP Semigroup Lab
        </a>

        <nav
          aria-label="Primary"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400"
        >
          <button
            type="button"
            onClick={() => onSelectView('terminal')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500 ${
              mobilePane === 'terminal'
                ? 'border-cyan-600 text-slate-900 dark:border-cyan-400 dark:text-slate-100'
                : 'border-transparent hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Terminal
          </button>
          <button
            type="button"
            onClick={() => onSelectView('eggbox')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500 ${
              isEggBoxActive
                ? 'border-cyan-600 text-slate-900 dark:border-cyan-400 dark:text-slate-100'
                : 'border-transparent hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Egg-Box
          </button>
          <button
            type="button"
            onClick={() => onSelectView('examples')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500 ${
              isExamplesActive
                ? 'border-cyan-600 text-slate-900 dark:border-cyan-400 dark:text-slate-100'
                : 'border-transparent hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Examples
          </button>
          <button
            type="button"
            onClick={onOpenHeaders}
            className="py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 border-transparent hover:text-slate-900 dark:hover:text-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500"
          >
            Headers
          </button>
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onRestartGap}
            className="min-h-[36px] px-4 py-1.5 text-xs font-semibold rounded-md bg-slate-900 text-white hover:bg-slate-800 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500"
          >
            Restart GAP
          </button>
        </div>
      </div>
    </header>
  );
}
