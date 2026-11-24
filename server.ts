import { execFile } from 'child_process';
import express from 'express';
import fs from 'fs';
import fsp from 'fs/promises';
import http from 'http';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import zlib from 'zlib';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const HOST = '0.0.0.0';
const PUBLIC_DIR = path.resolve(__dirname, 'public');
const GAP_PUBLIC_DIR = path.resolve(PUBLIC_DIR, 'gap');
const CACHE_DIR = path.resolve(__dirname, '.gap-cache');
const DIST_DIR = path.resolve(__dirname, 'dist');
const UPSTREAM_BASE = 'https://raw.githubusercontent.com/fraubentz/gap-in-the-browser/gh-pages';
const GAP_BINARY_UPSTREAM = 'https://raw.githubusercontent.com/fraubentz/GAP-semigroup-lab/main/public/gap';
const SEMIGROUPS_TARBALL_URL =
  'https://github.com/semigroups/Semigroups/releases/download/v5.7.1/semigroups-5.7.1.tar.gz';

const ALLOWED_GAP_PREFIXES = new Set([
  'lib',
  'pkg',
  'grp',
  'doc',
  'tst',
  'hpcgap',
  'dev',
  'benchmark',
]);

let validGapFiles: Set<string> = new Set();
let startupManifestList: string[] = [];
let startupManifestSet: Set<string> = new Set();
let gapBuildId = 'unknown';

async function loadGapMetadata(): Promise<void> {
  try {
    const fsJsonRaw = await fsp.readFile(path.join(GAP_PUBLIC_DIR, 'gap-fs.json'), 'utf8');
    const list = JSON.parse(fsJsonRaw) as string[];
    validGapFiles = new Set(list);
  } catch (err) {
    console.warn('Could not load public/gap/gap-fs.json:', err);
  }

  try {
    const manifestRaw = await fsp.readFile(path.join(GAP_PUBLIC_DIR, 'startup_manifest.json'), 'utf8');
    startupManifestList = JSON.parse(manifestRaw) as string[];
    startupManifestSet = new Set(
      startupManifestList.map((p) => (p.startsWith('/') ? p.slice(1) : p))
    );
  } catch (err) {
    console.warn('Could not load public/gap/startup_manifest.json:', err);
  }

  try {
    gapBuildId = (await fsp.readFile(path.join(GAP_PUBLIC_DIR, 'build-id'), 'utf8')).trim();
  } catch {
    gapBuildId = 'local';
  }
}

const inflightFetches = new Map<string, Promise<Buffer>>();
const inflightBinaryFetches = new Map<string, Promise<string>>();
let semigroupsPromise: Promise<void> | null = null;

async function ensureSemigroupsPackage(): Promise<void> {
  const pkgDir = path.join(CACHE_DIR, 'pkg', 'semigroups');
  const marker = path.join(pkgDir, 'PackageInfo.g');
  try {
    await fsp.access(marker);
    return;
  } catch {
    // Not extracted yet
  }

  if (semigroupsPromise) {
    return semigroupsPromise;
  }

  semigroupsPromise = (async () => {
    await fsp.mkdir(path.join(CACHE_DIR, 'pkg'), { recursive: true });
    const tgzPath = path.join(CACHE_DIR, '_semigroups-5.7.1.tar.gz.tmp');
    const extractTmpDir = path.join(CACHE_DIR, 'pkg', '_semigroups_tmp');

    const res = await fetch(SEMIGROUPS_TARBALL_URL, { signal: AbortSignal.timeout(120000) });
    if (!res.ok || !res.body) {
      throw new Error(`Failed to download Semigroups package (${res.status})`);
    }
    await pipeline(
      Readable.fromWeb(res.body as unknown as import('stream/web').ReadableStream),
      fs.createWriteStream(tgzPath)
    );

    await fsp.rm(extractTmpDir, { recursive: true, force: true });
    await fsp.mkdir(extractTmpDir, { recursive: true });
    await execFileAsync('tar', ['-xzf', tgzPath, '--strip-components=1', '-C', extractTmpDir]);
    await fsp.rm(tgzPath, { force: true });
    await fsp.rm(pkgDir, { recursive: true, force: true });
    await fsp.rename(extractTmpDir, pkgDir);
  })();

  try {
    await semigroupsPromise;
  } finally {
    semigroupsPromise = null;
  }
}

