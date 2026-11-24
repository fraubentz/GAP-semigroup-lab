import {
  Keyboard,
  Moon,
  ShieldAlert,
  Sun,
  Terminal as TerminalIcon,
  Trash2,
  Upload,
} from 'lucide-react';
import { useRef, useState } from 'react';
import type { EngineStatus } from '../types/gap';

interface TerminalPaneProps {
  terminalRef: React.RefObject<HTMLDivElement | null>;
  status: EngineStatus;
  statusDetail: string;
  fetchProgress: { count: number; total: number };
  theme: 'dark' | 'light';
  showKeyBar: boolean;
  onToggleTheme: () => void;
  onToggleKeyBar: () => void;
  onClear: () => void;
  onSwitchToShell: () => void;
  onLaunchGap: () => void;
  onUploadFiles: (files: FileList) => void;
  onSendKey: (seq: string) => void;
  onOpenHeaders: () => void;
}

const TOUCH_KEYS: Array<{ label: string; seq: string; title: string }> = [
  { label: 'Tab', seq: '\t', title: 'Auto-complete' },
  { label: '↑', seq: '\x1b[A', title: 'Previous command' },
  { label: '↓', seq: '\x1b[B', title: 'Next command' },
  { label: '←', seq: '\x1b[D', title: 'Cursor left' },
  { label: '→', seq: '\x1b[C', title: 'Cursor right' },
  { label: ':=', seq: ':= ', title: 'Assignment operator' },
  { label: ';', seq: ';', title: 'Statement terminator' },
  { label: ';;', seq: ';;', title: 'Silent terminator' },
  { label: '()', seq: '()', title: 'Parentheses' },
  { label: '[]', seq: '[]', title: 'List brackets' },
  { label: 'Ctrl+C', seq: '\x03', title: 'Interrupt' },
  { label: 'Enter', seq: '\r', title: 'Submit line' },
];

