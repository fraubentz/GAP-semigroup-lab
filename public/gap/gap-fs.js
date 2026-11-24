// Instrument fetch and XMLHttpRequest so the page can track GAP asset
// loading progress, and reliably fetch + decompress gap.wasm.
const UPSTREAM_GAP_FS_BASE = "https://raw.githubusercontent.com/fraubentz/gap-in-the-browser/gh-pages/";

(function instrumentFetches() {
    const seen = new Set();
    const report = (raw) => {
        if (typeof raw !== "string") return;
        if (seen.has(raw)) return;
        seen.add(raw);
        self.postMessage({ type: "gap-fetched", url: raw });
    };
    const origFetch = self.fetch;
    let cachedWasmBytesPromise = null;

    const UPSTREAM_GAP_WASM_URL = "https://raw.githubusercontent.com/fraubentz/GAP-semigroup-lab/main/public/gap/gap.wasm";

    const parseAndValidateWasmResponse = async (res, sourceUrl) => {
        const rawBytes = new Uint8Array(await res.arrayBuffer());
        if (rawBytes.length < 4) {
            throw new Error("Received empty gap.wasm payload (" + rawBytes.length + " bytes) from " + sourceUrl);
        }

        let wasmBytes = null;
        if (rawBytes[0] === 0x1f && rawBytes[1] === 0x8b) {
            const ds = new DecompressionStream("gzip");
            const decompressed = new Response(new Blob([rawBytes]).stream().pipeThrough(ds));
            wasmBytes = new Uint8Array(await decompressed.arrayBuffer());
        } else if (
            rawBytes[0] === 0x00 &&
            rawBytes[1] === 0x61 &&
            rawBytes[2] === 0x73 &&
            rawBytes[3] === 0x6d
        ) {
            wasmBytes = rawBytes;
        } else {
            const hex = Array.from(rawBytes.subarray(0, 16))
                .map((b) => b.toString(16).padStart(2, "0"))
                .join(" ");
            let preview = "";
            try {
                preview = new TextDecoder().decode(rawBytes.subarray(0, 160)).replace(/[\r\n]+/g, " ");
            } catch (e) {}
            throw new Error(
                "Invalid gap.wasm response (HTTP " + res.status +
                ", type=" + (res.headers.get("content-type") || "unknown") +
                ", url=" + (res.url || sourceUrl) +
                ", len=" + rawBytes.length +
                ", hex=" + hex +
                ", preview=" + preview + ")"
            );
        }

        if (
            wasmBytes.length < 8 ||
            wasmBytes[0] !== 0x00 ||
            wasmBytes[1] !== 0x61 ||
            wasmBytes[2] !== 0x73 ||
            wasmBytes[3] !== 0x6d
        ) {
            throw new Error("Decompressed gap.wasm failed magic check (len=" + wasmBytes.length + ")");
        }
        return wasmBytes;
    };

    const loadValidatedWasmBytes = async (init) => {
        const candidates = [
            {
                url: new URL("gap.wasm.gzbin", self.location.href).href,
                opts: init || { credentials: "same-origin" }
            },
            {
                url: new URL("gap.wasm", self.location.href).href,
                opts: init || { credentials: "same-origin" }
            },
            {
                url: UPSTREAM_GAP_WASM_URL,
                opts: { mode: "cors", credentials: "omit" }
            }
        ];

        let lastErr = null;
        for (let i = 0; i < candidates.length; i++) {
            const c = candidates[i];
            try {
                const res = await origFetch(c.url, c.opts);
                if (!res.ok) {
                    lastErr = new Error("Failed to fetch " + c.url + " (HTTP " + res.status + ")");
                    continue;
                }
                return await parseAndValidateWasmResponse(res, c.url);
            } catch (err) {
                lastErr = err instanceof Error ? err : new Error(String(err));
            }
        }
        throw lastErr || new Error("Failed to load gap.wasm");
    };

    self.fetch = function(input, init) {
        const rawUrl = typeof input === "string" ? input : input && input.url;
        report(rawUrl);

        if (
            typeof rawUrl === "string" &&
            /(?:^|\/)gap\.wasm(?:$|\?)/.test(rawUrl) &&
            typeof DecompressionStream === "function"
        ) {
            if (!cachedWasmBytesPromise) {
                cachedWasmBytesPromise = loadValidatedWasmBytes(init).catch((err) => {
                    cachedWasmBytesPromise = null;
                    self.postMessage({
                        type: "gap-worker-error",
                        error: err && err.message ? err.message : String(err)
                    });
                    throw err;
                });
            }
            return cachedWasmBytesPromise.then((bytes) => {
                return new Response(bytes, {
                    status: 200,
                    headers: { "Content-Type": "application/wasm" }
                });
            });
        }

        return origFetch.apply(this, arguments);
    };

    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
        report(url);
        return origOpen.apply(this, arguments);
    };
})();

