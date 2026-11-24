import type { EngineStatus, SemigroupInspection, VirtualFileEntry } from '../types/gap';
import { LinuxShellController } from './linuxShell';

const MB_STATE = 0;
const MB_LEN = 1;
const MB_FLAGS = 2;
const MB_IDLE = 0;
const MB_READY = 1;
const MB_CONSUMED = 2;
const MB_FLAG_HEADER = 1;
const MB_FLAG_FINAL = 2;
const MB_FLAG_END = 4;
const MB_CTRL_BYTES = 16;
const MB_DATA_BYTES = 1 << 20;

declare global {
  interface Window {
    Terminal: new (opts: Record<string, unknown>) => XtermInstance;
    FitAddon: { FitAddon: new () => FitAddonInstance };
    openpty: () => { master: unknown; slave: unknown };
    TtyServer: new (slave: unknown) => {
      start: (worker: Worker, onCustomMessage: (ev: MessageEvent) => void) => void;
    };
  }
}

export interface XtermInstance {
  loadAddon: (addon: unknown) => void;
  open: (el: HTMLElement) => void;
  write: (data: string) => void;
  reset: () => void;
  clear: () => void;
  paste: (data: string) => void;
  focus: () => void;
  dispose: () => void;
  onData: (cb: (data: string) => void) => { dispose: () => void };
  options: Record<string, unknown>;
}

interface FitAddonInstance {
  fit: () => void;
}

export interface GapEngineCallbacks {
  onStatusChange: (status: EngineStatus, detail?: string) => void;
  onFilesChange: (files: Map<string, VirtualFileEntry>) => void;
  onInspectionChange: (inspection: SemigroupInspection | null) => void;
  onFetchProgress: (count: number, total: number) => void;
}

