import { execFile } from 'child_process';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { promisify } from 'util';
import zlib from 'zlib';

const execFileAsync = promisify(execFile);

const ROOT = process.cwd();
const DIST_GAP = path.join(ROOT, 'dist', 'gap');
const GAP_FS_ARCHIVE_URL =
  'https://github.com/fraubentz/gap-in-the-browser/archive/refs/heads/gh-pages.tar.gz';
const SEMIGROUPS_TARBALL_URL =
  'https://github.com/semigroups/Semigroups/releases/download/v5.7.1/semigroups-5.7.1.tar.gz';
const GAP_BINARY_UPSTREAM =
  'https://raw.githubusercontent.com/fraubentz/GAP-semigroup-lab/main/public/gap';

const GAP_DIRS = ['lib', 'pkg', 'grp', 'doc', 'tst', 'hpcgap', 'dev', 'benchmark'];

async function downloadToFile(url, destPath) {
  const res = await fetch(url, { signal: AbortSignal.timeout(180000) });
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download ${url} (${res.status})`);
  }
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(destPath));
}

async function main() {
  await fsp.mkdir(DIST_GAP, { recursive: true });
  const tmpDir = path.join(ROOT, '.pages-gap-tmp');
  await fsp.rm(tmpDir, { recursive: true, force: true });
  await fsp.mkdir(tmpDir, { recursive: true });

  try {
    // 1. Ensure gap.js and gap.wasm exist in dist/gap (in case LFS pointer or missing)
    for (const binName of ['gap.js', 'gap.wasm']) {
      const binPath = path.join(DIST_GAP, binName);
      const st = await fsp.stat(binPath).catch(() => null);
      if (!st || st.size < 1024) {
        console.log(`Downloading ${binName} from upstream...`);
        await downloadToFile(`${GAP_BINARY_UPSTREAM}/${binName}`, binPath);
      }
    }

    // 2. Pre-compress gap.wasm -> gap.wasm.gzbin for fast mobile/static loading
    const wasmPath = path.join(DIST_GAP, 'gap.wasm');
    const gzbinPath = path.join(DIST_GAP, 'gap.wasm.gzbin');
    if (fs.existsSync(wasmPath)) {
      console.log('Generating dist/gap/gap.wasm.gzbin...');
      await pipeline(
        fs.createReadStream(wasmPath),
        zlib.createGzip({ level: 6 }),
        fs.createWriteStream(gzbinPath)
      );
    }

    // 3. Download and extract GAP standard library & packages from gap-in-the-browser
    console.log('Downloading gap-in-the-browser filesystem...');
    const gapArchive = path.join(tmpDir, 'gap-fs.tar.gz');
    const gapExtract = path.join(tmpDir, 'gap-extract');
    await fsp.mkdir(gapExtract, { recursive: true });
    await downloadToFile(GAP_FS_ARCHIVE_URL, gapArchive);
    await execFileAsync('tar', ['-xzf', gapArchive, '--strip-components=1', '-C', gapExtract]);

    for (const dir of GAP_DIRS) {
      const src = path.join(gapExtract, dir);
      const dst = path.join(DIST_GAP, dir);
      if (fs.existsSync(src)) {
        await fsp.cp(src, dst, { recursive: true, force: true });
      }
    }

    // 4. Download and extract Semigroups package into dist/gap/pkg/semigroups (and pkg/semigrp alias)
    console.log('Downloading Semigroups 5.7.1 package...');
    const semiArchive = path.join(tmpDir, 'semigroups.tar.gz');
    const semiDir = path.join(DIST_GAP, 'pkg', 'semigroups');
    const semiAliasDir = path.join(DIST_GAP, 'pkg', 'semigrp');
    await fsp.mkdir(semiDir, { recursive: true });
    await downloadToFile(SEMIGROUPS_TARBALL_URL, semiArchive);
    await execFileAsync('tar', ['-xzf', semiArchive, '--strip-components=1', '-C', semiDir]);
    await fsp.cp(semiDir, semiAliasDir, { recursive: true, force: true });

    // 5. Build dist/gap/startup-bundle.json for single-request startup
    console.log('Building dist/gap/startup-bundle.json...');
    const manifestRaw = await fsp.readFile(path.join(DIST_GAP, 'startup_manifest.json'), 'utf8');
    const manifestList = JSON.parse(manifestRaw);
    const buildId = await fsp
      .readFile(path.join(DIST_GAP, 'build-id'), 'utf8')
      .then((s) => s.trim())
      .catch(() => 'pages');

    const filesMap = {};
    for (const rawPath of manifestList) {
      const cleanPath = rawPath.startsWith('/') ? rawPath.slice(1) : rawPath;
      if (!cleanPath || cleanPath.includes('..')) continue;
      const diskPath = path.join(DIST_GAP, cleanPath);
      try {
        const buf = await fsp.readFile(diskPath);
        filesMap[cleanPath] = buf.toString('base64');
      } catch {
        // Skip optional files absent from tree
      }
    }

    await fsp.writeFile(
      path.join(DIST_GAP, 'startup-bundle.json'),
      JSON.stringify({ buildId, files: filesMap })
    );
    console.log(`Built startup-bundle.json with ${Object.keys(filesMap).length} files.`);
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('Failed to prepare GAP Pages bundle:', err);
  process.exit(1);
});