export function TerminalPane({
  terminalRef,
  status,
  statusDetail,
  fetchProgress,
  theme,
  showKeyBar,
  onToggleTheme,
  onToggleKeyBar,
  onClear,
  onSwitchToShell,
  onLaunchGap,
  onUploadFiles,
  onSendKey,
  onOpenHeaders,
}: TerminalPaneProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);
  const [dragging, setDragging] = useState(false);

  const statusMeta = (() => {
    switch (status) {
      case 'ready':
        return {
          text: '● GAP 4 Wasm Ready',
          cls: 'text-emerald-600 dark:text-emerald-400',
        };
      case 'booting':
        return {
          text:
            fetchProgress.count > 0
              ? `◌ Loading Wasm (${fetchProgress.count}/${fetchProgress.total})`
              : '◌ Booting Wasm',
          cls: 'text-amber-600 dark:text-amber-400',
        };
      case 'shell':
        return {
          text: '▲ POSIX Shell (/home/web_user)',
          cls: 'text-cyan-700 dark:text-cyan-400',
        };
      case 'unsupported':
        return {
          text: '✖ WebAssembly Unsupported',
          cls: 'text-rose-600 dark:text-rose-400',
        };
      case 'error':
      case 'exited':
        return {
          text: '✖ Session Stopped',
          cls: 'text-rose-600 dark:text-rose-400',
        };
    }
  })();

  const handleDragEnter = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setDragging(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragDepthRef.current = 0;
    setDragging(false);
    if (e.dataTransfer.files.length > 0) {
      onUploadFiles(e.dataTransfer.files);
    }
  };

  return (
    <section
      id="terminal"
      aria-label="Linux and GAP WebAssembly Terminal"
      className="flex flex-1 min-h-0 min-w-0 flex-col bg-white dark:bg-[#0F141E]"
    >
      {/* Workspace Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-800 lg:px-4">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`font-mono text-xs font-medium tabular-nums truncate ${statusMeta.cls}`}
          >
            {statusMeta.text}
          </span>
          <span className="hidden sm:inline text-xs text-slate-400" aria-hidden="true">
            ·
          </span>
          <span className="hidden sm:inline font-mono text-xs text-slate-500 dark:text-slate-400 truncate">
            wasm32 · /home/web_user
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {status === 'shell' ? (
            <button
              type="button"
              onClick={onLaunchGap}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-cyan-600/40 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-700 hover:bg-cyan-500/20 dark:text-cyan-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <TerminalIcon className="h-3.5 w-3.5" aria-hidden="true" />
              Start GAP
            </button>
          ) : (
            <button
              type="button"
              onClick={onSwitchToShell}
              disabled={status === 'unsupported'}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Drop to Linux workspace shell (type 'gap' to return)"
            >
              <TerminalIcon className="h-3.5 w-3.5" aria-hidden="true" />
              Linux Shell
            </button>
          )}

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Upload .g script into /home/web_user"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Upload</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                onUploadFiles(e.target.files);
              }
              e.target.value = '';
            }}
          />

          <button
            type="button"
            onClick={onClear}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Clear terminal screen"
            aria-label="Clear terminal"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={onToggleKeyBar}
            aria-pressed={showKeyBar}
            className={`inline-flex min-h-[36px] items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              showKeyBar
                ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'
                : 'border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
            title="Toggle touch / quick-key bar"
            aria-label="Toggle quick-key bar"
          >
            <Keyboard className="h-3.5 w-3.5" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            className="inline-flex min-h-[36px] items-center justify-center rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
            title={theme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'}
            aria-label={theme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'}
          >
            {theme === 'dark' ? (
              <Sun className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Moon className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Main Terminal Viewport */}
      <div
        className="relative flex-1 min-h-0 bg-[#0B0E14]"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div
          ref={terminalRef}
          className="xterm-host h-full w-full"
          aria-label="GAP interactive terminal output and input"
        />

        {dragging && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center border-2 border-dashed border-cyan-400 bg-slate-950/85 p-6">
            <div className="text-center">
              <p className="font-display text-base font-semibold text-slate-100">
                Drop files to mount in /home/web_user
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Single .g files automatically insert Read(&quot;...&quot;); at the prompt.
              </p>
            </div>
          </div>
        )}

        {status === 'unsupported' && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#0B0E14]/95 p-6">
            <div className="max-w-lg rounded-lg border border-slate-800 bg-[#111726] p-6 text-slate-200">
              <div className="flex items-center gap-2.5 text-rose-400">
                <ShieldAlert className="h-5 w-5 shrink-0" aria-hidden="true" />
                <h2 className="font-display text-base font-semibold">
                  WebAssembly Runtime Unsupported
                </h2>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">
                {statusDetail ||
                  'This browser does not support WebAssembly, which is required to execute GAP 4.'}
              </p>
              <div className="mt-4 space-y-1 rounded border border-slate-800 bg-[#0B0E14] p-3 font-mono text-xs text-slate-300 tabular-nums">
                <div>WebAssembly supported: {String(typeof WebAssembly === 'object')}</div>
                <div>window.crossOriginIsolated: {String(window.crossOriginIsolated)}</div>
                <div>typeof SharedArrayBuffer: {typeof SharedArrayBuffer}</div>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={onLaunchGap}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 transition-colors whitespace-nowrap cursor-pointer"
                >
                  Retry Boot
                </button>
                <button
                  type="button"
                  onClick={onOpenHeaders}
                  className="inline-flex min-h-[44px] items-center rounded-md border border-slate-700 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
                >
                  Inspect Security Headers
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile & Touch Accessory Key Bar */}
      {showKeyBar && (
        <div
          role="toolbar"
          aria-label="Terminal touch accessory keys"
          className="flex items-center gap-1.5 overflow-x-auto border-t border-slate-800 bg-[#111726] px-2 py-1.5 workbench-scroll"
        >
          {TOUCH_KEYS.map((k) => (
            <button
              key={k.label}
              type="button"
              title={k.title}
              onPointerDown={(e) => {
                // Keep virtual keyboard open on iOS/Android
                e.preventDefault();
                onSendKey(k.seq);
              }}
              onClick={(e) => {
                if (e.detail === 0) onSendKey(k.seq);
              }}
              className="min-h-[44px] min-w-[44px] px-3 rounded border border-slate-700 bg-[#1A2234] font-mono text-xs font-medium text-slate-100 active:bg-cyan-500 active:text-slate-950 hover:border-slate-600 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {k.label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
