import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync } from "node:fs";
import { join } from "node:path";

// 개발 중에는 /api/*.js 를 Vite 개발 서버 안에서 그대로 실행한다 (Vercel Functions와 같은 (req, res) 모양).
// 비밀 값은 .env.local 에서 서버 프로세스로만 읽고, VITE_ 접두어는 쓰지 않으므로 브라우저 번들에 들어가지 않는다.
function apiDev(mode) {
  return {
    name: "bcr-api-dev",
    configureServer(server) {
      const env = loadEnv(mode, process.cwd(), "");
      for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v;

      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) return next();
        const url = new URL(req.url, "http://localhost");
        const name = url.pathname.slice("/api/".length).replace(/\/$/, "");
        const file = join(process.cwd(), "api", `${name}.js`);
        if (!/^[a-z-]+$/.test(name) || !existsSync(file)) {
          res.statusCode = 404;
          res.setHeader("content-type", "application/json; charset=utf-8");
          return res.end(JSON.stringify({ error: { code: "not_found", message: "없는 API입니다." } }));
        }
        let raw = "";
        for await (const chunk of req) raw += chunk;
        try { req.body = raw && (req.headers["content-type"] ?? "").includes("json") ? JSON.parse(raw) : raw || undefined; }
        catch { req.body = undefined; }
        req.query = Object.fromEntries(url.searchParams);
        res.status = code => { res.statusCode = code; return res; };
        res.json = obj => { res.setHeader("content-type", "application/json; charset=utf-8"); res.end(JSON.stringify(obj)); return res; };
        try {
          const mod = await server.ssrLoadModule(file);
          await mod.default(req, res);
        } catch (e) {
          console.error("[api-dev]", e);
          if (!res.writableEnded) res.status(500).json({ error: { code: "internal", message: "서버 오류가 발생했습니다." } });
        }
      });
    }
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), apiDev(mode)],
  server: { port: 5173 },
  test: { include: ["tests/**/*.test.js"], environment: "node" }
}));
