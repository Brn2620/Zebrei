// API do ranking do Zebrei: guarda o resultado final de cada temporada simulada (anônimo)
// e devolve as estatísticas por clube. Um único Durable Object com SQLite guarda tudo.
const TEAMS = ["FLA","PAL","FLU","CAP","CRU","BAH","CAM","SAN","CFC","RBB","SAO","VIT","BOT","VAS","MIR","COR","INT","GRE","REM","CHA"];
const ORIGINS = ["https://zebrei.com", "https://www.zebrei.com", "https://brn2620.github.io", "http://localhost:8767", "http://localhost:8787"];

function cors(req) {
  const o = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : "https://zebrei.com",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
const json = (req, data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...cors(req), ...extra } });

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
    const u = new URL(req.url);
    if (u.pathname === "/health") return json(req, { ok: true });
    if (!["/r", "/s", "/all"].includes(u.pathname)) return json(req, { erro: "não encontrado" }, 404);
    const stub = env.RANKING.get(env.RANKING.idFromName("global"));
    const ip = req.headers.get("CF-Connecting-IP") || "local";
    const fwd = new Request(u.toString(), { method: req.method, body: req.method === "POST" ? await req.text() : undefined, headers: { "Content-Type": "application/json", "X-IP": ip } });
    const res = await stub.fetch(fwd);
    const body = await res.text();
    const cache = req.method === "GET" ? { "Cache-Control": "public, max-age=60" } : {};
    return new Response(body, { status: res.status, headers: { "Content-Type": "application/json; charset=utf-8", ...cors(req), ...cache } });
  },
};

async function sha(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].slice(0, 8).map(b => b.toString(16).padStart(2, "0")).join("");
}

export class Ranking {
  constructor(state) {
    this.sql = state.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS r(id INTEGER PRIMARY KEY, team TEXT NOT NULL, pos INTEGER NOT NULL, pts INTEGER NOT NULL, gain INTEGER NOT NULL, ts INTEGER NOT NULL, ip TEXT NOT NULL)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS r_team ON r(team)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS r_ip ON r(ip, ts)`);
  }
  stats(team) {
    const rows = this.sql.exec(`SELECT pos, COUNT(*) AS c, SUM(pts) AS sp FROM r WHERE team = ? GROUP BY pos`, team).toArray();
    const dist = Array(20).fill(0); let n = 0, sp = 0, spos = 0;
    for (const x of rows) { dist[x.pos - 1] = x.c; n += x.c; sp += x.sp; spos += x.pos * x.c; }
    const best = rows.length ? Math.min(...rows.map(x => x.pos)) : null;
    return { team, n, dist, mediaPts: n ? +(sp / n).toFixed(1) : null, mediaPos: n ? +(spos / n).toFixed(1) : null, melhor: best };
  }
  async fetch(req) {
    const u = new URL(req.url);
    if (req.method === "GET" && u.pathname === "/s") {
      const t = (u.searchParams.get("team") || "").toUpperCase();
      if (!TEAMS.includes(t)) return new Response(JSON.stringify({ erro: "clube inválido" }), { status: 400 });
      return new Response(JSON.stringify(this.stats(t)));
    }
    if (req.method === "GET" && u.pathname === "/all") {
      const rows = this.sql.exec(`SELECT team, COUNT(*) AS n, AVG(pos) AS mp FROM r GROUP BY team`).toArray();
      const out = {}; for (const x of rows) out[x.team] = { n: x.n, mediaPos: +(+x.mp).toFixed(1) };
      return new Response(JSON.stringify({ total: rows.reduce((s, x) => s + x.n, 0), times: out }));
    }
    if (req.method === "POST" && u.pathname === "/r") {
      let b; try { b = JSON.parse(await req.text()); } catch { return new Response(JSON.stringify({ erro: "corpo inválido" }), { status: 400 }); }
      const team = String(b.team || "").toUpperCase(), pos = b.pos | 0, pts = b.pts | 0, gain = b.gain | 0;
      if (!TEAMS.includes(team) || pos < 1 || pos > 20 || pts < 0 || pts > 114 || gain < 0 || gain > 30) return new Response(JSON.stringify({ erro: "resultado inválido" }), { status: 400 });
      const ip = await sha("zebrei:" + (req.headers.get("X-IP") || ""));
      const now = Date.now();
      const recent = this.sql.exec(`SELECT COUNT(*) AS c FROM r WHERE ip = ? AND ts > ?`, ip, now - 60000).one().c;
      const st0 = this.stats(team);
      if (recent >= 6) return new Response(JSON.stringify({ ...st0, gravado: false, motivo: "muitas simulações seguidas" }), { status: 429 });
      this.sql.exec(`INSERT INTO r(team, pos, pts, gain, ts, ip) VALUES (?, ?, ?, ?, ?, ?)`, team, pos, pts, gain, now, ip);
      return new Response(JSON.stringify({ ...this.stats(team), gravado: true }));
    }
    return new Response(JSON.stringify({ erro: "não encontrado" }), { status: 404 });
  }
}