async function ensureGapBinary(name: 'gap.js' | 'gap.wasm'): Promise<{ rawPath: string; gzPath: string }> {
  const cachedPath = path.join(CACHE_DIR, name);
  const gzPath = `${cachedPath}.gz`;

  const hasRaw = await fsp
    .stat(cachedPath)
    .then((st) => st.isFile() && st.size > 0)
    .catch(() => false);
  const hasGz = await fsp
    .stat(gzPath)
    .then((st) => st.isFile() && st.size > 0)
    .catch(() => false);

  if (hasRaw && hasGz) {
    return { rawPath: cachedPath, gzPath };
  }

  const existing = inflightBinaryFetches.get(name);
  if (existing) {
    await existing;
    return { rawPath: cachedPath, gzPath };
  }

  const task = (async () => {
    await fsp.mkdir(CACHE_DIR, { recursive: true });
    if (!hasRaw) {
      const url = `${GAP_BINARY_UPSTREAM}/${name}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(180000) });
      if (!res.ok || !res.body) {
        throw new Error(`Upstream fetch failed (${res.status}) for ${name}`);
      }
      const tmpPath = `${cachedPath}.tmp`;
      await pipeline(
        Readable.fromWeb(res.body as unknown as import('stream/web').ReadableStream),
        fs.createWriteStream(tmpPath)
      );
      await fsp.rename(tmpPath, cachedPath);
    }

    if (!hasGz) {
      const gzTmpPath = `${gzPath}.tmp`;
      await pipeline(
        fs.createReadStream(cachedPath),
        zlib.createGzip({ level: 6 }),
        fs.createWriteStream(gzTmpPath)
      );
      await fsp.rename(gzTmpPath, gzPath);
    }
    return cachedPath;
  })();

  inflightBinaryFetches.set(name, task);
  try {
    await task;
    return { rawPath: cachedPath, gzPath };
  } finally {
    inflightBinaryFetches.delete(name);
  }
}

function isAllowedGapPath(relPath: string): boolean {
  if (!relPath || relPath.includes('..') || relPath.startsWith('/')) return false;
  const topDir = relPath.split('/')[0];
  if (!ALLOWED_GAP_PREFIXES.has(topDir)) return false;
  if (validGapFiles.size > 0) {
    return validGapFiles.has(relPath) || startupManifestSet.has(relPath);
  }
  return true;
}

async function fetchAndCacheGapFile(relPath: string): Promise<Buffer> {
  if (!isAllowedGapPath(relPath)) {
    throw new Error(`Disallowed GAP asset path: ${relPath}`);
  }

  const normalizedRel = relPath.startsWith('pkg/semigrp/')
    ? `pkg/semigroups/${relPath.slice('pkg/semigrp/'.length)}`
    : relPath;

  if (normalizedRel.startsWith('pkg/semigroups/')) {
    await ensureSemigroupsPackage();
  }

  const resolvedCachePath = path.resolve(CACHE_DIR, normalizedRel);
  if (!resolvedCachePath.startsWith(CACHE_DIR + path.sep)) {
    throw new Error('Path traversal blocked');
  }

  try {
    return await fsp.readFile(resolvedCachePath);
  } catch {
    // Cache miss — deduplicate concurrent fetches for the same file
  }

  const existing = inflightFetches.get(normalizedRel);
  if (existing) return existing;

  const task = (async () => {
    const encoded = normalizedRel.split('/').map(encodeURIComponent).join('/');
    const url = `${UPSTREAM_BASE}/${encoded}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) {
      throw new Error(`Upstream fetch failed (${res.status}) for ${normalizedRel}`);
    }
    const arrayBuf = await res.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    await fsp.mkdir(path.dirname(resolvedCachePath), { recursive: true });
    await fsp.writeFile(resolvedCachePath, buf);
    return buf;
  })();

  inflightFetches.set(normalizedRel, task);
  try {
    return await task;
  } finally {
    inflightFetches.delete(normalizedRel);
  }
}

let startupBundlePromise: Promise<string> | null = null;

