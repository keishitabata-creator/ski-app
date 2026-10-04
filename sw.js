/* 再生試験用の仲介役（Service Worker）。/ski-app/lab/ の中だけで働く（アプリ本体には関わらない）
 * 動画が「この範囲をください」（Range）と求めるたびに、サーバーの中継から小分け（2MB）で取り寄せて渡す */
const BLOCK = 2 * 1024 * 1024, CFG_KEY = './__cfg';
let cfg = null; const blocks = new Map(), meta = new Map(); let stat = {req: 0, ranges: [], calls: 0};
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
async function getCfg() { if (cfg) return cfg; const c = await caches.open('lab'); const r = await c.match(CFG_KEY); if (r) cfg = await r.json(); return cfg; }
self.addEventListener('message', e => { const d = e.data || {};
  if (d.cfg) { cfg = d.cfg; e.waitUntil(caches.open('lab').then(c => c.put(CFG_KEY, new Response(JSON.stringify(cfg)))).then(() => e.source && e.source.postMessage({cfgOk: true}))); }
  if (d.reset) { blocks.clear(); meta.clear(); stat = {req: 0, ranges: [], calls: 0}; e.source && e.source.postMessage({resetOk: true}); }
  if (d.stat) e.source && e.source.postMessage({stat}); });
function block(vid, b) { const k = vid + ':' + b; if (blocks.has(k)) return blocks.get(k);
  const p = (async () => { const c = await getCfg(); if (!c) throw new Error('設定がない'); stat.calls++;
    const r = await fetch(c.api, {method: 'POST', body: JSON.stringify({fn: 'videoPart', arg: {vid, part: b, size: 2}, ukey: c.ukey, dev: c.dev, tz: c.tz, cv: 'lab'}), headers: {'Content-Type': 'text/plain;charset=utf-8'}, redirect: 'follow'});
    const j = await r.json(); if (!j.ok) throw new Error(j.error || '中継の失敗');
    meta.set(vid, {total: j.data.total, mime: j.data.mime || 'video/mp4'});
    const bin = atob(j.data.b64), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; })();
  blocks.set(k, p); p.catch(() => blocks.delete(k)); return p; }
self.addEventListener('fetch', e => { const u = new URL(e.request.url), m = u.pathname.match(/\/lab\/stream\/([^/]+)$/); if (!m) return; e.respondWith(serve(e.request, decodeURIComponent(m[1]), u.searchParams.get('run') || '')); });
async function serve(req, vid0, run) {
  try { const vid = vid0, rg = req.headers.get('range'); stat.req++; let start = 0, end = null; const mm = rg && rg.match(/bytes=(\d+)-(\d*)/);
    if (mm) { start = +mm[1]; end = mm[2] ? +mm[2] : null; }
    if (!meta.has(vid)) await block(vid, Math.floor(start / BLOCK));
    const {total, mime} = meta.get(vid);
    if (start >= total) return new Response(null, {status: 416, headers: {'Content-Range': 'bytes */' + total}});
    if (!rg) end = total - 1;   // 範囲の指定がなければ全部
    else if (end === null || end >= total) end = Math.min(total - 1, (Math.floor(start / BLOCK) + 1) * BLOCK - 1);   // 終わりの指定がなければ、その2MBの区切りまで
    stat.ranges.push(start + '-' + end + (rg ? '' : '(範囲指定なし)'));
    const b0 = Math.floor(start / BLOCK), b1 = Math.floor(end / BLOCK), parts = [];
    for (let b = b0; b <= b1; b++) parts.push(block(vid, b));
    const arr = await Promise.all(parts), out = new Uint8Array(end - start + 1); let pos = 0;
    arr.forEach((a, i) => { const bs = (b0 + i) * BLOCK, s = Math.max(start, bs) - bs, e2 = Math.min(end, bs + a.length - 1) - bs; out.set(a.subarray(s, e2 + 1), pos); pos += e2 - s + 1; });
    const h = {'Content-Type': mime, 'Accept-Ranges': 'bytes', 'Content-Length': String(out.length), 'Content-Range': 'bytes ' + start + '-' + end + '/' + total};
    return new Response(out, {status: rg ? 206 : 200, headers: rg ? h : {'Content-Type': mime, 'Content-Length': String(out.length)}});
  } catch (err) { stat.ranges.push('失敗：' + (err && err.message || err)); return new Response(String(err && err.message || err), {status: 500}); } }
