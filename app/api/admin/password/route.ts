import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { checkAuth, authResponse, sanitizePassword } from "../_auth";

export async function POST(req: Request) {
  const auth = checkAuth(req);
  if (auth !== "ok") return authResponse(auth);

  const body = await req.json();
  const newPassword = sanitizePassword(body?.newPassword);

  if (!newPassword) {
    return Response.json(
      { error: "Пароль должен быть 4–100 печатных символов без переносов строк" },
      { status: 400 }
    );
  }

  const envPath = path.join(process.cwd(), ".env.local");
  const content = readFileSync(envPath, "utf-8");
  const updated = content.replace(/^ADMIN_PASSWORD=.*/m, `ADMIN_PASSWORD=${newPassword}`);
  writeFileSync(envPath, updated);

  process.env.ADMIN_PASSWORD = newPassword;

  return Response.json({ success: true });
}
