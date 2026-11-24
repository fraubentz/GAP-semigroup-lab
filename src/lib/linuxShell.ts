import type { VirtualFileEntry } from '../types/gap';

export interface ShellContext {
  getFiles: () => Map<string, VirtualFileEntry>;
  upsertFile: (path: string, bytes: Uint8Array) => void;
  deleteFile: (path: string) => boolean;
  launchGap: (scriptPath?: string) => void;
  clearTerminal: () => void;
  writeTerminal: (text: string) => void;
}

const PROMPT = '\x1b[1;36mweb_user@gap-wasm\x1b[0m:\x1b[1;34m/home/web_user\x1b[0m$ ';

function tokenizeArgs(line: string): string[] {
  const args: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else if (ch === '\\' && quote === '"' && i + 1 < line.length) {
        cur += line[++i];
      } else {
        cur += ch;
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (/\s/.test(ch)) {
      if (cur.length > 0) {
        args.push(cur);
        cur = '';
      }
    } else {
      cur += ch;
    }
  }
  if (cur.length > 0) args.push(cur);
  return args;
}

function formatSize(bytes: number): string {
  return String(bytes).padStart(7, ' ');
}

export class LinuxShellController {
  private buffer = '';
  private cursor = 0;
  private history: string[] = [];
  private historyIndex = -1;
  private active = false;
  private ctx: ShellContext;

  constructor(ctx: ShellContext) {
    this.ctx = ctx;
  }

  public isActive(): boolean {
    return this.active;
  }

  public activate(showWelcome = true): void {
    this.active = true;
    this.buffer = '';
    this.cursor = 0;
    this.historyIndex = -1;
    if (showWelcome) {
      this.ctx.writeTerminal(
        '\r\n\x1b[2mPOSIX workspace shell (/home/web_user). Type "gap" to start GAP 4 Wasm or "help" for commands.\x1b[0m\r\n'
      );
    }
    this.printPrompt();
  }

  public deactivate(): void {
    this.active = false;
    this.buffer = '';
    this.cursor = 0;
  }

  private printPrompt(): void {
    this.ctx.writeTerminal(PROMPT);
  }

  private redrawLine(): void {
    const moveBack = this.buffer.length - this.cursor;
    let seq = '\r' + PROMPT + this.buffer + '\x1b[K';
    if (moveBack > 0) {
      seq += `\x1b[${moveBack}D`;
    }
    this.ctx.writeTerminal(seq);
  }

  public handleInput(data: string): void {
    if (!this.active) return;

    // Handle escape sequences (arrows)
    if (data === '\x1b[A') {
      // Up arrow
      if (this.history.length > 0) {
        if (this.historyIndex === -1) {
          this.historyIndex = this.history.length - 1;
        } else if (this.historyIndex > 0) {
          this.historyIndex--;
        }
        this.buffer = this.history[this.historyIndex] ?? '';
        this.cursor = this.buffer.length;
        this.redrawLine();
      }
      return;
    }
    if (data === '\x1b[B') {
      // Down arrow
      if (this.historyIndex !== -1) {
        if (this.historyIndex < this.history.length - 1) {
          this.historyIndex++;
          this.buffer = this.history[this.historyIndex] ?? '';
        } else {
          this.historyIndex = -1;
          this.buffer = '';
        }
        this.cursor = this.buffer.length;
        this.redrawLine();
      }
      return;
    }
    if (data === '\x1b[D') {
      if (this.cursor > 0) {
        this.cursor--;
        this.ctx.writeTerminal('\x1b[D');
      }
      return;
    }
    if (data === '\x1b[C') {
      if (this.cursor < this.buffer.length) {
        this.cursor++;
        this.ctx.writeTerminal('\x1b[C');
      }
      return;
    }

    for (let i = 0; i < data.length; i++) {
      const ch = data[i];
      const code = ch.charCodeAt(0);

      if (ch === '\r' || ch === '\n') {
        const line = this.buffer;
        this.ctx.writeTerminal('\r\n');
        this.buffer = '';
        this.cursor = 0;
        this.historyIndex = -1;
        if (line.trim().length > 0) {
          this.history.push(line);
          const launchedGap = this.executeLine(line);
          if (launchedGap) return;
        }
        if (this.active) {
          this.printPrompt();
        }
        return;
      }

      // Ctrl+C
      if (code === 3) {
        this.buffer = '';
        this.cursor = 0;
        this.ctx.writeTerminal('^C\r\n');
        this.printPrompt();
        return;
      }

      // Ctrl+L
      if (code === 12) {
        this.ctx.clearTerminal();
        this.redrawLine();
        return;
      }

      // Tab completion for filenames & commands
      if (ch === '\t') {
        this.handleTabCompletion();
        return;
      }

      // Backspace / DEL
      if (code === 127 || code === 8) {
        if (this.cursor > 0) {
          this.buffer =
            this.buffer.slice(0, this.cursor - 1) + this.buffer.slice(this.cursor);
          this.cursor--;
          this.redrawLine();
        }
        continue;
      }

      // Printable characters
      if (code >= 32) {
        this.buffer =
          this.buffer.slice(0, this.cursor) + ch + this.buffer.slice(this.cursor);
        this.cursor++;
        if (this.cursor === this.buffer.length) {
          this.ctx.writeTerminal(ch);
        } else {
          this.redrawLine();
        }
      }
    }
  }