export function gapQuote(path: string): string {
  return '"' + path.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

export class GapWorkbenchEngine {
  private container: HTMLElement;
  private callbacks: GapEngineCallbacks;
  private xterm: XtermInstance | null = null;
  private fitAddon: FitAddonInstance | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private worker: Worker | null = null;
  private mbCtrl: Int32Array | null = null;
  private mbData: Uint8Array | null = null;
  private uploadQueue: Array<{ name: string; data: Uint8Array }> = [];
  private senderActive = false;
  private sessionDead = false;
  private started = false;
  private fetchCount = 0;
  private manifestTotal = 1519;
  private fetchedSet = new Set<string>();
  private files = new Map<string, VirtualFileEntry>();
  private pendingReadAfterBoot: string | null = null;
  private pendingCodeAfterBoot: string | null = null;
  private shell: LinuxShellController;
  private shellInputDisposable: { dispose: () => void } | null = null;
  private status: EngineStatus = 'booting';

  constructor(container: HTMLElement, callbacks: GapEngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;

    this.shell = new LinuxShellController({
      getFiles: () => this.files,
      upsertFile: (path, data) => {
        this.files.set(path, {
          path,
          size: data.length,
          data,
          status: 'previous',
          updatedAt: Date.now(),
        });
        this.emitFiles();
      },
      deleteFile: (path) => {
        const deleted = this.files.delete(path);
        if (deleted) this.emitFiles();
        return deleted;
      },
      launchGap: (scriptPath) => {
        if (scriptPath) {
          this.pendingReadAfterBoot = scriptPath;
        }
        this.startGapWorker(false);
      },
      clearTerminal: () => {
        this.xterm?.clear();
      },
      writeTerminal: (text) => {
        this.xterm?.write(text);
      },
    });
  }

  private setStatus(status: EngineStatus, detail?: string): void {
    this.status = status;
    this.callbacks.onStatusChange(status, detail);
  }

  private emitFiles(): void {
    this.callbacks.onFilesChange(new Map(this.files));
  }

  public init(): void {
    if (typeof SharedArrayBuffer === 'undefined' || !window.crossOriginIsolated) {
      this.setStatus(
        'unsupported',
        'SharedArrayBuffer requires Cross-Origin Isolation (COOP/COEP headers).'
      );
      return;
    }

    fetch('/gap/startup_manifest.json')
      .then((r) => (r.ok ? r.json() : []))
      .then((list: string[]) => {
        if (Array.isArray(list) && list.length > 0) {
          this.manifestTotal = list.length;
        }
      })
      .catch(() => {});

    this.createTerminal();
    this.startGapWorker(true);
  }

  private computeFontSize(): number {
    const w = this.container.clientWidth || window.innerWidth;
    if (w < 430) return 12;
    if (w < 768) return 13;
    return 14;
  }

  private createTerminal(): void {
    if (this.xterm) {
      this.xterm.dispose();
    }
    this.container.innerHTML = '';

    const xterm = new window.Terminal({
      fontFamily: '"JetBrains Mono", Menlo, Consolas, monospace',
      fontSize: this.computeFontSize(),
      lineHeight: 1.32,
      cursorBlink: true,
      scrollback: 5000,
      theme: {
        background: '#0B0E14',
        foreground: '#E2E8F0',
        cursor: '#22D3EE',
        cursorAccent: '#0B0E14',
        selectionBackground: 'rgba(34, 211, 238, 0.28)',
        black: '#0F172A',
        red: '#F87171',
        green: '#34D399',
        yellow: '#FBBF24',
        blue: '#60A5FA',
        magenta: '#C084FC',
        cyan: '#22D3EE',
        white: '#E2E8F0',
        brightBlack: '#64748B',
        brightRed: '#FCA5A5',
        brightGreen: '#6EE7B7',
        brightYellow: '#FDE68A',
        brightBlue: '#93C5FD',
        brightMagenta: '#D8B4FE',
        brightCyan: '#67E8F9',
        brightWhite: '#F8FAFC',
      },
    });

    const fitAddon = new window.FitAddon.FitAddon();
    xterm.loadAddon(fitAddon);
    xterm.open(this.container);
    fitAddon.fit();

    this.xterm = xterm;
    this.fitAddon = fitAddon;

    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => {
      if (!this.xterm || !this.fitAddon) return;
      const nextSize = this.computeFontSize();
      if (this.xterm.options.fontSize !== nextSize) {
        this.xterm.options.fontSize = nextSize;
      }
      try {
        this.fitAddon.fit();
      } catch {
        // Ignore fit error during unmount transitions
      }
    });
    this.resizeObserver.observe(this.container);
  }

  public fit(): void {
    try {
      this.fitAddon?.fit();
    } catch {
      // Ignore
    }
  }

  public focus(): void {
    this.xterm?.focus();
  }

  public clear(): void {
    this.xterm?.clear();
    if (this.shell.isActive()) {
      this.shell.activate(false);
    }
  }

  public paste(text: string): void {
    if (!this.xterm) return;
    if (this.shell.isActive()) {
      this.shell.handleInput(text);
    } else {
      this.xterm.paste(text);
    }
    this.xterm.focus();
  }

  public sendKeySequence(seq: string): void {
    if (!this.xterm) return;
    if (this.shell.isActive()) {
      this.shell.handleInput(seq);
    } else {
      this.xterm.paste(seq);
    }
    this.xterm.focus();
  }

  public async runCodeInGap(code: string): Promise<void> {
    if (this.shell.isActive()) {
      this.pendingCodeAfterBoot = code;
      this.shell.deactivate();
      this.startGapWorker(false);
      return;
    }
    if (!this.started && this.status === 'booting') {
      this.pendingCodeAfterBoot = code;
      return;
    }
    this.paste(code.endsWith('\n') ? code : code + '\n');
  }

  public switchToShell(): void {
    if (this.shell.isActive()) return;
    this.terminateWorkerOnly();
    for (const entry of this.files.values()) {
      entry.status = 'previous';
    }
    this.emitFiles();
    this.setStatus('shell');
    if (this.xterm) {
      this.shellInputDisposable = this.xterm.onData((chunk) => {
        this.shell.handleInput(chunk);
      });
      this.shell.activate(true);
      this.xterm.focus();
    }
  }

  public restartGap(): void {
    this.shell.deactivate();
    this.terminateWorkerOnly();
    this.createTerminal();
    for (const entry of this.files.values()) {
      entry.status = 'previous';
    }
    this.emitFiles();
    this.startGapWorker(true);
  }

  private terminateWorkerOnly(): void {
    this.sessionDead = true;
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.shellInputDisposable?.dispose();
    this.shellInputDisposable = null;
  }

  private startGapWorker(freshTerminal: boolean): void {
    if (!this.xterm) return;

    this.shellInputDisposable?.dispose();
    this.shellInputDisposable = null;
    this.sessionDead = false;
    this.started = false;
    this.fetchCount = 0;
    this.fetchedSet.clear();
    this.senderActive = false;
    this.uploadQueue = [];

    if (!freshTerminal) {
      this.createTerminal();
    }

    this.setStatus('booting', 'Initializing GAP 4 WebAssembly kernel…');

    const { master, slave } = window.openpty();
    this.xterm!.loadAddon(master);

    const mailbox = new SharedArrayBuffer(MB_CTRL_BYTES + MB_DATA_BYTES);
    this.mbCtrl = new Int32Array(mailbox, 0, 4);
    this.mbData = new Uint8Array(mailbox, MB_CTRL_BYTES);

    const worker = new Worker('/gap/gap-worker.js');
    this.worker = worker;
    worker.postMessage({ type: 'gap-init', mailbox });

    const priorUserFiles = Array.from(this.files.values())
      .filter((f) => f.path !== 'semigroups_toolkit.g' && f.path !== 'semigroup_lab.g')
      .map((f) => ({ name: f.path, data: f.data }));

    if (priorUserFiles.length > 0) {
      void this.uploadFiles(priorUserFiles);
    }

    worker.addEventListener('message', (ev: MessageEvent) => {
      const d = ev.data;
      if (d && d.ttyRequestType === 'write' && !this.started) {
        this.started = true;
        this.xterm?.reset();
        this.setStatus('ready');
        if (this.pendingReadAfterBoot) {
          const script = this.pendingReadAfterBoot;
          this.pendingReadAfterBoot = null;
          setTimeout(() => {
            this.paste(`Read(${gapQuote(script)});\n`);
          }, 150);
        } else if (this.pendingCodeAfterBoot) {
          const code = this.pendingCodeAfterBoot;
          this.pendingCodeAfterBoot = null;
          setTimeout(() => {
            this.paste(code.endsWith('\n') ? code : code + '\n');
          }, 150);
        }
      }
    });

    worker.addEventListener('error', (err) => {
      this.setStatus('error', err.message || 'GAP WebAssembly worker crashed');
    });

    const ttyServer = new window.TtyServer(slave);
    ttyServer.start(worker, (ev: MessageEvent) => this.handleWorkerMessage(ev));

    this.xterm!.write(
      '\x1b[1;36mweb_user@gap-wasm\x1b[0m:\x1b[1;34m/home/web_user\x1b[0m$ gap -l /\r\n' +
        '\x1b[2mBooting GAP 4 WebAssembly runtime (gap.wasm) + virtual filesystem…\x1b[0m\r\n'
    );
  }

  private handleWorkerMessage(ev: MessageEvent): void {
    const data = ev.data;
    if (!data || !data.type) return;

    switch (data.type) {
      case 'gap-bundle-status': {
        if (!this.started && this.xterm) {
          this.xterm.write('\r\x1b[2mDownloading GAP standard library bundle…\x1b[0m');
        }
        break;
      }

      case 'gap-fetched': {
        if (typeof data.url === 'string' && !this.fetchedSet.has(data.url)) {
          this.fetchedSet.add(data.url);
          if (/^\/gap\/(pkg|lib|grp|tst|doc|hpcgap|dev|benchmark)\//.test(data.url)) {
            this.fetchCount++;
            this.callbacks.onFetchProgress(this.fetchCount, this.manifestTotal);
            if (!this.started && this.xterm) {
              this.xterm.write(
                `\r\x1b[2mLoading GAP… ${this.fetchCount} / ~${this.manifestTotal} modules\x1b[0m`
              );
            }
          }
        }
        break;
      }

      case 'gap-user-files': {
        const changed = (data.changed ?? []) as Array<{
          path: string;
          size: number;
          data: Uint8Array;
        }>;
        const removed = (data.removed ?? []) as string[];

        for (const f of changed) {
          this.files.set(f.path, {
            path: f.path,
            size: f.size,
            data: f.data,
            status: 'ready',
            updatedAt: Date.now(),
          });
          if (f.path === 'semigroup_inspect.json') {
            this.tryParseInspection(f.data);
          }
        }
        for (const p of removed) {
          this.files.delete(p);
        }
        this.emitFiles();
        break;
      }

      case 'gap-file-uploaded': {
        const entry = this.files.get(data.name);
        if (entry && entry.status === 'transferring') {
          entry.status = 'ready';
          this.emitFiles();
        }
        break;
      }

      case 'gap-file-error': {
        for (const entry of this.files.values()) {
          if (entry.status === 'transferring') {
            entry.status = 'failed';
          }
        }
        this.emitFiles();
        break;
      }

      case 'gap-exited': {
        this.terminateWorkerOnly();
        for (const entry of this.files.values()) {
          entry.status = 'previous';
        }
        this.emitFiles();
        this.setStatus('shell');
        this.shellInputDisposable = this.xterm!.onData((chunk) => {
          this.shell.handleInput(chunk);
        });
        this.shell.activate(true);
        break;
      }
    }
  }

  private tryParseInspection(bytes: Uint8Array): void {
    try {
      const text = new TextDecoder().decode(bytes);
      const parsed = JSON.parse(text) as SemigroupInspection;
      if (parsed && Array.isArray(parsed.dClasses)) {
        this.callbacks.onInspectionChange(parsed);
      }
    } catch (err) {
      console.warn('Could not parse semigroup_inspect.json:', err);
    }
  }

  private waitMailboxState(want: number): Promise<void> {
    const ctrl = this.mbCtrl;
    return new Promise((resolve, reject) => {
      const check = () => {
        if (this.sessionDead || !ctrl) {
          reject(new Error('session restarted'));
          return;
        }
        const cur = Atomics.load(ctrl, MB_STATE);
        if (cur === want) {
          resolve();
          return;
        }
        const waitAsync = (
          Atomics as unknown as {
            waitAsync?: (
              typedArray: Int32Array,
              index: number,
              value: number,
              timeout?: number
            ) => { async: boolean; value: Promise<string> };
          }
        ).waitAsync;

        if (waitAsync) {
          const r = waitAsync(ctrl, MB_STATE, cur, 1000);
          if (r.async) {
            r.value.then(check);
          } else {
            check();
          }
        } else {
          setTimeout(check, 10);
        }
      };
      check();
    });
  }

  private writeChunk(bytes: Uint8Array, flags: number): void {
    if (!this.mbCtrl || !this.mbData) return;
    this.mbData.set(bytes, 0);
    this.mbCtrl[MB_LEN] = bytes.length;
    this.mbCtrl[MB_FLAGS] = flags;
    Atomics.store(this.mbCtrl, MB_STATE, MB_READY);
    Atomics.notify(this.mbCtrl, MB_STATE);
  }

  public async uploadFiles(
    items: Array<{ name: string; data: Uint8Array }>
  ): Promise<void> {
    const now = Date.now();
    for (const item of items) {
      this.files.set(item.name, {
        path: item.name,
        size: item.data.length,
        data: item.data,
        status: this.shell.isActive() ? 'previous' : 'transferring',
        updatedAt: now,
      });
      if (!this.shell.isActive()) {
        this.uploadQueue.push(item);
      }
    }
    this.emitFiles();

    if (this.shell.isActive() || this.senderActive || !this.mbCtrl) {
      return;
    }

    this.senderActive = true;
    try {
      await this.waitMailboxState(MB_IDLE);
      while (this.uploadQueue.length > 0) {
        const f = this.uploadQueue.shift()!;
        const header = new TextEncoder().encode(
          JSON.stringify({ name: f.name, size: f.data.length })
        );
        this.writeChunk(header, MB_FLAG_HEADER);
        await this.waitMailboxState(MB_CONSUMED);

        let off = 0;
        do {
          const n = Math.min(MB_DATA_BYTES, f.data.length - off);
          const last = off + n >= f.data.length;
          this.writeChunk(f.data.subarray(off, off + n), last ? MB_FLAG_FINAL : 0);
          off += n;
          await this.waitMailboxState(MB_CONSUMED);
        } while (off < f.data.length);
      }
      this.writeChunk(new Uint8Array(0), MB_FLAG_END);
      await this.waitMailboxState(MB_IDLE);
    } catch (err) {
      console.warn('Mailbox upload interrupted:', err);
    } finally {
      this.senderActive = false;
    }
  }

  public async resetCacheAndReload(): Promise<void> {
    this.terminateWorkerOnly();
    if (navigator.serviceWorker) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('/gap_idb_cache');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
    window.location.reload();
  }

  public dispose(): void {
    this.resizeObserver?.disconnect();
    this.terminateWorkerOnly();
    this.xterm?.dispose();
  }
}
