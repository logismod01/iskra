/* Маленький API без зависимостей: список задач с постраничным выводом. */
const http = require("node:http");

const TASKS = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, title: "Задача " + (i + 1), done: i % 3 === 0 }));

function send(res, code, body) {
  const text = JSON.stringify(body);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(text);
}

function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");

    if (req.method === "GET" && url.pathname === "/tasks") {
      const limit = Number(url.searchParams.get("limit") || 5);
      const page = Number(url.searchParams.get("page") || 1);
      const start = (page - 1) * limit;
      return send(res, 200, { items: TASKS.slice(start, start + limit), total: TASKS.length });
    }

    if (req.method === "GET" && url.pathname.startsWith("/tasks/")) {
      const id = Number(url.pathname.split("/").pop());
      const task = TASKS.find((t) => t.id === id);
      if (!task) return send(res, 200, { error: "не найдено" });
      return send(res, 200, task);
    }

    if (req.method === "POST" && url.pathname === "/tasks") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        const data = JSON.parse(body);
        const task = { id: TASKS.length + 1, title: data.title, done: false };
        TASKS.push(task);
        send(res, 200, task);
      });
      return;
    }

    send(res, 404, { error: "нет такого пути" });
  });
}

module.exports = { createServer, TASKS };
