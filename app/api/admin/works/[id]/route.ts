import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { checkAuth, authResponse } from "../../_auth";

const worksPath = path.join(process.cwd(), "data", "works.json");

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = checkAuth(req);
  if (auth !== "ok") return authResponse(auth);

  const { id } = await params;
  const index = parseInt(id, 10);
  if (!Number.isFinite(index) || index < 0) {
    return Response.json({ error: "Некорректный индекс" }, { status: 400 });
  }

  const works = JSON.parse(readFileSync(worksPath, "utf-8"));
  if (index >= works.length) {
    return Response.json({ error: "Не найдено" }, { status: 404 });
  }

  works.splice(index, 1);
  writeFileSync(worksPath, JSON.stringify(works, null, 2));
  return Response.json({ success: true });
}
