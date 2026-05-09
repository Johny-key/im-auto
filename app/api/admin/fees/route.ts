import { checkAuth, authResponse } from "../_auth";

const PARSER_URL = process.env.PARSER_API_URL ?? "http://localhost:8000";
const PARSER_KEY = process.env.PARSER_API_KEY ?? "";

export async function GET(req: Request) {
  const auth = checkAuth(req);
  if (auth !== "ok") return authResponse(auth);

  const res = await fetch(`${PARSER_URL}/fees`);
  const data = await res.json();
  return Response.json(data);
}

export async function PUT(req: Request) {
  const auth = checkAuth(req);
  if (auth !== "ok") return authResponse(auth);

  const body = await req.json();

  const res = await fetch(`${PARSER_URL}/fees`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": PARSER_KEY,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) return Response.json(data, { status: res.status });
  return Response.json(data);
}