async function ensureStartupBundle(): Promise<string> {
  const bundleGzPath = path.join(CACHE_DIR, `_startup_bundle_${gapBuildId}.json.gz`);
  try {
    await fsp.access(bundleGzPath);
    return bundleGzPath;
  } catch {
    // Build it once
  }

  if (startupBundlePromise) {
    return startupBundlePromise;
  }

  startupBundlePromise = (async () => {
    await fsp.mkdir(CACHE_DIR, { recursive: true });
    await ensureSemigroupsPackage().catch((err) => {
      console.warn('Semigroups package pre-fetch warning:', err);
    });
    const filesMap: Record<string, string> = {};
    const batchSize = 16;

    for (let i = 0; i < startupManifestList.length; i += batchSize) {
      const batch = startupManifestList.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (rawPath) => {
          const cleanPath = rawPath.startsWith('/') ? rawPath.slice(1) : rawPath;
          if (!isAllowedGapPath(cleanPath)) return;
          try {
            const buf = await fetchAndCacheGapFile(cleanPath);
            filesMap[cleanPath] = buf.toString('base64');
          } catch (err) {
            console.warn(`Startup bundle skip (${cleanPath}):`, err);
          }
        })
      );
    }

    const jsonBuf = Buffer.from(JSON.stringify({ buildId: gapBuildId, files: filesMap }));
    const gzBuf = await new Promise<Buffer>((resolve, reject) => {
      zlib.gzip(jsonBuf, { level: 6 }, (err, out) => (err ? reject(err) : resolve(out)));
    });
    const tmpPath = `${bundleGzPath}.tmp`;
    await fsp.writeFile(tmpPath, gzBuf);
    await fsp.rename(tmpPath, bundleGzPath);
    return bundleGzPath;
  })();

  try {
    return await startupBundlePromise;
  } finally {
    startupBundlePromise = null;
  }
}

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.wasm':
      return 'application/wasm';
    case '.js':
    case '.mjs':
      return 'application/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.woff2':
      return 'font/woff2';
    case '.gz':
      return 'application/gzip';
    case '.g':
    case '.gd':
    case '.gi':
    case '.grp':
    case '.txt':
    case '.md':
      return 'text/plain; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

