import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { checkAuth, authResponse, sanitizeWork } from "../_auth";

const worksPath = path.join(process.cwd(), "data", "works.json");

export async function GET(req: Request) {
  const auth = checkAuth(req);
  if (auth !== "ok") return authResponse(auth);

  const works = JSON.parse(readFileSync(worksPath, "utf-8"));
  return Response.json(works);
}

export async function POST(req: Request) {
  const auth = checkAuth(req);
  if (auth !== "ok") return authResponse(auth);

  const raw = await req.json();
  const work = sanitizeWork(raw);
  if (!work) {
    return Response.json({ error: "Некорректные данные" }, { status: 400 });
  }

  const works = JSON.parse(readFileSync(worksPath, "utf-8"));
  works.unshift(work);
  writeFileSync(worksPath, JSON.stringify(works, null, 2));
  return Response.json({ success: true });
}