self.Module = self.Module || {};
self.Module.locateFile = function(path) {
    return new URL(path, self.location.href).href;
};
self.Module.onAbort = function(what) {
    self.postMessage({
        type: "gap-worker-error",
        error: "GAP WebAssembly aborted: " + String(what || "unknown error")
    });
};
self.Module.preRun = self.Module.preRun || [];
self.Module.preRun.push(function() {
    addRunDependency('gap_fs_init');

    FS.mkdirTree('/home/web_user');
    FS.chdir('/home/web_user');

    async function seedWorkspaceFiles() {
        const defaults = [
            { name: 'semigroups_toolkit.g', url: new URL('semigroups_toolkit.g', self.location.href).href },
            { name: 'semigroup_lab.g', url: new URL('semigroup_lab.g', self.location.href).href }
        ];
        await Promise.all(defaults.map(async (item) => {
            try {
                const res = await fetch(item.url);
                if (res.ok) {
                    const data = new Uint8Array(await res.arrayBuffer());
                    FS.writeFile('/home/web_user/' + item.name, data);
                }
            } catch (err) {
                console.warn('Could not seed ' + item.name + ':', err);
            }
        }));
    }

    function decodeBase64ToBytes(b64) {
        const bin = atob(b64);
        const len = bin.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = bin.charCodeAt(i);
        }
        return bytes;
    }

    async function initFS() {
        try {
            const gapDirUrl = new URL("./", self.location.href).href;
            self.postMessage({
                type: "gap-boot-stage",
                stage: "Loading virtual filesystem manifest…"
            });

            const [mapRes, manifestRes] = await Promise.all([
                fetch(new URL("gap-fs.json", gapDirUrl).href),
                fetch(new URL("startup_manifest.json", gapDirUrl).href).catch(() => null),
                seedWorkspaceFiles()
            ]);

            const fileList = await mapRes.json();
            const physicalDir = gapDirUrl;
            const createdDirs = Object.create(null);

            const ensureParentDir = (appPath) => {
                const idx = appPath.lastIndexOf('/');
                if (idx <= 0) return '/';
                const parentDir = '/' + appPath.substring(0, idx);
                if (!createdDirs[parentDir]) {
                    try { FS.mkdirTree(parentDir); } catch (e) {}
                    createdDirs[parentDir] = true;
                }
                return parentDir;
            };

            for (let i = 0; i < fileList.length; i++) {
                ensureParentDir(fileList[i]);
            }

            const startupSet = new Set();
            if (manifestRes && manifestRes.ok) {
                try {
                    const manifest = await manifestRes.json();
                    for (let i = 0; i < manifest.length; i++) {
                        let p = manifest[i];
                        if (p.startsWith('/')) p = p.substring(1);
                        startupSet.add(p);
                        ensureParentDir(p);
                    }
                } catch (e) {
                    console.warn("Failed to parse startup_manifest.json:", e);
                }
            }

            let bundleMap = null;
            try {
                self.postMessage({ type: "gap-bundle-status", status: "downloading", count: startupSet.size || 1519 });
                self.postMessage({
                    type: "gap-boot-stage",
                    stage: "Downloading GAP standard library bundle…"
                });
                const bundleRes = await fetch(new URL("startup-bundle.json", gapDirUrl).href);
                if (bundleRes.ok) {
                    const bBytes = new Uint8Array(await bundleRes.arrayBuffer());
                    let jsonText;
                    if (bBytes.length >= 2 && bBytes[0] === 0x1f && bBytes[1] === 0x8b && typeof DecompressionStream === "function") {
                        const ds = new DecompressionStream("gzip");
                        const ungz = new Response(new Blob([bBytes]).stream().pipeThrough(ds));
                        jsonText = await ungz.text();
                    } else {
                        jsonText = new TextDecoder().decode(bBytes);
                    }
                    const parsed = JSON.parse(jsonText);
                    if (parsed && parsed.files) {
                        bundleMap = parsed.files;
                    }
                }
            } catch (err) {
                console.warn("Startup bundle unavailable, falling back to individual files:", err);
            }

            self.postMessage({
                type: "gap-boot-stage",
                stage: "Mounting GAP library & Semigroups package…"
            });

            let hasLocalFsTree = false;
            try {
                const probeRes = await fetch(physicalDir + 'lib/matobjgeneric.gd', { method: 'HEAD' });
                hasLocalFsTree = probeRes.ok;
            } catch (e) {
                hasLocalFsTree = false;
            }
            const lazyBaseDir = hasLocalFsTree ? physicalDir : UPSTREAM_GAP_FS_BASE;

            const writtenFiles = new Set();
            if (bundleMap) {
                const bundleKeys = Object.keys(bundleMap);
                for (let i = 0; i < bundleKeys.length; i++) {
                    const appPath = bundleKeys[i];
                    const b64 = bundleMap[appPath];
                    if (!b64) continue;
                    ensureParentDir(appPath);
                    FS.writeFile('/' + appPath, decodeBase64ToBytes(b64));
                    writtenFiles.add(appPath);
                }
            }

            const fetchWithBackoff = async (url, opts) => {
                for (let attempt = 0; attempt < 4; attempt++) {
                    const res = await fetch(url, opts);
                    if (res.status === 429 || res.status === 503) {
                        await new Promise((r) => setTimeout(r, 300 * Math.pow(2, attempt)));
                        continue;
                    }
                    return res;
                }
                return fetch(url, opts);
            };

            const fallbackQueue = [];
            const enqueueStartupFetch = (appPath) => {
                const fetchRelativePath = appPath.split('/').map(encodeURIComponent).join('/');
                fallbackQueue.push(async () => {
                    try {
                        let response = null;
                        if (hasLocalFsTree) {
                            response = await fetchWithBackoff(physicalDir + fetchRelativePath);
                        }
                        if (!response || !response.ok) {
                            response = await fetchWithBackoff(UPSTREAM_GAP_FS_BASE + fetchRelativePath, {
                                mode: "cors",
                                credentials: "omit"
                            });
                        }
                        if (!response || !response.ok) return;
                        const buffer = await response.arrayBuffer();
                        ensureParentDir(appPath);
                        FS.writeFile('/' + appPath, new Uint8Array(buffer));
                        writtenFiles.add(appPath);
                    } catch (fetchErr) {
                        console.warn("Skipping startup file " + appPath + ":", fetchErr);
                    }
                });
            };

            for (let i = 0; i < fileList.length; i++) {
                const appPath = fileList[i];
                if (writtenFiles.has(appPath)) continue;

                const fetchRelativePath = appPath.split('/').map(encodeURIComponent).join('/');
                const lazyUrl = lazyBaseDir + fetchRelativePath;

                if (startupSet.has(appPath)) {
                    if (bundleMap) {
                        // Excluded optional package not present in startup bundle
                        continue;
                    }
                    enqueueStartupFetch(appPath);
                } else {
                    const parts = appPath.split('/');
                    const fileName = parts.pop();
                    const parentDir = '/' + parts.join('/');
                    FS.createLazyFile(parentDir, fileName, lazyUrl, true, false);
                }
            }

            // Ensure any startup_manifest entry absent from gap-fs.json is also fetched if bundle failed
            if (!bundleMap) {
                startupSet.forEach((appPath) => {
                    if (writtenFiles.has(appPath)) return;
                    enqueueStartupFetch(appPath);
                });
            }

            if (fallbackQueue.length > 0) {
                const concurrency = 6;
                let cursor = 0;
                const workers = Array.from({ length: Math.min(concurrency, fallbackQueue.length) }, async () => {
                    while (cursor < fallbackQueue.length) {
                        const idx = cursor++;
                        await fallbackQueue[idx]();
                    }
                });
                await Promise.all(workers);
            }

            self.postMessage({
                type: "gap-boot-stage",
                stage: "Starting GAP 4.17 WebAssembly kernel…"
            });
        } catch (err) {
            console.error("Failed to initialize GAP FS:", err);
            self.postMessage({
                type: "gap-worker-error",
                error: "Failed to initialize GAP filesystem: " + (err && err.message ? err.message : String(err))
            });
        } finally {
            removeRunDependency('gap_fs_init');
        }
    }

    initFS();
});
