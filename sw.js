const CACHE = "talcoexchange-v19";
const SHELL = ["./", "index.html", "manifest.webmanifest", "favicon.ico", "favicon-32.png", "icon-192.png", "badge-96.png", "icon-512.png", "apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET") return;
  if (/^https:\/\/(www\.gstatic\.com\/firebasejs\/|res\.cloudinary\.com\/)/.test(req.url)) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { const c = res.clone(); caches.open(CACHE).then(k => k.put(req, c)); return res; })));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; })
      .catch(() => caches.match(req).then(r => r || caches.match("index.html")))
  );
});

self.addEventListener("notificationclick", e => {
  e.notification.close(); const open = e.notification.data && e.notification.data.open;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(l => {
    const c = l[0]; if (c) { c.focus(); if (open) c.postMessage({ open }); return; }
    return self.clients.openWindow("./");
  }));
});
const API_KEY = "AIzaSyALu9n3ksX-0mN4u8reRBpFkWAUsVsGswA", DB = "https://itn-3-1b09f-default-rtdb.europe-west1.firebasedatabase.app";
async function authInfo() {
  const db = await new Promise((res, rej) => { const r = indexedDB.open("firebaseLocalStorageDb"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const all = await new Promise((res, rej) => { const q = db.transaction("firebaseLocalStorage").objectStore("firebaseLocalStorage").getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  const e = all.find(x => /^firebase:authUser:/.test(x.fbase_key)); return e && e.value;
}
async function idToken(u) {
  const t = u.stsTokenManager; if (t.accessToken && t.expirationTime - Date.now() > 60000) return t.accessToken;
  const r = await fetch("https://securetoken.googleapis.com/v1/token?key=" + API_KEY, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=refresh_token&refresh_token=" + encodeURIComponent(t.refreshToken) });
  return (await r.json()).id_token;
}
async function items() {
  const u = await authInfo(); if (!u) return [];
  const tok = await idToken(u), get = async p => (await fetch(`${DB}/${p}.json?auth=${tok}`)).json();
  const [chats, inbox, ic] = await Promise.all([get(`userChats/${u.uid}`), get(`inbox/${u.uid}`), get(`incoming/${u.uid}`)]);
  const out = [];
  if (ic && ic.from && Date.now() - ic.ts < 60000) out.push({ from: ic.from, ts: ic.ts, call: true, body: ic.kind === "video" ? "📹 Appel vidéo entrant" : "📞 Appel vocal entrant" });
  for (const k in chats || {}) { const c = chats[k]; if (c.from !== u.uid && typeof c.ts === "number") out.push({ from: k, ts: c.ts, body: c.last || "Nouveau message" }); }
  for (const k in inbox || {}) { const x = inbox[k]; if (x && typeof x.ts === "number") out.push({ from: x.from, ts: x.ts, body: x.text }); }
  const mx = out.reduce((m, x) => Math.max(m, x.ts), 0);
  const list = out.filter(x => x.ts >= mx - 45000).sort((a, b) => a.ts - b.ts).slice(-5);
  const info = {};
  for (const f of [...new Set(list.map(x => x.from))]) { const [n, ph] = await Promise.all([get(`users/${f}/name`), get(`users/${f}/photo`)]); info[f] = { n, ph }; }
  return list.map(x => ({ ...x, title: (info[x.from] && info[x.from].n) || "TalcoExchange", photo: info[x.from] && info[x.from].ph }));
}
let force = 0;
self.addEventListener("message", e => { if (e.data && e.data.diag) force = Date.now() + 60000; });
async function show(n) {
  await self.registration.showNotification(n.title, { body: n.body, icon: n.photo || "icon-192.png", badge: "badge-96.png", tag: "tx-" + (n.from || "new") + "-" + (n.ts || Date.now()), timestamp: n.ts || Date.now(), requireInteraction: !!n.call, vibrate: n.call ? [300, 150, 300, 150, 300] : undefined, data: { open: n.from } });
  try { const l = await self.registration.getNotifications(); if (self.navigator.setAppBadge) await self.navigator.setAppBadge(l.length); } catch (x) {}
}
self.addEventListener("push", e => {
  e.waitUntil((async () => {
    if (Date.now() <= force) { force = 0; return show({ title: "Test push ✅", body: "Les notifications arrivent bien.", from: "test", ts: Date.now() }); }
    const wins = await self.clients.matchAll({ type: "window" });
    if (wins.some(c => c.visibilityState === "visible")) return;
    let list = null;
    try { list = await Promise.race([items(), new Promise(r => setTimeout(() => r(null), 5000))]); } catch (x) {}
    if (!list || !list.length) list = [{ title: "TalcoExchange", body: "Nouveau message", from: "", ts: Date.now() }];
    for (const n of list) await show(n);
  })());
});
const PUB = "BA8gufdIkmxTX_fCIfkX8CP9l_8uvU5pL9VMuxO6PN68-PZ7_11YR2qecJyBRKCtqcTus8G2tju6Abfml7yKXs4";
self.addEventListener("pushsubscriptionchange", e => {
  e.waitUntil((async () => {
    try {
      const u = await authInfo(); if (!u) return; const tok = await idToken(u);
      const key = Uint8Array.from(atob(PUB.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
      const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      const id = btoa(sub.endpoint).replace(/[^A-Za-z0-9]/g, "").slice(-32);
      await fetch(`${DB}/push/${u.uid}/${id}.json?auth=${tok}`, { method: "PUT", body: JSON.stringify(sub.endpoint) });
    } catch (x) {}
  })());
});
