// Instrument fetch and XMLHttpRequest so the page can track GAP asset
// loading progress.
(function instrumentFetches() {
    const seen = new Set();
    const report = (raw) => {
        if (typeof raw !== "string") return;
        if (seen.has(raw)) return;
        seen.add(raw);
        self.postMessage({ type: "gap-fetched", url: raw });
    };
    const origFetch = self.fetch;
    self.fetch = function(input, init) {
        report(typeof input === "string" ? input : input && input.url);
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
            const [mapRes] = await Promise.all([
                fetch(new URL("gap-fs.json", gapDirUrl).href),
                seedWorkspaceFiles()
            ]);
            const fileList = await mapRes.json();
            const physicalDir = gapDirUrl;
            var createdDirs = {};

            fileList.forEach(function(appPath) {
                var parts = appPath.split('/');
                parts.pop();
                var parentDir = '/' + parts.join('/');
                if (!createdDirs[parentDir]) {
                    try { FS.mkdirTree(parentDir); } catch(e) {}
                    createdDirs[parentDir] = true;
                }
            });

            try { FS.mkdirTree('/gap_idb_cache'); } catch(e) {}
            FS.mount(IDBFS, {}, '/gap_idb_cache');

            FS.syncfs(true, async function() {
                var needsSave = false;
                var storedId = null;
                try {
                    storedId = new TextDecoder().decode(
                        FS.readFile('/gap_idb_cache/.build-id'));
                } catch (e) {}

                var buildId = null;
                try {
                    const idRes = await fetch(new URL("build-id", gapDirUrl).href, { cache: 'no-cache' });
                    if (idRes.ok) buildId = (await idRes.text()).trim();
                } catch (e) {}

                if (buildId !== null && storedId !== buildId) {
                    (function wipe(dir) {
                        FS.readdir(dir).forEach(function(name) {
                            if (name === '.' || name === '..') return;
                            var p = dir + '/' + name;
                            if (FS.isDir(FS.stat(p).mode)) {
                                wipe(p);
                                FS.rmdir(p);
                            } else {
                                FS.unlink(p);
                            }
                        });
                    })('/gap_idb_cache');
                    FS.writeFile('/gap_idb_cache/.build-id', buildId);
                    needsSave = true;
                }

                fileList.forEach(function(appPath) {
                    var parts = appPath.split('/');
                    parts.pop();
                    var parentDir = '/' + parts.join('/');
                    try { FS.mkdirTree('/gap_idb_cache' + parentDir); } catch(e) {}
                });

                var startupSet = new Set();
                try {
                    const manifestRes = await fetch(new URL("startup_manifest.json", gapDirUrl).href);
                    if (manifestRes.ok) {
                        const manifest = await manifestRes.json();
                        manifest.forEach(p => {
                            if (p.startsWith('/')) p = p.substring(1);
                            startupSet.add(p);
                        });
                    }
                } catch (e) {
                    console.warn("Failed to load startup_manifest.json:", e);
                }

                // Check how many startup files are missing from IDBFS cache
                var missingStartup = [];
                startupSet.forEach(function(appPath) {
                    try {
                        FS.stat('/gap_idb_cache/' + appPath);
                        FS.writeFile('/' + appPath, FS.readFile('/gap_idb_cache/' + appPath));
                    } catch (e) {
                        missingStartup.push(appPath);
                    }
                });

                // Try fast single-request startup bundle when cache is cold
                var bundleMap = null;
                if (missingStartup.length > 10) {
                    try {
                        self.postMessage({ type: "gap-bundle-status", status: "downloading", count: missingStartup.length });
                        const bundleRes = await fetch(new URL("startup-bundle.json", gapDirUrl).href);
                        if (bundleRes.ok) {
                            const parsed = await bundleRes.json();
                            if (parsed && parsed.files) {
                                bundleMap = parsed.files;
                            }
                        }
                    } catch (err) {
                        console.warn("Startup bundle unavailable, falling back to individual files:", err);
                    }
                }

                var fetchPromises = fileList.map(async function(appPath) {
                    var fetchRelativePath = appPath.split('/').map(encodeURIComponent).join('/');
                    var fetchPath = physicalDir + fetchRelativePath;
                    var idbfsPath = '/gap_idb_cache/' + appPath;
                    var finalAppPath = '/' + appPath;

                    if (startupSet.has(appPath)) {
                        try {
                            FS.stat(finalAppPath);
                            return;
                        } catch (e) {}

                        if (bundleMap && bundleMap[appPath]) {
                            const data = decodeBase64ToBytes(bundleMap[appPath]);
                            FS.writeFile(finalAppPath, data);
                            FS.writeFile(idbfsPath, data);
                            needsSave = true;
                            return;
                        }

                        try {
                            const response = await fetch(fetchPath);
                            if (!response.ok) {
                                console.warn("Skipping unavailable startup file " + fetchPath + ": " + response.status);
                                return;
                            }
                            const buffer = await response.arrayBuffer();
                            const data = new Uint8Array(buffer);
                            FS.writeFile(finalAppPath, data);
                            FS.writeFile(idbfsPath, data);
                            needsSave = true;
                        } catch (fetchErr) {
                            console.warn("Skipping startup file " + fetchPath + ":", fetchErr);
                        }
                    } else {
                        var parts = appPath.split('/');
                        var fileName = parts.pop();
                        var parentDir = '/' + parts.join('/');
                        FS.createLazyFile(parentDir, fileName, fetchPath, true, false);
                    }
                });

                await Promise.all(fetchPromises);
                if (needsSave) {
                    FS.syncfs(false, function() {
                        removeRunDependency('gap_fs_init');
                    });
                } else {
                    removeRunDependency('gap_fs_init');
                }
            });
        } catch (err) {
            console.error("Failed to initialize GAP FS:", err);
            removeRunDependency('gap_fs_init');
        }
    }

    initFS();
});
