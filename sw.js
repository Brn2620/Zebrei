// Zebrei: funciona offline depois da primeira visita
const V="zebrei-b4550c556e",SHELL=["./", "index.html", "manifest.webmanifest", "favicon.svg", "icon-192.png", "icon-512.png", "apple-touch-icon.png", "fonts/barlow-latin-400-normal.woff2", "fonts/barlow-latin-500-normal.woff2", "fonts/barlow-latin-600-normal.woff2", "fonts/barlow-latin-700-normal.woff2", "fonts/barlow-latin-ext-400-normal.woff2", "fonts/barlow-latin-ext-500-normal.woff2", "fonts/barlow-latin-ext-600-normal.woff2", "fonts/barlow-latin-ext-700-normal.woff2", "fonts/big-shoulders-display-latin-600-normal.woff2", "fonts/big-shoulders-display-latin-800-normal.woff2", "fonts/big-shoulders-display-latin-900-normal.woff2", "fonts/big-shoulders-display-latin-ext-600-normal.woff2", "fonts/big-shoulders-display-latin-ext-800-normal.woff2", "fonts/big-shoulders-display-latin-ext-900-normal.woff2", "fonts/share-tech-mono-latin-400-normal.woff2"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",e=>{
  const r=e.request,u=new URL(r.url);if(r.method!=="GET"||u.origin!==location.origin)return;
  // página e resultados: rede primeiro (sempre a versão mais nova), cache se estiver offline
  if(r.mode==="navigate"||u.pathname.endsWith("resultados.json")){
    e.respondWith(fetch(r).then(res=>{const cp=res.clone();caches.open(V).then(c=>c.put(r,cp));return res;}).catch(()=>caches.match(r).then(m=>m||caches.match("index.html"))));return;}
  e.respondWith(caches.match(r).then(m=>m||fetch(r).then(res=>{const cp=res.clone();caches.open(V).then(c=>c.put(r,cp));return res;})));
});
