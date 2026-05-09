import { checkAuth, authResponse } from "../_auth";
import { promises as fs } from "fs";
import path from "path";

const RATE_FILE = process.env.RATE_FILE_PATH ?? "/opt/data/rate.json";

interface RateData {
  wonRate: number;
  eurRate: number;
  updatedAt: string | null;
  source: "cbr" | "manual" | "default";
}

const DEFAULT: RateData = { wonRate: 650, eurRate: 95, updatedAt: null, source: "default" };

async function readRate(): Promise<RateData> {
  try {
    const raw = await fs.readFile(RATE_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return DEFAULT;
  }
}

async function writeRate(data: RateData) {
  await fs.mkdir(path.dirname(RATE_FILE), { recursive: true });
  await fs.writeFile(RATE_FILE, JSON.stringify(data, null, 2), "utf8");
}

function parseCbrValute(xml: string, charCode: string): { nominal: number; value: number } | null {
  // Match each Valute block individually to avoid cross-block regex contamination
  const blocks = xml.match(/<Valute[^>]*>[\s\S]*?<\/Valute>/g) ?? [];
  const block = blocks.find(b => b.includes(`<CharCode>${charCode}</CharCode>`));
  if (!block) return null;
  const nominalMatch = block.match(/<Nominal>(\d+)<\/Nominal>/);
  const valueMatch   = block.match(/<Value>([\d,]+)<\/Value>/);
  if (!nominalMatch || !valueMatch) return null;
  const nominal = parseInt(nominalMatch[1], 10);
  const value   = parseFloat(valueMatch[1].replace(",", "."));
  return { nominal, value };
}

async function fetchCbrRates(): Promise<{ wonRate: number; eurRate: number }> {
  const res = await fetch("https://www.cbr.ru/scripts/XML_daily.asp", { cache: "no-store" });
  if (!res.ok) throw new Error(`CBR responded ${res.status}`);
  const xml = await res.text();

  const krw = parseCbrValute(xml, "KRW");
  if (!krw) throw new Error("KRW not found in CBR XML");
  const wonRate = parseFloat(((krw.value / krw.nominal) * 10_000).toFixed(2));

  const eur = parseCbrValute(xml, "EUR");
  const eurRate = eur ? parseFloat((eur.value / eur.nominal).toFixed(2)) : 95;

  return { wonRate, eurRate };
}

export async function GET() {
  return Response.json(await readRate());
}

export async function POST(req: Request) {
  const auth = checkAuth(req);
  if (auth !== "ok") return authResponse(auth);

  const body = await req.json().catch(() => ({}));

  if (body.action === "refresh") {
    try {
      const { wonRate, eurRate } = await fetchCbrRates();
      const data: RateData = { wonRate, eurRate, updatedAt: new Date().toISOString(), source: "cbr" };
      await writeRate(data);
      return Response.json(data);
    } catch (e) {
      return Response.json({ error: String(e) }, { status: 502 });
    }
  }

  const wonRate = Number(body.wonRate);
  if (!wonRate || wonRate <= 0 || wonRate > 100_000) {
    return Response.json({ error: "Некорректный курс" }, { status: 400 });
  }

  const current = await readRate();
  const data: RateData = {
    wonRate: Math.round(wonRate * 100) / 100,
    eurRate: current.eurRate,
    updatedAt: new Date().toISOString(),
    source: "manual",
  };
  await writeRate(data);
  return Response.json(data);
}
