// GAP WebAssembly worker: wires Emscripten PTY to xterm-pty on the main thread
// and synchronizes /home/web_user files via SharedArrayBuffer mailbox + postMessage.

importScripts(new URL("../gap/vendor/xterm-pty/workerTools.js", import.meta.url || self.location.href).href);

const MB_STATE = 0, MB_LEN = 1, MB_FLAGS = 2;
const MB_IDLE = 0, MB_READY = 1, MB_CONSUMED = 2;
const MB_FLAG_HEADER = 1, MB_FLAG_FINAL = 2, MB_FLAG_END = 4;
const MB_CTRL_BYTES = 16;

let mbCtrl = null;
let mbData = null;

const USER_DIR = "/home/web_user";

function drainMailbox() {
    if (mbCtrl === null || Atomics.load(mbCtrl, MB_STATE) !== MB_READY)
        return;

    let cur = null;
    for (;;) {
        const flags = mbCtrl[MB_FLAGS];
        const len = mbCtrl[MB_LEN];

        if (flags & MB_FLAG_END) {
            Atomics.store(mbCtrl, MB_STATE, MB_IDLE);
            Atomics.notify(mbCtrl, MB_STATE);
            return;
        }

        if (flags & MB_FLAG_HEADER) {
            const header = JSON.parse(
                new TextDecoder().decode(mbData.slice(0, len)));
            cur = {
                name: header.name,
                buf: new Uint8Array(header.size),
                off: 0,
            };
        } else {
            cur.buf.set(mbData.subarray(0, len), cur.off);
            cur.off += len;
            if (flags & MB_FLAG_FINAL) {
                if (cur.off !== cur.buf.length)
                    throw new Error("gap-worker: upload of " + cur.name +
                        " ended at " + cur.off + " of " + cur.buf.length +
                        " bytes");
                const targetPath = USER_DIR + "/" + cur.name;
                const parentDir = targetPath.substring(0, targetPath.lastIndexOf("/"));
                if (parentDir) {
                    try { FS.mkdirTree(parentDir); } catch (e) {}
                }
                FS.writeFile(targetPath, cur.buf);
                postMessage({ type: "gap-file-uploaded", name: cur.name });
                cur = null;
            }
        }

        Atomics.store(mbCtrl, MB_STATE, MB_CONSUMED);
        Atomics.notify(mbCtrl, MB_STATE);

        while (Atomics.load(mbCtrl, MB_STATE) !== MB_READY) {
            const r = Atomics.wait(mbCtrl, MB_STATE, MB_CONSUMED, 30000);
            if (r === "timed-out") {
                console.error("gap-worker: upload stalled; abandoning transfer");
                postMessage({ type: "gap-file-error",
                              name: cur === null ? null : cur.name,
                              error: "transfer stalled" });
                Atomics.store(mbCtrl, MB_STATE, MB_IDLE);
                return;
            }
        }
    }
}

const knownFiles = new Map();

function scanUserFiles() {
    const seen = new Set();
    const changed = [];

    function walk(dir, relPrefix) {
        let names;
        try {
            names = FS.readdir(dir);
        } catch (e) {
            return;
        }
        for (const name of names) {
            if (name === "." || name === "..") continue;
            const full = dir + "/" + name;
            const rel = relPrefix === "" ? name : relPrefix + "/" + name;
            let st;
            try {
                st = FS.stat(full);
            } catch (e) {
                continue;
            }
            if (FS.isDir(st.mode)) {
                walk(full, rel);
            } else if (FS.isFile(st.mode)) {
                seen.add(rel);
                const key = st.size + ":" + (+st.mtime);
                if (knownFiles.get(rel) !== key) {
                    knownFiles.set(rel, key);
                    changed.push({
                        path: rel,
                        size: st.size,
                        data: FS.readFile(full),
                    });
                }
            }
        }
    }

    walk(USER_DIR, "");

    const removed = [];
    for (const rel of knownFiles.keys()) {
        if (!seen.has(rel)) removed.push(rel);
    }
    for (const rel of removed) knownFiles.delete(rel);

    if (changed.length > 0 || removed.length > 0) {
        postMessage({ type: "gap-user-files", changed: changed, removed: removed });
    }
}

onmessage = (msg) => {
    if (msg.data && msg.data.type === "gap-init") {
        mbCtrl = new Int32Array(msg.data.mailbox, 0, 4);
        mbData = new Uint8Array(msg.data.mailbox, MB_CTRL_BYTES);
        return;
    }

    self.Module = self.Module || {};
    self.Module.arguments = ["-l", "/"];
    self.Module.onExit = function(code) {
        try { scanUserFiles(); } catch (e) {}
        postMessage({ type: "gap-exited", code: code });
    };

    importScripts(new URL("gap-fs.js", self.location.href).href);
    importScripts(new URL("gap.js", self.location.href).href);

    const fileTransferHook = (scan) => {
        try {
            drainMailbox();
            if (scan) scanUserFiles();
        } catch (e) {
            console.error("gap-worker: file transfer hook failed:", e);
            postMessage({ type: "gap-file-error", name: null, error: String(e) });
            throw e;
        }
    };

    const client = new TtyClient(msg.data);
    const hooked = Object.create(client);
    hooked.onRead = (length) => {
        fileTransferHook(true);
        return client.onRead(length);
    };
    hooked.onWaitForReadable = (timeout) => {
        fileTransferHook(true);
        return client.onWaitForReadable(timeout);
    };
    hooked.onWrite = (buf) => {
        fileTransferHook(false);
        return client.onWrite(buf);
    };
    emscriptenHack(hooked);
};
