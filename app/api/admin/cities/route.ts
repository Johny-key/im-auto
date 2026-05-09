import { checkAuth, authResponse } from "../_auth";
import { promises as fs } from "fs";
import path from "path";

const CITIES_FILE = process.env.CITIES_FILE_PATH ?? "/opt/data/cities.json";

async function readCities() {
  try {
    return JSON.parse(await fs.readFile(CITIES_FILE, "utf8"));
  } catch {
    return [];
  }
}

async function writeCities(cities: unknown[]) {
  await fs.mkdir(path.dirname(CITIES_FILE), { recursive: true });
  await fs.writeFile(CITIES_FILE, JSON.stringify(cities, null, 2), "utf8");
}

export async function GET(req: Request) {
  const auth = checkAuth(req);
  if (auth !== "ok") return authResponse(auth);
  return Response.json(await readCities());
}

export async function POST(req: Request) {
  const auth = checkAuth(req);
  if (auth !== "ok") return authResponse(auth);

  const body = await req.json().catch(() => ({}));
  const name  = String(body.name  ?? "").trim().slice(0, 100);
  const price = Math.round(Number(String(body.price).replace(/\D/g, "")));

  if (!name || !price || price <= 0) {
    return Response.json({ error: "Укажите название и стоимость" }, { status: 400 });
  }

  const cities = await readCities();
  const city = { id: Date.now().toString(), name, price };
  cities.push(city);
  await writeCities(cities);
  return Response.json(city, { status: 201 });
}
