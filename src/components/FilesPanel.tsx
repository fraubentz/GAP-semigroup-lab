import { CornerDownLeft, Download, FileCode2, RotateCcw, Upload } from 'lucide-react';
import { useRef } from 'react';
import type { VirtualFileEntry } from '../types/gap';

interface FilesPanelProps {
  files: Map<string, VirtualFileEntry>;
  onUploadFiles: (files: FileList) => void;
  onInsertRead: (path: string) => void;
  onEditFile: (path: string) => void;
  onResetCache: () => void;
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FilesPanel({
  files,
  onUploadFiles,
  onInsertRead,
  onEditFile,
  onResetCache,
}: FilesPanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const paths = Array.from(files.keys()).sort();

  const handleDownload = (entry: VirtualFileEntry) => {
    const copy = new Uint8Array(entry.data.length);
    copy.set(entry.data);
    const blob = new Blob([copy], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = entry.path.split('/').pop() || 'file';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 flex items-center justify-between gap-2 border-b border-slate-200 p-4 dark:border-slate-800">
        <div>
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            /home/web_user
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Emscripten virtual POSIX directory
          </p>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Upload className="h-3.5 w-3.5" aria-hidden="true" />
          Upload
        </button>
        <input
          ref={inputRef}
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
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800 workbench-scroll">
        {paths.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
            No user files yet. Upload a <code className="font-mono">.g</code> file or write output with{' '}
            <code className="font-mono">PrintTo(&quot;out.txt&quot;, ...);</code>.
          </div>
        ) : (
          paths.map((path) => {
            const entry = files.get(path)!;
            const statusText =
              entry.status === 'transferring'
                ? ' · sending…'
                : entry.status === 'failed'
                ? ' · failed'
                : entry.status === 'previous'
                ? ' · cached'
                : '';

            return (
              <div
                key={path}
                className="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-[#131926]"
              >
                <div className="min-w-0">
                  <div className="truncate font-mono text-xs font-medium text-slate-900 dark:text-slate-100">
                    {path}
                  </div>
                  <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                    {humanSize(entry.size)}
                    {statusText}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => onEditFile(path)}
                    title={`Open ${path} in Editor`}
                    aria-label={`Edit ${path}`}
                    className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <FileCode2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onInsertRead(path)}
                    title={`Insert Read("${path}"); at prompt`}
                    aria-label={`Read ${path}`}
                    className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <CornerDownLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownload(entry)}
                    title={`Download ${path}`}
                    aria-label={`Download ${path}`}
                    className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="shrink-0 border-t border-slate-200 p-3 dark:border-slate-800">
        <button
          type="button"
          onClick={onResetCache}
          className="inline-flex w-full min-h-[38px] items-center justify-center gap-1.5 rounded border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Reset Cached GAP Filesystem
        </button>
      </div>
    </div>
  );
}
