import { checkAuth, authResponse } from "../../_auth";
import { promises as fs } from "fs";
import path from "path";

const CITIES_FILE = process.env.CITIES_FILE_PATH ?? "/opt/data/cities.json";

type City = { id: string; name: string; price: number };

async function readCities(): Promise<City[]> {
  try {
    return JSON.parse(await fs.readFile(CITIES_FILE, "utf8"));
  } catch {
    return [];
  }
}

async function writeCities(cities: City[]) {
  await fs.mkdir(path.dirname(CITIES_FILE), { recursive: true });
  await fs.writeFile(CITIES_FILE, JSON.stringify(cities, null, 2), "utf8");
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = checkAuth(req);
  if (auth !== "ok") return authResponse(auth);

  const { id } = await params;
  const body  = await req.json().catch(() => ({}));
  const name  = String(body.name  ?? "").trim().slice(0, 100);
  const price = Math.round(Number(String(body.price).replace(/\D/g, "")));

  if (!name || !price || price <= 0) {
    return Response.json({ error: "Укажите название и стоимость" }, { status: 400 });
  }

  const cities = await readCities();
  const idx    = cities.findIndex((c) => c.id === id);
  if (idx === -1) return Response.json({ error: "Не найдено" }, { status: 404 });

  cities[idx] = { id, name, price };
  await writeCities(cities);
  return Response.json(cities[idx]);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = checkAuth(req);
  if (auth !== "ok") return authResponse(auth);

  const { id }   = await params;
  const cities   = await readCities();
  const filtered = cities.filter((c) => c.id !== id);

  if (filtered.length === cities.length) {
    return Response.json({ error: "Не найдено" }, { status: 404 });
  }

  await writeCities(filtered);
  return Response.json({ ok: true });
}
