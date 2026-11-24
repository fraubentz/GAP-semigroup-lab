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

interface PtyTermios {
  iflag: number;
  oflag: number;
  cflag: number;
  lflag: number;
  cc: number[];
  clone: () => PtyTermios;
}

interface PtySlave {
  onReadable: (cb: () => void) => void;
  onWritable: (cb: () => void) => void;
  onSignal: (cb: (sig: string) => void) => void;
  read: (len?: number) => number[];
  write: (buf: number[]) => void;
  writable: boolean;
  ioctl: ((op: 'TCGETS') => PtyTermios) &
    ((op: 'TCSETS', val: PtyTermios) => void) &
    ((op: 'TIOCGWINSZ') => [number, number]);
}

interface PtyMaster {
  dispose: () => void;
}

interface PtyTtyServer {
  start: (worker: Worker, onCustomMessage: (ev: MessageEvent) => void) => void;
  stop?: () => void;
}

declare global {
  interface Window {
    Terminal: new (opts: Record<string, unknown>) => XtermInstance;
    FitAddon: { FitAddon: new () => FitAddonInstance };
    openpty: () => { master: PtyMaster; slave: PtySlave };
    TtyServer: new (slave: PtySlave) => PtyTtyServer;
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
  private firstWriteSeen = false;
  private bootTail = '';
  private readyFallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private fetchCount = 0;
  private manifestTotal = 1519;
  private fetchedSet = new Set<string>();
  private files = new Map<string, VirtualFileEntry>();
  private pendingReadAfterBoot: string | null = null;
  private pendingCodeAfterBoot: string | null = null;
  private shell: LinuxShellController;
  private shellInputDisposable: { dispose: () => void } | null = null;
  private ptyMaster: PtyMaster | null = null;
  private ttyServer: PtyTtyServer | null = null;
  private status: EngineStatus = 'booting';
  private bridgeSid: string | null = null;
  private bridgeBaseUrl = '/api/tty-bridge';
  private bridgeAbort: AbortController | null = null;

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
    if (typeof WebAssembly !== 'object') {
      this.setStatus('unsupported', 'WebAssembly is not supported in this browser.');
      return;
    }

    const baseUrl = import.meta.env.BASE_URL || './';
    const cleanBase = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';

    fetch(`${cleanBase}gap/startup_manifest.json`)
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
    if (
      this.shell.isActive() ||
      this.sessionDead ||
      this.status === 'error' ||
      this.status === 'exited' ||
      !this.worker
    ) {
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
      this.shellInputDisposable?.dispose();
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
    if (this.readyFallbackTimer) {
      clearTimeout(this.readyFallbackTimer);
      this.readyFallbackTimer = null;
    }
    if (this.ttyServer) {
      this.ttyServer.stop?.();
      this.ttyServer = null;
    }
    if (this.ptyMaster) {
      this.ptyMaster.dispose();
      this.ptyMaster = null;
    }
    if (this.bridgeAbort) {
      this.bridgeAbort.abort();
      this.bridgeAbort = null;
    }
    if (this.bridgeSid) {
      const sid = this.bridgeSid;
      const closeUrl = `${this.bridgeBaseUrl.replace(/\/+$/, '')}/close`;
      this.bridgeSid = null;
      void fetch(closeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sid }),
      }).catch(() => {});
    }
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
    if (this.readyFallbackTimer) {
      clearTimeout(this.readyFallbackTimer);
      this.readyFallbackTimer = null;
    }
    this.sessionDead = false;
    this.started = false;
    this.firstWriteSeen = false;
    this.bootTail = '';
    this.fetchCount = 0;
    this.fetchedSet.clear();
    this.senderActive = false;
    this.uploadQueue = [];

    if (!freshTerminal) {
      this.createTerminal();
    }

    this.setStatus('booting', 'Initializing GAP 4 WebAssembly kernel…');

    this.ptyMaster?.dispose();
    const { master, slave } = window.openpty();
    this.ptyMaster = master;
    this.xterm!.loadAddon(master);

    const useSab = typeof SharedArrayBuffer !== 'undefined' && window.crossOriginIsolated;
    const baseUrl = import.meta.env.BASE_URL || './';
    const cleanBase = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
    const worker = new Worker(`${cleanBase}gap/gap-worker.js`);
    this.worker = worker;

    if (useSab) {
      this.bridgeSid = null;
      const mailbox = new SharedArrayBuffer(MB_CTRL_BYTES + MB_DATA_BYTES);
      this.mbCtrl = new Int32Array(mailbox, 0, 4);
      this.mbData = new Uint8Array(mailbox, MB_CTRL_BYTES);
      worker.postMessage({ type: 'gap-init', mailbox });
    } else {
      this.mbCtrl = null;
      this.mbData = null;
      const sid =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      this.bridgeSid = sid;
      worker.postMessage({ type: 'gap-init', sid });
    }

    const priorUserFiles = Array.from(this.files.values())
      .filter((f) => f.path !== 'semigroups_toolkit.g' && f.path !== 'semigroup_lab.g')
      .map((f) => ({ name: f.path, data: f.data }));

    if (priorUserFiles.length > 0) {
      void this.uploadFiles(priorUserFiles);
    }

    const markGapReady = () => {
      if (this.started || this.sessionDead) return;
      this.started = true;
      if (this.readyFallbackTimer) {
        clearTimeout(this.readyFallbackTimer);
        this.readyFallbackTimer = null;
      }
      this.setStatus('ready');
      if (this.pendingReadAfterBoot) {
        const script = this.pendingReadAfterBoot;
        this.pendingReadAfterBoot = null;
        setTimeout(() => {
          this.paste(`Read(${gapQuote(script)});\n`);
        }, 120);
      } else if (this.pendingCodeAfterBoot) {
        const code = this.pendingCodeAfterBoot;
        this.pendingCodeAfterBoot = null;
        setTimeout(() => {
          this.paste(code.endsWith('\n') ? code : code + '\n');
        }, 120);
      }
    };

    const utf8 = new TextDecoder();
    worker.addEventListener('message', (ev: MessageEvent) => {
      const d = ev.data;
      if (d && d.ttyRequestType === 'write' && !this.started) {
        if (!this.firstWriteSeen) {
          this.firstWriteSeen = true;
          this.xterm?.reset();
          this.readyFallbackTimer = setTimeout(markGapReady, 5000);
        }
        if (Array.isArray(d.buf)) {
          const textChunk = utf8.decode(new Uint8Array(d.buf), { stream: true });
          this.bootTail = (this.bootTail + textChunk).slice(-128);
          if (/gap>\s*$/.test(this.bootTail)) {
            markGapReady();
          }
        }
      }
    });

    worker.addEventListener('error', (err) => {
      const msg = err.message || 'GAP WebAssembly worker crashed';
      this.xterm?.write(`\r\n\x1b[1;31m[Worker error]\x1b[0m ${msg}\r\n`);
      this.setStatus('error', msg);
    });

    if (useSab) {
      const ttyServer = new window.TtyServer(slave);
      this.ttyServer = ttyServer;
      ttyServer.start(worker, (ev: MessageEvent) => this.handleWorkerMessage(ev));
    } else {
      this.ttyServer = null;
      this.startBridgeTtyServer(slave, worker, this.bridgeSid!);
    }

    this.xterm!.write(
      '\x1b[1;36mweb_user@gap-wasm\x1b[0m:\x1b[1;34m/home/web_user\x1b[0m$ gap -l /\r\n' +
        '\x1b[2mBooting GAP 4 WebAssembly runtime (gap.wasm) + virtual filesystem…\x1b[0m\r\n'
    );
  }

  private startBridgeTtyServer(slave: PtySlave, worker: Worker, sid: string): void {
    const abort = new AbortController();
    this.bridgeAbort = abort;

    const hasSwBridge =
      typeof navigator !== 'undefined' && Boolean(navigator.serviceWorker?.controller);
    const baseUrl = import.meta.env.BASE_URL || './';
    const cleanBase = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
    const bridgeBaseUrl = hasSwBridge
      ? new URL(`${cleanBase}__tty_bridge__`, window.location.href).href.replace(/\/+$/, '')
      : '/api/tty-bridge';
    this.bridgeBaseUrl = bridgeBaseUrl;

    const fromWorkerBuf: number[] = [];
    const toWorkerBuf: number[] = [];
    let pendingWaiter: (() => void) | null = null;

    const feedFromWorker = () => {
      if (fromWorkerBuf.length === 0) return;
      if (slave.writable) {
        slave.write(fromWorkerBuf.splice(0));
      }
    };

    slave.onWritable(() => {
      if (fromWorkerBuf.length > 0) {
        feedFromWorker();
      }
    });

    slave.onReadable(() => {
      toWorkerBuf.push(...slave.read());
      if (pendingWaiter && toWorkerBuf.length > 0) {
        const w = pendingWaiter;
        pendingWaiter = null;
        w();
      }
    });

    const termiosToData = (t: PtyTermios): number[] => {
      const e = [t.iflag, t.oflag, t.cflag, t.lflag];
      let i = 0;
      let o = 8;
      for (let r = 0; r < t.cc.length; r++) {
        i |= t.cc[r] << o;
        o += 8;
        if (o === 32) {
          e.push(i);
          i = 0;
          o = 0;
        }
      }
      e.push(i);
      return e;
    };

    const dataToTermios = (t: number[], sample: PtyTermios): PtyTermios => {
      const cc: number[] = [];
      let o = 4;
      let r = t[o++] || 0;
      let s = 8;
      for (let n = 0; n < 32; n++) {
        cc.push((r >> s) & 255);
        s += 8;
        if (s >= 32) {
          r = t[o++] || 0;
          s = 0;
        }
      }
      const Ctor = sample.constructor as new (
        iflag: number,
        oflag: number,
        cflag: number,
        lflag: number,
        cc: number[]
      ) => PtyTermios;
      return new Ctor(t[0] || 0, t[1] || 0, t[2] || 0, t[3] || 0, cc);
    };

    worker.onmessage = (ev: MessageEvent) => {
      const d = ev.data;
      if (d && typeof d === 'object') {
        if (d.ttyRequestType === 'write') {
          if (Array.isArray(d.buf)) {
            fromWorkerBuf.push(...d.buf);
            feedFromWorker();
          }
          return;
        }
        if (d.ttyRequestType === 'tcsets') {
          if (Array.isArray(d.data)) {
            const sample = slave.ioctl('TCGETS');
            slave.ioctl('TCSETS', dataToTermios(d.data, sample));
          }
          return;
        }
      }
      this.handleWorkerMessage(ev);
    };

    const waitForReadable = (timeoutSec: number): Promise<boolean> => {
      if (toWorkerBuf.length > 0) return Promise.resolve(true);
      if (timeoutSec === 0) return Promise.resolve(false);
      return new Promise((resolve) => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        const done = (ok: boolean) => {
          if (timer) clearTimeout(timer);
          if (pendingWaiter === onInput) pendingWaiter = null;
          resolve(ok);
        };
        const onInput = () => done(true);
        pendingWaiter = onInput;
        if (timeoutSec > 0) {
          timer = setTimeout(() => done(false), timeoutSec * 1000);
        }
        abort.signal.addEventListener('abort', () => done(false), { once: true });
      });
    };

    const handleBridgeReq = async (
      reqId: string,
      req: { ttyRequestType: string; length?: number; timeout?: number; data?: number[] }
    ) => {
      let streamData: number[] = [];
      switch (req.ttyRequestType) {
        case 'read': {
          if (toWorkerBuf.length === 0) {
            await waitForReadable(-1);
          }
          if (abort.signal.aborted) return;
          const maxLen = Math.min(req.length || 256, toWorkerBuf.length);
          const chunk = toWorkerBuf.splice(0, maxLen);
          streamData = [chunk.length, ...chunk];
          break;
        }
        case 'poll': {
          const ok = await waitForReadable(req.timeout ?? -1);
          if (abort.signal.aborted) return;
          if (ok && toWorkerBuf.length > 0) {
            const chunk = toWorkerBuf.splice(0, Math.min(256, toWorkerBuf.length));
            streamData = [1, chunk.length, ...chunk];
          } else {
            streamData = [ok ? 1 : 2];
          }
          break;
        }
        case 'tcgets': {
          streamData = termiosToData(slave.ioctl('TCGETS'));
          break;
        }
        case 'tcsets': {
          if (Array.isArray(req.data)) {
            const sample = slave.ioctl('TCGETS');
            slave.ioctl('TCSETS', dataToTermios(req.data, sample));
          }
          streamData = [];
          break;
        }
        case 'tiocgwinsz': {
          const [cols, rows] = slave.ioctl('TIOCGWINSZ');
          streamData = [cols, rows];
          break;
        }
      }

      if (abort.signal.aborted) return;
      await fetch(`${bridgeBaseUrl}/res`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sid, reqId, streamData }),
        signal: abort.signal,
      }).catch(() => {});
    };

    const pollLoop = async () => {
      while (!abort.signal.aborted) {
        try {
          const r = await fetch(`${bridgeBaseUrl}/next`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sid }),
            signal: abort.signal,
          });
          if (r.status === 404 || r.status === 405) {
            break;
          }
          if (!r.ok) {
            await new Promise((res) => setTimeout(res, r.status === 429 ? 500 : 250));
            continue;
          }
          const data = (await r.json()) as {
            closed?: boolean;
            reqId?: string;
            req?: { ttyRequestType: string; length?: number; timeout?: number; data?: number[] } | null;
          };
          if (data.closed) break;
          if (data.reqId && data.req) {
            await handleBridgeReq(data.reqId, data.req);
          }
        } catch {
          if (abort.signal.aborted) break;
          await new Promise((res) => setTimeout(res, 250));
        }
      }
    };

    void pollLoop();
    worker.postMessage({
      type: 'tty-bridge-start',
      sid,
      bridgeBaseUrl,
      termios: termiosToData(slave.ioctl('TCGETS')),
      winsize: slave.ioctl('TIOCGWINSZ'),
    });
  }

  private handleWorkerMessage(ev: MessageEvent): void {
    const data = ev.data;
    if (!data || !data.type) return;

    switch (data.type) {
      case 'gap-boot-stage': {
        if (!this.started && typeof data.stage === 'string') {
          this.setStatus('booting', data.stage);
          if (this.xterm) {
            this.xterm.write(`\r\x1b[2K\x1b[2m${data.stage}\x1b[0m`);
          }
        }
        break;
      }

      case 'gap-bundle-status': {
        if (!this.started && this.xterm) {
          this.xterm.write('\r\x1b[2K\x1b[2mDownloading GAP standard library bundle…\x1b[0m');
        }
        break;
      }

      case 'gap-fetched': {
        if (typeof data.url === 'string' && !this.fetchedSet.has(data.url)) {
          this.fetchedSet.add(data.url);
          if (/(?:^|\/)gap\/(pkg|lib|grp|tst|doc|hpcgap|dev|benchmark)\//.test(data.url)) {
            this.fetchCount++;
            this.callbacks.onFetchProgress(this.fetchCount, this.manifestTotal);
            if (!this.started && this.xterm) {
              this.xterm.write(
                `\r\x1b[2K\x1b[2mLoading GAP… ${this.fetchCount} / ~${this.manifestTotal} modules\x1b[0m`
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

      case 'gap-worker-error': {
        const msg = typeof data.error === 'string' ? data.error : 'GAP WebAssembly worker failed';
        this.xterm?.write(`\r\n\x1b[1;31m[Worker error]\x1b[0m ${msg}\r\n`);
        this.setStatus('error', msg);
        break;
      }

      case 'gap-exited': {
        this.terminateWorkerOnly();
        for (const entry of this.files.values()) {
          entry.status = 'previous';
        }
        this.emitFiles();
        this.setStatus('shell');
        if (this.xterm) {
          this.shellInputDisposable?.dispose();
          this.shellInputDisposable = this.xterm.onData((chunk) => {
            this.shell.handleInput(chunk);
          });
          this.shell.activate(true);
        }
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

    if (this.shell.isActive()) {
      return;
    }

    if (this.bridgeSid) {
      const encodeBase64 = (bytes: Uint8Array): string => {
        let bin = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
        }
        return btoa(bin);
      };
      try {
        const uploadUrl = `${this.bridgeBaseUrl.replace(/\/+$/, '')}/upload`;
        await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sid: this.bridgeSid,
            files: items.map((item) => ({
              name: item.name,
              dataBase64: encodeBase64(item.data),
            })),
          }),
        });
      } catch (err) {
        console.warn('Bridge upload failed:', err);
      }
      return;
    }

    if (this.senderActive || !this.mbCtrl) {
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
