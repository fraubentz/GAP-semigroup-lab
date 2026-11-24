// Instrument fetch and XMLHttpRequest so the page can track GAP asset
// loading progress, and reliably fetch + decompress gap.wasm.
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

    const loadValidatedWasmBytes = async (init) => {
        const wasmGzUrl = new URL("gap.wasm.gzbin", self.location.href).href;
        const res = await origFetch(wasmGzUrl, init || { credentials: "same-origin" });
        if (!res.ok) {
            throw new Error("Failed to fetch " + wasmGzUrl + " (HTTP " + res.status + ")");
        }
        const rawBytes = new Uint8Array(await res.arrayBuffer());
        if (rawBytes.length < 4) {
            throw new Error("Received empty gap.wasm payload (" + rawBytes.length + " bytes)");
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
                ", url=" + res.url +
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
    return "/gap/" + path;
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
            { name: 'semigroups_toolkit.g', url: '/gap/semigroups_toolkit.g' },
            { name: 'semigroup_lab.g', url: '/gap/semigroup_lab.g' }
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

            const fallbackFetchPromises = [];
            for (let i = 0; i < fileList.length; i++) {
                const appPath = fileList[i];
                if (writtenFiles.has(appPath)) continue;

                const fetchRelativePath = appPath.split('/').map(encodeURIComponent).join('/');
                const fetchPath = physicalDir + fetchRelativePath;

                if (startupSet.has(appPath)) {
                    if (bundleMap) {
                        // Excluded optional package not present in startup bundle
                        continue;
                    }
                    fallbackFetchPromises.push((async () => {
                        try {
                            const response = await fetch(fetchPath);
                            if (!response.ok) return;
                            const buffer = await response.arrayBuffer();
                            ensureParentDir(appPath);
                            FS.writeFile('/' + appPath, new Uint8Array(buffer));
                            writtenFiles.add(appPath);
                        } catch (fetchErr) {
                            console.warn("Skipping startup file " + fetchPath + ":", fetchErr);
                        }
                    })());
                } else {
                    const parts = appPath.split('/');
                    const fileName = parts.pop();
                    const parentDir = '/' + parts.join('/');
                    FS.createLazyFile(parentDir, fileName, fetchPath, true, false);
                }
            }

            // Ensure any startup_manifest entry absent from gap-fs.json is also fetched if bundle failed
            if (!bundleMap) {
                startupSet.forEach((appPath) => {
                    if (writtenFiles.has(appPath)) return;
                    const fetchRelativePath = appPath.split('/').map(encodeURIComponent).join('/');
                    const fetchPath = physicalDir + fetchRelativePath;
                    fallbackFetchPromises.push((async () => {
                        try {
                            const response = await fetch(fetchPath);
                            if (!response.ok) return;
                            const buffer = await response.arrayBuffer();
                            ensureParentDir(appPath);
                            FS.writeFile('/' + appPath, new Uint8Array(buffer));
                        } catch (e) {}
                    })());
                });
            }

            if (fallbackFetchPromises.length > 0) {
                await Promise.all(fallbackFetchPromises);
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
