import { useCallback, useEffect, useRef, useState } from 'react';
import { EditorPanel } from './components/EditorPanel';
import { EggBoxPanel } from './components/EggBoxPanel';
import { ExamplesPanel } from './components/ExamplesPanel';
import { FilesPanel } from './components/FilesPanel';
import { HeadersModal } from './components/HeadersModal';
import { ManualPanel } from './components/ManualPanel';
import { TerminalPane } from './components/TerminalPane';
import { TopBar } from './components/TopBar';
import { GapWorkbenchEngine, gapQuote } from './lib/gapEngine';
import type {
  EngineStatus,
  MobilePane,
  SemigroupInspection,
  VirtualFileEntry,
  WorkspaceTab,
} from './types/gap';

export default function App() {
  const terminalContainerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<GapWorkbenchEngine | null>(null);

  const [status, setStatus] = useState<EngineStatus>('booting');
  const [statusDetail, setStatusDetail] = useState<string>('');
  const [fetchProgress, setFetchProgress] = useState({ count: 0, total: 1519 });
  const [files, setFiles] = useState<Map<string, VirtualFileEntry>>(new Map());
  const [inspection, setInspection] = useState<SemigroupInspection | null>(null);

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('eggbox');
  const [mobilePane, setMobilePane] = useState<MobilePane>('terminal');
  const [selectedEditorFile, setSelectedEditorFile] = useState('semigroup_lab.g');
  const [headersOpen, setHeadersOpen] = useState(false);

  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    }
    return 'dark';
  });

  const [showKeyBar, setShowKeyBar] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 1024
    );
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('gap-workbench-theme', theme);
    } catch {
      // Ignore storage errors
    }
  }, [theme]);

  useEffect(() => {
    const el = terminalContainerRef.current;
    if (!el) return;

    const engine = new GapWorkbenchEngine(el, {
      onStatusChange: (nextStatus, detail) => {
        setStatus(nextStatus);
        if (detail !== undefined) setStatusDetail(detail);
      },
      onFilesChange: (nextFiles) => {
        setFiles(nextFiles);
      },
      onInspectionChange: (nextInspection) => {
        setInspection(nextInspection);
        if (nextInspection) {
          setActiveTab('eggbox');
        }
      },
      onFetchProgress: (count, total) => {
        setFetchProgress({ count, total });
      },
    });

    engineRef.current = engine;
    engine.init();

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (mobilePane === 'terminal') {
      const id = requestAnimationFrame(() => {
        engineRef.current?.fit();
      });
      return () => cancelAnimationFrame(id);
    }
  }, [mobilePane]);

  const handleSelectView = useCallback((view: 'terminal' | WorkspaceTab) => {
    if (view === 'terminal') {
      setMobilePane('terminal');
      setTimeout(() => engineRef.current?.focus(), 50);
    } else {
      setActiveTab(view);
      setMobilePane(view);
    }
  }, []);

  const handleUploadFiles = useCallback(async (fileList: FileList) => {
    const engine = engineRef.current;
    if (!engine) return;
    const items: Array<{ name: string; data: Uint8Array }> = [];
    for (const file of Array.from(fileList)) {
      const name = file.name.split(/[/\\]/).pop() ?? '';
      if (!name) continue;
      const buf = new Uint8Array(await file.arrayBuffer());
      items.push({ name, data: buf });
    }
    if (items.length === 0) return;
    await engine.uploadFiles(items);
    if (items.length === 1 && items[0].name.endsWith('.g')) {
      engine.paste(`Read(${gapQuote(items[0].name)});`);
      setMobilePane('terminal');
    } else {
      setActiveTab('files');
    }
  }, []);

  const handleInsertCode = useCallback((code: string) => {
    engineRef.current?.paste(code);
    setMobilePane('terminal');
  }, []);

  const handleRunCode = useCallback((code: string) => {
    void engineRef.current?.runCodeInGap(code);
    setMobilePane('terminal');
  }, []);

  const handleSaveFile = useCallback(async (name: string, content: string) => {
    const bytes = new TextEncoder().encode(content);
    await engineRef.current?.uploadFiles([{ name, data: bytes }]);
  }, []);

  const handleSaveAndRun = useCallback(async (name: string, content: string) => {
    const bytes = new TextEncoder().encode(content);
    await engineRef.current?.uploadFiles([{ name, data: bytes }]);
    await engineRef.current?.runCodeInGap(`Read(${gapQuote(name)});`);
    setMobilePane('terminal');
  }, []);

  const handleInsertRead = useCallback((path: string) => {
    engineRef.current?.paste(`Read(${gapQuote(path)});`);
    setMobilePane('terminal');
  }, []);

  const handleEditFile = useCallback((path: string) => {
    setSelectedEditorFile(path);
    setActiveTab('editor');
    setMobilePane('editor');
  }, []);

  const tabs: Array<{ id: WorkspaceTab; label: string }> = [
    { id: 'eggbox', label: 'Egg-Box' },
    { id: 'examples', label: 'Examples' },
    { id: 'manual', label: 'Manual' },
    { id: 'editor', label: 'Editor' },
    { id: 'files', label: `Files (${files.size})` },
  ];

  const mobileTabs: Array<{ id: MobilePane; label: string }> = [
    { id: 'terminal', label: 'Terminal' },
    { id: 'eggbox', label: 'Egg-Box' },
    { id: 'examples', label: 'Examples' },
    { id: 'manual', label: 'Manual' },
    { id: 'editor', label: 'Editor' },
    { id: 'files', label: 'Files' },
  ];

  const renderWorkbenchContent = (tab: WorkspaceTab) => {
    switch (tab) {
      case 'eggbox':
        return <EggBoxPanel inspection={inspection} onRunSnippet={handleRunCode} />;
      case 'examples':
        return <ExamplesPanel onInsert={handleInsertCode} onRun={handleRunCode} />;
      case 'manual':
        return <ManualPanel onInsert={handleInsertCode} onRun={handleRunCode} />;
      case 'editor':
        return (
          <EditorPanel
            files={files}
            selectedFile={selectedEditorFile}
            onSelectFile={setSelectedEditorFile}
            onSaveFile={handleSaveFile}
            onSaveAndRun={handleSaveAndRun}
          />
        );
      case 'files':
        return (
          <FilesPanel
            files={files}
            onUploadFiles={handleUploadFiles}
            onInsertRead={handleInsertRead}
            onEditFile={handleEditFile}
            onResetCache={() => void engineRef.current?.resetCacheAndReload()}
          />
        );
    }
  };

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-slate-50 text-slate-900 dark:bg-[#0B0E14] dark:text-slate-100">
      <TopBar
        activeTab={activeTab}
        mobilePane={mobilePane}
        onSelectView={handleSelectView}
        onOpenHeaders={() => setHeadersOpen(true)}
        onRestartGap={() => {
          engineRef.current?.restartGap();
          setMobilePane('terminal');
        }}
      />

      {/* Mobile / Tablet Pane Switcher (<1024px) */}
      <div
        role="tablist"
        aria-label="Mobile workspace view"
        className="flex lg:hidden shrink-0 items-center gap-1 overflow-x-auto border-b border-slate-200 bg-white px-2 py-1.5 dark:border-slate-800 dark:bg-[#0F141E] workbench-scroll"
      >
        {mobileTabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={mobilePane === t.id}
            onClick={() => {
              setMobilePane(t.id);
              if (t.id !== 'terminal') setActiveTab(t.id);
            }}
            className={`min-h-[38px] flex-1 px-3 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              mobilePane === t.id
                ? 'bg-slate-900 text-white dark:bg-cyan-500 dark:text-slate-950'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Main Split Console */}
      <main className="safe-bottom safe-x flex flex-1 min-h-0 overflow-hidden">
        {/* Terminal Canvas (always mounted to preserve Wasm worker) */}
        <div
          className={`flex-1 min-w-0 min-h-0 flex-col ${
            mobilePane === 'terminal' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          <TerminalPane
            terminalRef={terminalContainerRef}
            status={status}
            statusDetail={statusDetail}
            fetchProgress={fetchProgress}
            theme={theme}
            showKeyBar={showKeyBar}
            onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
            onToggleKeyBar={() => setShowKeyBar((prev) => !prev)}
            onClear={() => engineRef.current?.clear()}
            onSwitchToShell={() => engineRef.current?.switchToShell()}
            onLaunchGap={() => engineRef.current?.restartGap()}
            onUploadFiles={handleUploadFiles}
            onSendKey={(seq) => engineRef.current?.sendKeySequence(seq)}
            onOpenHeaders={() => setHeadersOpen(true)}
          />
        </div>

        {/* Desktop Right Workbench Drawer */}
        <aside
          aria-label="Semigroup workbench tools"
          className="hidden lg:flex w-[400px] xl:w-[440px] shrink-0 flex-col border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0F141E]"
        >
          <div
            role="tablist"
            aria-label="Workbench panels"
            className="flex shrink-0 items-center border-b border-slate-200 px-2 pt-2 dark:border-slate-800"
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                type="button"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`min-h-[38px] flex-1 border-b-2 px-2 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === tab.id
                    ? 'border-cyan-600 text-slate-900 dark:border-cyan-400 dark:text-slate-100'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 min-h-0 overflow-hidden">
            {renderWorkbenchContent(activeTab)}
          </div>
        </aside>

        {/* Mobile Non-Terminal Pane */}
        {mobilePane !== 'terminal' && (
          <div className="flex flex-1 min-w-0 min-h-0 flex-col bg-white dark:bg-[#0F141E] lg:hidden">
            {renderWorkbenchContent(mobilePane)}
          </div>
        )}
      </main>

      <HeadersModal open={headersOpen} onClose={() => setHeadersOpen(false)} />
    </div>
  );
}
