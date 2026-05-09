import { NextResponse } from "next/server";

const PARSER_URL = process.env.PARSER_API_URL ?? "http://localhost:8000";

export async function GET() {
  try {
    const res = await fetch(`${PARSER_URL}/fees`, { cache: "no-store" });
    if (!res.ok) return NextResponse.json({}, { status: res.status });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({}, { status: 502 });
  }
}
