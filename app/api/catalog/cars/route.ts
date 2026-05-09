import { NextRequest, NextResponse } from "next/server";

const PARSER_URL = process.env.PARSER_API_URL ?? "http://localhost:8000";
const PARSER_KEY = process.env.PARSER_API_KEY ?? "";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const target = new URL(`${PARSER_URL}/cars`);

  for (const [k, v] of searchParams.entries()) {
    target.searchParams.set(k, v);
  }
  if (!target.searchParams.has("limit")) {
    target.searchParams.set("limit", "150");
  }

  try {
    const res = await fetch(target.toString(), {
      headers: PARSER_KEY ? { "X-Api-Key": PARSER_KEY } : {},
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      return NextResponse.json({ error: "Parser error" }, { status: res.status });
    }
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ error: "Parser unavailable" }, { status: 502 });
  }
}
