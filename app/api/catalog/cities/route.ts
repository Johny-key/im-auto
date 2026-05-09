import { promises as fs } from "fs";

const CITIES_FILE = process.env.CITIES_FILE_PATH ?? "/opt/data/cities.json";

export async function GET() {
  try {
    const raw = await fs.readFile(CITIES_FILE, "utf8");
    return Response.json(JSON.parse(raw));
  } catch {
    return Response.json([]);
  }
}