async function createApp() {
  await loadGapMetadata();

  // Pre-warm startup bundle and GAP wasm binaries in the background without blocking server boot
  void ensureGapBinary('gap.js').catch((err) => {
    console.warn('Background gap.js prewarm warning:', err);
  });
  void ensureGapBinary('gap.wasm').catch((err) => {
    console.warn('Background gap.wasm prewarm warning:', err);
  });
  if (startupManifestList.length > 0) {
    void ensureStartupBundle().catch((err) => {
      console.warn('Background GAP startup bundle prewarm warning:', err);
    });
  }

  const app = express();
  app.disable('x-powered-by');

  // Appropriate Security Headers for WebAssembly, SharedArrayBuffer, and Cross-Origin Isolation
  app.use((req, res, next) => {
    const fetchDest = req.headers['sec-fetch-dest'];
    const needsIsolationHeaders =
      fetchDest === 'document' || fetchDest === 'worker' || fetchDest === 'sharedworker';
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    if (needsIsolationHeaders) {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      res.setHeader('Origin-Agent-Cluster', '?1');
      res.setHeader(
        'Content-Security-Policy',
        [
          "default-src 'self'",
          "script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline'",
          "worker-src 'self' blob:",
          "style-src 'self' 'unsafe-inline'",
          "font-src 'self' data:",
          "img-src 'self' data: blob:",
          "connect-src 'self' wss: ws:",
          "object-src 'none'",
          "base-uri 'self'",
        ].join('; ')
      );
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      gapBuildId,
      startupManifestCount: startupManifestList.length,
      totalFsEntries: validGapFiles.size,
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Content-Security-Policy': "script-src 'self' 'wasm-unsafe-eval'",
        'Origin-Agent-Cluster': '?1',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  });

  // Sync-XHR PTY bridge for environments without SharedArrayBuffer (e.g. unisolated iframes)
  interface BridgeUploadItem {
    name: string;
    dataBase64: string;
  }
  interface BridgePendingReq {
    reqId: string;
    req: unknown;
    dispatched: boolean;
    resolve?: (payload: { streamData: number[]; uploads: BridgeUploadItem[]; closed?: boolean }) => void;
  }
  interface BridgeSession {
    lastSeen: number;
    closed: boolean;
    pendingReqs: BridgePendingReq[];
    completedReqs: Map<string, { streamData: number[]; uploads: BridgeUploadItem[] }>;
    nextWaiter: ((payload: { reqId: string; req: unknown } | null) => void) | null;
    uploads: BridgeUploadItem[];
  }

  const bridgeSessions = new Map<string, BridgeSession>();

  const getOrCreateBridgeSession = (sid: string): BridgeSession => {
    let s = bridgeSessions.get(sid);
    if (!s) {
      s = {
        lastSeen: Date.now(),
        closed: false,
        pendingReqs: [],
        completedReqs: new Map(),
        nextWaiter: null,
        uploads: [],
      };
      bridgeSessions.set(sid, s);
    }
    s.lastSeen = Date.now();
    return s;
  };

  setInterval(() => {
    const cutoff = Date.now() - 5 * 60 * 1000;
    for (const [sid, s] of bridgeSessions.entries()) {
      if (s.lastSeen < cutoff) {
        s.closed = true;
        s.nextWaiter?.(null);
        for (const p of s.pendingReqs) {
          p.resolve?.({ streamData: [], uploads: [], closed: true });
        }
        bridgeSessions.delete(sid);
      }
    }
  }, 60_000).unref();

  app.use('/api/tty-bridge', express.json({ limit: '50mb' }));

  app.post('/api/tty-bridge/req', async (req, res) => {
    const { sid, reqId, req: ttyReq } = (req.body || {}) as {
      sid?: string;
      reqId?: string;
      req?: unknown;
    };
    if (!sid || !reqId || !ttyReq) {
      res.status(400).json({ error: 'Invalid bridge request' });
      return;
    }
    const session = getOrCreateBridgeSession(sid);
    if (session.closed) {
      res.json({ closed: true });
      return;
    }

    const completed = session.completedReqs.get(reqId);
    if (completed) {
      session.completedReqs.delete(reqId);
      res.json(completed);
      return;
    }

    let entry = session.pendingReqs.find((p) => p.reqId === reqId);
    if (!entry) {
      entry = { reqId, req: ttyReq, dispatched: false };
      session.pendingReqs.push(entry);
    }

    if (!entry.dispatched && session.nextWaiter) {
      entry.dispatched = true;
      const waiter = session.nextWaiter;
      session.nextWaiter = null;
      waiter({ reqId: entry.reqId, req: entry.req });
    }

    const result = await new Promise<{
      retry?: boolean;
      closed?: boolean;
      streamData?: number[];
      uploads?: BridgeUploadItem[];
    }>((resolve) => {
      const timer = setTimeout(() => {
        if (entry && entry.resolve === onResolve) {
          entry.resolve = undefined;
        }
        resolve({ retry: true });
      }, 15_000);

      const onResolve = (payload: { streamData: number[]; uploads: BridgeUploadItem[]; closed?: boolean }) => {
        clearTimeout(timer);
        resolve(payload);
      };

      entry!.resolve = onResolve;

      res.on('close', () => {
        if (!res.writableEnded) {
          clearTimeout(timer);
          if (entry && entry.resolve === onResolve) {
            entry.resolve = undefined;
          }
        }
      });
    });

    res.json(result);
  });

  app.post('/api/tty-bridge/next', async (req, res) => {
    const { sid } = (req.body || {}) as { sid?: string };
    if (!sid) {
      res.status(400).json({ error: 'Missing sid' });
      return;
    }
    const session = getOrCreateBridgeSession(sid);
    if (session.closed) {
      res.json({ closed: true });
      return;
    }

    const pending = session.pendingReqs.find((p) => !p.dispatched);
    if (pending) {
      pending.dispatched = true;
      res.json({ reqId: pending.reqId, req: pending.req });
      return;
    }

    const nextReq = await new Promise<{ reqId: string; req: unknown } | null>((resolve) => {
      const timer = setTimeout(() => {
        if (session.nextWaiter === onWait) {
          session.nextWaiter = null;
        }
        resolve(null);
      }, 20_000);

      const onWait = (payload: { reqId: string; req: unknown } | null) => {
        clearTimeout(timer);
        resolve(payload);
      };

      if (session.nextWaiter) {
        session.nextWaiter(null);
      }
      session.nextWaiter = onWait;

      res.on('close', () => {
        if (!res.writableEnded) {
          clearTimeout(timer);
          if (session.nextWaiter === onWait) {
            session.nextWaiter = null;
          }
        }
      });
    });

    if (session.closed) {
      res.json({ closed: true });
      return;
    }
    res.json(nextReq ?? { req: null });
  });

  app.post('/api/tty-bridge/res', (req, res) => {
    const { sid, reqId, streamData } = (req.body || {}) as {
      sid?: string;
      reqId?: string;
      streamData?: number[];
    };
    if (!sid || !reqId) {
      res.status(400).json({ error: 'Missing sid or reqId' });
      return;
    }
    const session = bridgeSessions.get(sid);
    if (!session || session.closed) {
      res.json({ ok: false });
      return;
    }
    session.lastSeen = Date.now();
    const uploads = session.uploads.splice(0);
    const payload = { streamData: Array.isArray(streamData) ? streamData : [], uploads };
    const idx = session.pendingReqs.findIndex((p) => p.reqId === reqId);
    if (idx !== -1) {
      const [entry] = session.pendingReqs.splice(idx, 1);
      if (entry.resolve) {
        entry.resolve(payload);
      } else {
        session.completedReqs.set(reqId, payload);
      }
    } else {
      session.completedReqs.set(reqId, payload);
    }
    res.json({ ok: true });
  });

  app.post('/api/tty-bridge/upload', (req, res) => {
    const { sid, files } = (req.body || {}) as {
      sid?: string;
      files?: BridgeUploadItem[];
    };
    if (!sid || !Array.isArray(files)) {
      res.status(400).json({ error: 'Invalid upload payload' });
      return;
    }
    const session = getOrCreateBridgeSession(sid);
    for (const f of files) {
      if (f && typeof f.name === 'string' && typeof f.dataBase64 === 'string') {
        session.uploads.push(f);
      }
    }
    res.json({ ok: true });
  });

  app.post('/api/tty-bridge/close', (req, res) => {
    const { sid } = (req.body || {}) as { sid?: string };
    if (sid) {
      const session = bridgeSessions.get(sid);
      if (session) {
        session.closed = true;
        session.nextWaiter?.(null);
        session.nextWaiter = null;
        for (const p of session.pendingReqs) {
          p.resolve?.({ streamData: [], uploads: [], closed: true });
        }
        session.pendingReqs.length = 0;
        setTimeout(() => bridgeSessions.delete(sid), 10_000).unref();
      }
    }
    res.json({ ok: true });
  });

  // Fast single-request startup bundle for the 1,519 GAP startup files
  app.get('/gap/startup-bundle.json', async (req, res) => {
    try {
      const bundleGzPath = await ensureStartupBundle();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Vary', 'Accept-Encoding');
      const acceptEncoding = req.headers['accept-encoding'] || '';
      if (acceptEncoding.includes('gzip')) {
        const st = fs.statSync(bundleGzPath);
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Content-Length', String(st.size));
        fs.createReadStream(bundleGzPath).pipe(res);
      } else {
        fs.createReadStream(bundleGzPath).pipe(zlib.createGunzip()).pipe(res);
      }
    } catch (err) {
      console.error('Failed to build startup bundle:', err);
      res.status(503).json({ error: 'Startup bundle temporarily unavailable' });
    }
  });

  // Serve raw gzipped gap.wasm as application/octet-stream (client decompresses via DecompressionStream)
  // to avoid proxy Content-Encoding stripping or 32 MB uncompressed response limits on application/wasm.
  app.get('/gap/gap.wasm.gzbin', async (_req, res) => {
    try {
      const { gzPath } = await ensureGapBinary('gap.wasm');
      const gzStat = fs.statSync(gzPath);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Content-Length', String(gzStat.size));
      fs.createReadStream(gzPath).pipe(res);
    } catch (err) {
      console.warn('GAP wasm.gzbin fetch failed:', err);
      res.status(503).send('GAP WebAssembly runtime temporarily unavailable');
    }
  });

  // Serve local /gap/* static files & lazy-cached GAP library/package files
  app.get('/gap/*', async (req, res) => {
    const rawParam = (req.params as Record<string, string>)[0] || '';
    const relPath = decodeURIComponent(rawParam).replace(/^\/+/, '');
    if (!relPath || relPath.includes('..')) {
      res.status(400).send('Invalid path');
      return;
    }

    const acceptEncoding = req.headers['accept-encoding'] || '';
    const wantsGzip = acceptEncoding.includes('gzip');

    const localCandidate = path.resolve(GAP_PUBLIC_DIR, relPath);
    if (localCandidate.startsWith(GAP_PUBLIC_DIR + path.sep) && fs.existsSync(localCandidate)) {
      const stat = fs.statSync(localCandidate);
      if (stat.isFile()) {
        res.setHeader('Content-Type', getContentType(localCandidate));
        if (relPath === 'build-id') {
          res.setHeader('Cache-Control', 'no-cache');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=86400');
        }
        if (wantsGzip && stat.size > 16384) {
          res.setHeader('Content-Encoding', 'gzip');
          res.setHeader('Vary', 'Accept-Encoding');
          fs.createReadStream(localCandidate).pipe(zlib.createGzip({ level: 6 })).pipe(res);
        } else {
          res.setHeader('Content-Length', String(stat.size));
          fs.createReadStream(localCandidate).pipe(res);
        }
        return;
      }
    }

    if (relPath === 'gap.js' || relPath === 'gap.wasm') {
      try {
        const { rawPath, gzPath } = await ensureGapBinary(relPath);
        res.setHeader('Content-Type', getContentType(rawPath));
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('Vary', 'Accept-Encoding');
        if (wantsGzip) {
          const gzStat = fs.statSync(gzPath);
          res.setHeader('Content-Encoding', 'gzip');
          res.setHeader('Content-Length', String(gzStat.size));
          fs.createReadStream(gzPath).pipe(res);
        } else {
          const rawStat = fs.statSync(rawPath);
          res.setHeader('Content-Length', String(rawStat.size));
          fs.createReadStream(rawPath).pipe(res);
        }
        return;
      } catch (err) {
        console.warn(`GAP binary fetch failed (${relPath}):`, err);
        res.status(503).send('GAP WebAssembly runtime temporarily unavailable');
        return;
      }
    }

    if (isAllowedGapPath(relPath)) {
      try {
        const buf = await fetchAndCacheGapFile(relPath);
        res.setHeader('Content-Type', getContentType(relPath));
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.send(buf);
        return;
      } catch (err) {
        console.warn(`GAP asset fetch failed (${relPath}):`, err);
        res.status(404).send('GAP asset not found');
        return;
      }
    }

    res.status(404).send('GAP asset not found');
  });

  const server = http.createServer(app);
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const disableHmr =
      process.env.DISABLE_HMR === 'true' ||
      Boolean(process.env.CONTROL_PLANE_PORT || process.env.K_SERVICE);
    if (disableHmr) {
      app.get('/@vite/client', (_req, res) => {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.send(
          [
            'export function createHotContext() {',
            '  return {',
            '    data: {},',
            '    accept() {},',
            '    acceptDeps() {},',
            '    acceptExports() {},',
            '    dispose() {},',
            '    prune() {},',
            '    decline() {},',
            '    invalidate() {},',
            '    on() {},',
            '    off() {},',
            '    send() {},',
            '  };',
            '}',
            'export function updateStyle(id, content) {',
            '  const sel = \'style[data-vite-dev-id="\' + CSS.escape(id) + \'"]\';',
            '  let style = document.querySelector(sel);',
            '  if (!style) {',
            '    style = document.createElement("style");',
            '    style.setAttribute("type", "text/css");',
            '    style.setAttribute("data-vite-dev-id", id);',
            '    document.head.appendChild(style);',
            '  }',
            '  style.textContent = content;',
            '}',
            'export function removeStyle(id) {',
            '  const sel = \'style[data-vite-dev-id="\' + CSS.escape(id) + \'"]\';',
            '  const style = document.querySelector(sel);',
            '  if (style) style.remove();',
            '}',
            'export function injectQuery(url) { return url; }',
            'export class ErrorOverlay { constructor() {} }',
          ].join('\n')
        );
      });
    }
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: disableHmr ? false : { server },
        ws: disableHmr ? false : { server },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(
      express.static(DIST_DIR, {
        setHeaders(res, filePath) {
          res.setHeader('Content-Type', getContentType(filePath));
        },
      })
    );
    app.get('*', (_req, res) => {
      res.sendFile(path.join(DIST_DIR, 'index.html'));
    });
  }

  server.listen(PORT, HOST, () => {
    console.log(`GAP Semigroup Workbench listening on http://${HOST}:${PORT}`);
  });
}

createApp().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
