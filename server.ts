import express from 'express';
import fs from 'fs';
import fsp from 'fs/promises';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const HOST = '0.0.0.0';
const PUBLIC_DIR = path.resolve(__dirname, 'public');
const GAP_PUBLIC_DIR = path.resolve(PUBLIC_DIR, 'gap');
const CACHE_DIR = path.resolve(__dirname, '.gap-cache');
const DIST_DIR = path.resolve(__dirname, 'dist');
const UPSTREAM_BASE = 'https://raw.githubusercontent.com/fraubentz/gap-in-the-browser/gh-pages';

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

function isAllowedGapPath(relPath: string): boolean {
  if (!relPath || relPath.includes('..') || relPath.startsWith('/')) return false;
  const topDir = relPath.split('/')[0];
  if (!ALLOWED_GAP_PREFIXES.has(topDir)) return false;
  if (validGapFiles.size > 0) {
    return validGapFiles.has(relPath);
  }
  return true;
}

async function fetchAndCacheGapFile(relPath: string): Promise<Buffer> {
  if (!isAllowedGapPath(relPath)) {
    throw new Error(`Disallowed GAP asset path: ${relPath}`);
  }

  const resolvedCachePath = path.resolve(CACHE_DIR, relPath);
  if (!resolvedCachePath.startsWith(CACHE_DIR + path.sep)) {
    throw new Error('Path traversal blocked');
  }

  try {
    return await fsp.readFile(resolvedCachePath);
  } catch {
    // Cache miss — deduplicate concurrent fetches for the same file
  }

  const existing = inflightFetches.get(relPath);
  if (existing) return existing;

  const task = (async () => {
    const encoded = relPath.split('/').map(encodeURIComponent).join('/');
    const url = `${UPSTREAM_BASE}/${encoded}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) {
      throw new Error(`Upstream fetch failed (${res.status}) for ${relPath}`);
    }
    const arrayBuf = await res.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    await fsp.mkdir(path.dirname(resolvedCachePath), { recursive: true });
    await fsp.writeFile(resolvedCachePath, buf);
    return buf;
  })();

  inflightFetches.set(relPath, task);
  try {
    return await task;
  } finally {
    inflightFetches.delete(relPath);
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
    const filesMap: Record<string, string> = {};
    const batchSize = 32;

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

  // Pre-warm startup bundle in the background without blocking server boot
  if (startupManifestList.length > 0) {
    void ensureStartupBundle().catch((err) => {
      console.warn('Background GAP startup bundle prewarm warning:', err);
    });
  }

  const app = express();
  app.disable('x-powered-by');

  // Appropriate Security Headers for WebAssembly, SharedArrayBuffer, and Cross-Origin Isolation
  app.use((_req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Origin-Agent-Cluster', '?1');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
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

  // Fast single-request startup bundle for the 1,519 GAP startup files
  app.get('/gap/startup-bundle.json', async (req, res) => {
    try {
      const bundleGzPath = await ensureStartupBundle();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Vary', 'Accept-Encoding');
      const acceptEncoding = req.headers['accept-encoding'] || '';
      if (acceptEncoding.includes('gzip')) {
        res.setHeader('Content-Encoding', 'gzip');
        fs.createReadStream(bundleGzPath).pipe(res);
      } else {
        fs.createReadStream(bundleGzPath).pipe(zlib.createGunzip()).pipe(res);
      }
    } catch (err) {
      console.error('Failed to build startup bundle:', err);
      res.status(503).json({ error: 'Startup bundle temporarily unavailable' });
    }
  });

  // Serve local /gap/* static files & lazy-cached GAP library/package files
  app.get('/gap/*', async (req, res, next) => {
    const rawParam = (req.params as Record<string, string>)[0] || '';
    const relPath = decodeURIComponent(rawParam).replace(/^\/+/, '');
    if (!relPath || relPath.includes('..')) {
      res.status(400).send('Invalid path');
      return;
    }

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
        fs.createReadStream(localCandidate).pipe(res);
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

    next();
  });

  const server = http.createServer(app);
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server },
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
