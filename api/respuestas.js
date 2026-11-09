const admin = require("firebase-admin");
const serviceAccount = require("./firebase-credentials");

const DATABASE_URL = "https://validaciones-b3a7b-default-rtdb.firebaseio.com";
const RTDB_PATH = "respuestas";

let ready = false;

function initFirebase() {
  if (ready) return;
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: DATABASE_URL,
  });
  ready = true;
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function authExport(req) {
  const secret = process.env.EXPORT_SECRET;
  if (!secret) return true;
  const q = req.query && req.query.key;
  const h = req.headers.authorization;
  const bearer = h && h.startsWith("Bearer ") ? h.slice(7) : "";
  return q === secret || bearer === secret;
}

function normalizar(body) {
  return {
    nombre: String(body.nombre || "").trim(),
    dependencia: String(body.dependencia || "").trim(),
    rol: String(body.rol || "").trim(),
    p1: String(body.p1 || "").trim(),
    p2: String(body.p2 || "").trim(),
    p3: String(body.p3 || "").trim(),
    o1: String(body.o1 || "").trim(),
    o2: String(body.o2 || "").trim(),
    o3: String(body.o3 || "").trim(),
    ts: body.ts || new Date().toISOString(),
  };
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  try {
    initFirebase();
  } catch (e) {
    res.status(500).json({ error: e.message });
    return;
  }

  const db = admin.database();

  if (req.method === "POST") {
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        res.status(400).json({ error: "JSON inválido" });
        return;
      }
    }
    const r = normalizar(body || {});
    if (!r.p1 || !r.p2 || !r.p3) {
      res.status(400).json({ error: "Faltan las tres respuestas Sí/No" });
      return;
    }
    try {
      const ref = db.ref(RTDB_PATH).push();
      await ref.set(r);
      res.status(201).json({ ok: true, id: ref.key });
    } catch (e) {
      res.status(500).json({ error: "No se pudo guardar en Firebase", detail: e.message });
    }
    return;
  }

  if (req.method === "GET") {
    if (!authExport(req)) {
      res.status(401).json({ error: "Clave de exportación incorrecta" });
      return;
    }
    try {
      const snap = await db.ref(RTDB_PATH).once("value");
      const val = snap.val() || {};
      const rows = Object.keys(val).map(function (id) {
        return Object.assign({ id: id }, val[id]);
      });
      rows.sort(function (a, b) {
        return String(a.ts || "").localeCompare(String(b.ts || ""));
      });
      res.status(200).json({ total: rows.length, respuestas: rows });
    } catch (e) {
      res.status(500).json({ error: "No se pudo leer Firebase", detail: e.message });
    }
    return;
  }

  res.status(405).json({ error: "Método no permitido" });
};
