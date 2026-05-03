import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import { checkAuth, authResponse } from "../_auth";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB per file
const MAX_FILES = 20;

// JPEG: FF D8 FF  |  PNG: 89 50 4E 47  |  WEBP: 52 49 46 46 ... 57 45 42 50
function isImage(buf: Buffer): boolean {
  if (buf.length < 4) return false;
  const jpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const png  = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const webp = buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
               buf.length >= 12 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50;
  return jpeg || png || webp;
}

function extFromBuf(buf: Buffer): string {
  if (buf[0] === 0x89) return "png";
  if (buf[0] === 0x52) return "webp";
  return "jpg";
}

export async function POST(req: Request) {
  const auth = checkAuth(req);
  if (auth !== "ok") return authResponse(auth);

  const formData = await req.formData();

  const rawSlug = formData.get("slug");
  if (typeof rawSlug !== "string" || !rawSlug) {
    return Response.json({ error: "Не указан slug" }, { status: 400 });
  }
  // Sanitize: only lowercase letters, digits, hyphens — no dots, no slashes
  const slug = rawSlug.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  if (!slug) return Response.json({ error: "Некорректный slug" }, { status: 400 });

  // Ensure destination stays inside public/works/
  const worksRoot = path.join(process.cwd(), "public", "works");
  const dir = path.resolve(worksRoot, slug);
  if (!dir.startsWith(worksRoot + path.sep)) {
    return Response.json({ error: "Некорректный путь" }, { status: 400 });
  }

  const files = formData.getAll("photos") as File[];
  if (files.length === 0) return Response.json({ error: "Нет файлов" }, { status: 400 });
  if (files.length > MAX_FILES) {
    return Response.json({ error: `Максимум ${MAX_FILES} фото` }, { status: 400 });
  }

  mkdirSync(dir, { recursive: true });

  const paths: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const bytes = await files[i].arrayBuffer();
    if (bytes.byteLength > MAX_FILE_BYTES) {
      return Response.json({ error: `Файл ${i + 1} превышает 10 МБ` }, { status: 400 });
    }

    const buf = Buffer.from(bytes);
    if (!isImage(buf)) {
      return Response.json({ error: `Файл ${i + 1} не является изображением` }, { status: 400 });
    }

    const ext = extFromBuf(buf);
    const filename = `${i + 1}.${ext}`;
    writeFileSync(path.join(dir, filename), buf);
    paths.push(`/works/${slug}/${filename}`);
  }

  return Response.json({ paths });
}