  private handleTabCompletion(): void {
    const beforeCursor = this.buffer.slice(0, this.cursor);
    const parts = beforeCursor.split(/\s+/);
    const partial = parts[parts.length - 1] ?? '';
    const candidates =
      parts.length <= 1
        ? [
            'gap',
            'ls',
            'cat',
            'head',
            'tail',
            'wc',
            'grep',
            'touch',
            'rm',
            'cp',
            'mv',
            'echo',
            'pwd',
            'uname',
            'whoami',
            'df',
            'clear',
            'semigroups',
            'help',
          ]
        : Array.from(this.ctx.getFiles().keys());

    const matches = candidates.filter((c) => c.startsWith(partial)).sort();
    if (matches.length === 1) {
      const rest = matches[0].slice(partial.length);
      this.buffer =
        this.buffer.slice(0, this.cursor) + rest + this.buffer.slice(this.cursor);
      this.cursor += rest.length;
      this.redrawLine();
    } else if (matches.length > 1) {
      this.ctx.writeTerminal('\r\n' + matches.join('  ') + '\r\n');
      this.redrawLine();
    }
  }

  private writeLine(text: string): void {
    this.ctx.writeTerminal(text.replace(/\r?\n/g, '\r\n') + '\r\n');
  }

  private executeLine(rawLine: string): boolean {
    const trimmed = rawLine.trim();
    if (!trimmed) return false;

    // Basic redirection: echo "..." > file.g
    const redirIdx = trimmed.indexOf('>');
    if (redirIdx !== -1 && trimmed.startsWith('echo ')) {
      const left = trimmed.slice(5, redirIdx).trim();
      const target = trimmed.slice(redirIdx + 1).trim();
      const unquoted = left.replace(/^["']|["']$/g, '');
      if (!target) {
        this.writeLine('sh: syntax error near unexpected token `newline\'');
        return false;
      }
      const cleanName = target.replace(/^\/home\/web_user\//, '').replace(/^\.\//, '');
      this.ctx.upsertFile(cleanName, new TextEncoder().encode(unquoted + '\n'));
      return false;
    }

    const tokens = tokenizeArgs(trimmed);
    const cmd = tokens[0];
    const args = tokens.slice(1);
    const files = this.ctx.getFiles();

    const resolveName = (p: string) =>
      p.replace(/^\/home\/web_user\//, '').replace(/^\.\//, '');

    switch (cmd) {
      case 'help': {
        this.writeLine(
          [
            'Available workspace commands:',
            '  gap [script.g]     Launch GAP 4 WebAssembly REPL (optionally read script)',
            '  semigroups         Show available semigroup packages & toolkit functions',
            '  ls [-l]            List files in /home/web_user',
            '  cat <file>         Print file contents',
            '  head [-n N] <file> Show first lines of a file',
            '  tail [-n N] <file> Show last lines of a file',
            '  wc <file>          Count lines, words, and bytes',
            '  grep <pat> <file>  Search pattern in file',
            '  touch <file>       Create empty file in /home/web_user',
            '  cp <src> <dst>     Copy file',
            '  mv <src> <dst>     Rename/move file',
            '  rm <file>          Delete file',
            '  pwd / whoami       Print working directory / active user',
            '  uname [-a] / df    System & virtual filesystem information',
            '  clear              Clear terminal output',
          ].join('\n')
        );
        return false;
      }

      case 'gap': {
        const script = args[0] ? resolveName(args[0]) : undefined;
        this.deactivate();
        this.ctx.launchGap(script);
        return true;
      }

      case 'semigroups': {
        this.writeLine(
          [
            'Semigroup Theory Capabilities (GAP 4 WebAssembly):',
            '  Core GAP 4:  Transformation, PartialPerm, GreensD/R/L/H/JClasses, EggBoxOfDClass,',
            '               ReesZeroMatrixSemigroup, IsRegularSemigroup, IsInverseSemigroup',
            '  Packages:    smallsemi, numericalsgps, automata, smallantimagmas, grape, sonata',
            '  Toolkit:     Read("semigroups_toolkit.g"); -> DisplayEggBox, SemigroupSummary,',
            '               InspectSemigroup, SingularTransformationSemigroup,',
            '               OrderPreservingTransformationSemigroup, BrandtSemigroup, RectangularBand',
          ].join('\n')
        );
        return false;
      }

      case 'pwd': {
        this.writeLine('/home/web_user');
        return false;
      }

      case 'whoami': {
        this.writeLine('web_user');
        return false;
      }

      case 'uname': {
        if (args.includes('-a')) {
          this.writeLine('Linux gap-wasm 6.8.0-emscripten #1 SMP wasm32 Emscripten POSIX');
        } else {
          this.writeLine('Linux');
        }
        return false;
      }

      case 'df': {
        let total = 0;
        for (const f of files.values()) total += f.size;
        this.writeLine('Filesystem      Size  Used Avail Use% Mounted on');
        this.writeLine(`memfs           512M  ${Math.max(1, Math.round(total / 1024))}K  512M   1% /home/web_user`);
        return false;
      }

      case 'clear': {
        this.ctx.clearTerminal();
        return false;
      }

      case 'ls': {
        const longFmt = args.some((a) => a.startsWith('-') && a.includes('l'));
        const names = Array.from(files.keys()).sort();
        if (names.length === 0) return false;
        if (longFmt) {
          this.writeLine(`total ${names.length}`);
          for (const name of names) {
            const entry = files.get(name)!;
            const date = new Date(entry.updatedAt).toISOString().slice(0, 16).replace('T', ' ');
            this.writeLine(`-rw-r--r-- 1 web_user users ${formatSize(entry.size)} ${date} ${name}`);
          }
        } else {
          this.writeLine(names.join('  '));
        }
        return false;
      }

      case 'cat': {
        if (!args[0]) {
          this.writeLine('cat: missing file operand');
          return false;
        }
        for (const raw of args) {
          const name = resolveName(raw);
          const entry = files.get(name);
          if (!entry) {
            this.writeLine(`cat: ${raw}: No such file or directory`);
          } else {
            this.ctx.writeTerminal(
              new TextDecoder().decode(entry.data).replace(/\r?\n/g, '\r\n')
            );
            if (entry.data.length > 0 && entry.data[entry.data.length - 1] !== 10) {
              this.ctx.writeTerminal('\r\n');
            }
          }
        }
        return false;
      }

      case 'head':
      case 'tail': {
        let n = 10;
        let fileArg = args[0];
        if (args[0] === '-n' && args[1]) {
          n = Math.max(1, parseInt(args[1], 10) || 10);
          fileArg = args[2];
        }
        if (!fileArg) {
          this.writeLine(`${cmd}: missing file operand`);
          return false;
        }
        const entry = files.get(resolveName(fileArg));
        if (!entry) {
          this.writeLine(`${cmd}: ${fileArg}: No such file or directory`);
          return false;
        }
        const lines = new TextDecoder().decode(entry.data).split(/\r?\n/);
        const slice = cmd === 'head' ? lines.slice(0, n) : lines.slice(-n);
        this.writeLine(slice.join('\n'));
        return false;
      }

      case 'wc': {
        if (!args[0]) {
          this.writeLine('wc: missing file operand');
          return false;
        }
        const entry = files.get(resolveName(args[0]));
        if (!entry) {
          this.writeLine(`wc: ${args[0]}: No such file or directory`);
          return false;
        }
        const text = new TextDecoder().decode(entry.data);
        const lines = text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        this.writeLine(` ${lines}  ${words} ${entry.size} ${args[0]}`);
        return false;
      }

      case 'grep': {
        if (args.length < 2) {
          this.writeLine('Usage: grep <pattern> <file>');
          return false;
        }
        const pattern = args[0];
        const entry = files.get(resolveName(args[1]));
        if (!entry) {
          this.writeLine(`grep: ${args[1]}: No such file or directory`);
          return false;
        }
        const lines = new TextDecoder().decode(entry.data).split(/\r?\n/);
        for (const line of lines) {
          if (line.includes(pattern)) this.writeLine(line);
        }
        return false;
      }

      case 'touch': {
        if (!args[0]) {
          this.writeLine('touch: missing file operand');
          return false;
        }
        const name = resolveName(args[0]);
        if (!files.has(name)) {
          this.ctx.upsertFile(name, new Uint8Array(0));
        }
        return false;
      }

      case 'cp': {
        if (args.length < 2) {
          this.writeLine('cp: missing file operand');
          return false;
        }
        const src = files.get(resolveName(args[0]));
        if (!src) {
          this.writeLine(`cp: cannot stat '${args[0]}': No such file`);
          return false;
        }
        this.ctx.upsertFile(resolveName(args[1]), new Uint8Array(src.data));
        return false;
      }

      case 'mv': {
        if (args.length < 2) {
          this.writeLine('mv: missing file operand');
          return false;
        }
        const srcName = resolveName(args[0]);
        const src = files.get(srcName);
        if (!src) {
          this.writeLine(`mv: cannot stat '${args[0]}': No such file`);
          return false;
        }
        this.ctx.upsertFile(resolveName(args[1]), new Uint8Array(src.data));
        this.ctx.deleteFile(srcName);
        return false;
      }

      case 'rm': {
        if (!args[0]) {
          this.writeLine('rm: missing operand');
          return false;
        }
        for (const raw of args) {
          const ok = this.ctx.deleteFile(resolveName(raw));
          if (!ok) this.writeLine(`rm: cannot remove '${raw}': No such file`);
        }
        return false;
      }

      default: {
        this.writeLine(`sh: ${cmd}: command not found (type 'help' or 'gap')`);
        return false;
      }
    }
  }
}
