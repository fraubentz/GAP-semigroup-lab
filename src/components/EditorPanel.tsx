import { FilePlus2, Play, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { VirtualFileEntry } from '../types/gap';

interface EditorPanelProps {
  files: Map<string, VirtualFileEntry>;
  selectedFile: string;
  onSelectFile: (name: string) => void;
  onSaveFile: (name: string, content: string) => Promise<void>;
  onSaveAndRun: (name: string, content: string) => Promise<void>;
}

const DEFAULT_TEMPLATE = `# Custom GAP Semigroup Script
Read("semigroups_toolkit.g");;

S := FullTransformationMonoid(3);;
SemigroupSummary(S);
InspectSemigroup(S, "T_3");
`;

export function EditorPanel({
  files,
  selectedFile,
  onSelectFile,
  onSaveFile,
  onSaveAndRun,
}: EditorPanelProps) {
  const [content, setContent] = useState(DEFAULT_TEMPLATE);
  const [newFileName, setNewFileName] = useState('');
  const [creatingNew, setCreatingNew] = useState(false);
  const [savedNotice, setSavedNotice] = useState('');

  const editableNames = Array.from(files.keys())
    .filter((name) => !name.endsWith('.json') || name === 'semigroup_inspect.json')
    .sort();

  useEffect(() => {
    const entry = files.get(selectedFile);
    if (entry) {
      setContent(new TextDecoder().decode(entry.data));
    }
  }, [selectedFile, files]);

  const handleSave = async () => {
    await onSaveFile(selectedFile, content);
    setSavedNotice('Synced to /home/web_user');
    setTimeout(() => setSavedNotice(''), 2000);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newFileName.trim().replace(/^\/+/, '');
    if (!cleaned) return;
    const finalName = cleaned.includes('.') ? cleaned : `${cleaned}.g`;
    await onSaveFile(finalName, `# ${finalName}\n`);
    onSelectFile(finalName);
    setNewFileName('');
    setCreatingNew(false);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 space-y-2 border-b border-slate-200 p-3 dark:border-slate-800">
        <div className="flex items-center justify-between gap-2">
          <select
            aria-label="Active workspace file"
            value={selectedFile}
            onChange={(e) => onSelectFile(e.target.value)}
            className="min-h-[36px] flex-1 min-w-0 rounded border border-slate-200 bg-slate-50 px-2.5 font-mono text-xs text-slate-900 focus:border-cyan-500 focus:outline-none dark:border-slate-700 dark:bg-[#0B0E14] dark:text-slate-100"
          >
            {editableNames.length === 0 ? (
              <option value="semigroup_lab.g">semigroup_lab.g</option>
            ) : (
              editableNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))
            )}
          </select>

          <button
            type="button"
            onClick={() => setCreatingNew((v) => !v)}
            className="inline-flex min-h-[36px] items-center gap-1 rounded border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="New script file"
          >
            <FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" />
            New
          </button>
        </div>

        {creatingNew && (
          <form onSubmit={handleCreate} className="flex items-center gap-2">
            <input
              type="text"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              placeholder="my_semigroup.g"
              className="min-h-[34px] flex-1 rounded border border-slate-200 bg-white px-2.5 font-mono text-xs text-slate-900 focus:border-cyan-500 focus:outline-none dark:border-slate-700 dark:bg-[#0B0E14] dark:text-slate-100"
            />
            <button
              type="submit"
              className="min-h-[34px] rounded bg-slate-900 px-3 py-1 text-xs font-medium text-white dark:bg-cyan-500 dark:text-slate-950 whitespace-nowrap cursor-pointer"
            >
              Create
            </button>
          </form>
        )}
      </div>

      <div className="flex-1 min-h-0 p-3">
        <textarea
          aria-label="GAP script editor"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          spellCheck={false}
          className="h-full w-full resize-none rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-900 focus:border-cyan-500 focus:outline-none dark:border-slate-800 dark:bg-[#0B0E14] dark:text-slate-100 workbench-scroll"
        />
      </div>

      <div className="shrink-0 flex items-center justify-between gap-2 border-t border-slate-200 px-3 py-2.5 dark:border-slate-800">
        <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 truncate">
          {savedNotice || `/home/web_user/${selectedFile}`}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
            Save
          </button>
          <button
            type="button"
            onClick={() => void onSaveAndRun(selectedFile, content)}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded bg-slate-900 px-3.5 py-1 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            Save &amp; Run
          </button>
        </div>
      </div>
    </div>
  );
}
