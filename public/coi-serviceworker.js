/*! coi-serviceworker v0.1.7 - Guido Zuidhof and contributors, licensed under MIT */
let coepCredentialless = false;
if (typeof window === 'undefined') {
    self.addEventListener("install", () => self.skipWaiting());
    self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

    self.addEventListener("message", (ev) => {
        if (!ev.data) {
            return;
        } else if (ev.data.type === "deregister") {
            self.registration
                .unregister()
                .then(() => {
                    return self.clients.matchAll();
                })
                .then(clients => {
                    clients.forEach((client) => client.navigate(client.url));
                });
        } else if (ev.data.type === "coepCredentialless") {
            coepCredentialless = ev.data.value;
        }
    });

    const swBridgeSessions = new Map();

    const getSwBridgeSession = (sid) => {
        let s = swBridgeSessions.get(sid);
        if (!s) {
            s = {
                lastSeen: Date.now(),
                closed: false,
                pendingReqs: [],
                completedReqs: new Map(),
                nextWaiter: null,
                uploads: [],
            };
            swBridgeSessions.set(sid, s);
        }
        s.lastSeen = Date.now();
        return s;
    };

    const jsonResponse = (data, status = 200) =>
        new Response(JSON.stringify(data), {
            status,
            headers: {
                "Content-Type": "application/json; charset=utf-8",
                "Cache-Control": "no-store",
            },
        });

    const handleSwTtyBridge = async (request, pathname) => {
        const action = pathname.split("/__tty_bridge__/")[1];
        let body = {};
        try {
            body = await request.json();
        } catch (e) {}

        if (action === "req") {
            const { sid, reqId, req: ttyReq } = body || {};
            if (!sid || !reqId || !ttyReq) {
                return jsonResponse({ error: "Invalid bridge request" }, 400);
            }
            const session = getSwBridgeSession(sid);
            if (session.closed) {
                return jsonResponse({ closed: true });
            }
            const completed = session.completedReqs.get(reqId);
            if (completed) {
                session.completedReqs.delete(reqId);
                return jsonResponse(completed);
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
            const result = await new Promise((resolve) => {
                const timer = setTimeout(() => {
                    if (entry && entry.resolve === onResolve) {
                        entry.resolve = undefined;
                    }
                    resolve({ retry: true });
                }, 15000);
                const onResolve = (payload) => {
                    clearTimeout(timer);
                    resolve(payload);
                };
                entry.resolve = onResolve;
            });
            return jsonResponse(result);
        }

        if (action === "next") {
            const { sid } = body || {};
            if (!sid) {
                return jsonResponse({ error: "Missing sid" }, 400);
            }
            const session = getSwBridgeSession(sid);
            if (session.closed) {
                return jsonResponse({ closed: true });
            }
            const pending = session.pendingReqs.find((p) => !p.dispatched);
            if (pending) {
                pending.dispatched = true;
                return jsonResponse({ reqId: pending.reqId, req: pending.req });
            }
            const nextReq = await new Promise((resolve) => {
                const timer = setTimeout(() => {
                    if (session.nextWaiter === onWait) {
                        session.nextWaiter = null;
                    }
                    resolve(null);
                }, 20000);
                const onWait = (payload) => {
                    clearTimeout(timer);
                    resolve(payload);
                };
                if (session.nextWaiter) {
                    session.nextWaiter(null);
                }
                session.nextWaiter = onWait;
            });
            if (session.closed) {
                return jsonResponse({ closed: true });
            }
            return jsonResponse(nextReq || { req: null });
        }

        if (action === "res") {
            const { sid, reqId, streamData } = body || {};
            if (!sid || !reqId) {
                return jsonResponse({ error: "Missing sid or reqId" }, 400);
            }
            const session = swBridgeSessions.get(sid);
            if (!session || session.closed) {
                return jsonResponse({ ok: false });
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
            return jsonResponse({ ok: true });
        }

        if (action === "upload") {
            const { sid, files } = body || {};
            if (!sid || !Array.isArray(files)) {
                return jsonResponse({ error: "Invalid upload payload" }, 400);
            }
            const session = getSwBridgeSession(sid);
            for (const f of files) {
                if (f && typeof f.name === "string" && typeof f.dataBase64 === "string") {
                    session.uploads.push(f);
                }
            }
            return jsonResponse({ ok: true });
        }

        if (action === "close") {
            const { sid } = body || {};
            if (sid) {
                const session = swBridgeSessions.get(sid);
                if (session) {
                    session.closed = true;
                    if (session.nextWaiter) {
                        session.nextWaiter(null);
                        session.nextWaiter = null;
                    }
                    for (const p of session.pendingReqs) {
                        if (p.resolve) {
                            p.resolve({ streamData: [], uploads: [], closed: true });
                        }
                    }
                    session.pendingReqs.length = 0;
                    swBridgeSessions.delete(sid);
                }
            }
            return jsonResponse({ ok: true });
        }

        return jsonResponse({ error: "Unknown bridge endpoint" }, 404);
    };

    self.addEventListener("fetch", function (event) {
        const r = event.request;
        try {
            const url = new URL(r.url);
            if (url.origin === self.location.origin && url.pathname.includes("/__tty_bridge__/")) {
                event.respondWith(handleSwTtyBridge(r, url.pathname));
                return;
            }
        } catch (e) {}

        if (r.cache === "only-if-cached" && r.mode !== "same-origin") {
            return;
        }

        const request = (coepCredentialless && r.mode === "no-cors")
            ? new Request(r, {
                credentials: "omit",
            })
            : r;
        event.respondWith(
            fetch(request)
                .then((response) => {
                    if (response.status === 0) {
                        return response;
                    }

                    const newHeaders = new Headers(response.headers);
                    newHeaders.set("Cross-Origin-Embedder-Policy",
                        coepCredentialless ? "credentialless" : "require-corp"
                    );
                    if (!coepCredentialless) {
                        newHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");
                    }
                    newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");

                    return new Response(response.body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: newHeaders,
                    });
                })
                .catch((e) => console.error(e))
        );
    });

} else {
    (() => {
        try {
            if (window.self !== window.top) return;
        } catch (e) {
            return;
        }
        const reloadedBySelf = window.sessionStorage.getItem("coiReloadedBySelf");
        window.sessionStorage.removeItem("coiReloadedBySelf");
        const coepDegrading = (reloadedBySelf == "coepdegrade");

        // You can customize the behavior of this script through a global `coi` variable.
        const coi = {
            shouldRegister: () => !reloadedBySelf,
            shouldDeregister: () => false,
            coepCredentialless: () => true,
            coepDegrade: () => true,
            doReload: () => window.location.reload(),
            quiet: false,
            ...window.coi
        };

        const n = navigator;
        const controlling = n.serviceWorker && n.serviceWorker.controller;

        // Record the failure if the page is served by serviceWorker.
        if (controlling && !window.crossOriginIsolated) {
            window.sessionStorage.setItem("coiCoepHasFailed", "true");
        }
        const coepHasFailed = window.sessionStorage.getItem("coiCoepHasFailed");

        if (controlling) {
            // Reload only on the first failure.
            const reloadToDegrade = coi.coepDegrade() && !(
                coepDegrading || window.crossOriginIsolated
            );
            n.serviceWorker.controller.postMessage({
                type: "coepCredentialless",
                value: (reloadToDegrade || coepHasFailed && coi.coepDegrade())
                    ? false
                    : coi.coepCredentialless(),
            });
            if (reloadToDegrade) {
                !coi.quiet && console.log("Reloading page to degrade COEP.");
                window.sessionStorage.setItem("coiReloadedBySelf", "coepdegrade");
                coi.doReload("coepdegrade");
            }

            if (coi.shouldDeregister()) {
                n.serviceWorker.controller.postMessage({ type: "deregister" });
            }
        }

        // If we're already coi: do nothing. Perhaps it's due to this script doing its job, or COOP/COEP are
        // already set from the origin server. Also if the browser has no notion of crossOriginIsolated, just give up here.
        if (window.crossOriginIsolated !== false || !coi.shouldRegister()) return;

        if (!window.isSecureContext) {
            !coi.quiet && console.log("COOP/COEP Service Worker not registered, a secure context is required.");
            return;
        }

        // In some environments (e.g. Firefox private mode) this won't be available
        if (!n.serviceWorker) {
            !coi.quiet && console.error("COOP/COEP Service Worker not registered, perhaps due to private mode.");
            return;
        }

        n.serviceWorker.register(window.document.currentScript.src).then(
            (registration) => {
                !coi.quiet && console.log("COOP/COEP Service Worker registered", registration.scope);

                registration.addEventListener("updatefound", () => {
                    !coi.quiet && console.log("Reloading page to make use of updated COOP/COEP Service Worker.");
                    window.sessionStorage.setItem("coiReloadedBySelf", "updatefound");
                    coi.doReload();
                });

                // If the registration is active, but it's not controlling the page
                if (registration.active && !n.serviceWorker.controller) {
                    !coi.quiet && console.log("Reloading page to make use of COOP/COEP Service Worker.");
                    window.sessionStorage.setItem("coiReloadedBySelf", "notcontrolling");
                    coi.doReload();
                }
            },
            (err) => {
                !coi.quiet && console.error("COOP/COEP Service Worker failed to register:", err);
            }
        );
    })();
}
