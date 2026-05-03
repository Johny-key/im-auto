import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

function moscowTime() {
  return new Date().toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function sendTelegram(name: string, phone: string, email: string, message: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const lines = [
    "📋 *Новая заявка с сайта*",
    "",
    `👤 *Имя:* ${name}`,
    `📞 *Телефон:* ${phone}`,
    email ? `📧 *Email:* ${email}` : null,
    message ? `💬 *Сообщение:* ${message}` : null,
    "",
    `🕐 ${moscowTime()}`,
  ].filter(Boolean).join("\n");

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: lines, parse_mode: "Markdown" }),
  });
}

async function appendSheet(name: string, phone: string, email: string, message: string) {
  const serviceEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!serviceEmail || !privateKey || !sheetId) return;

  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: serviceEmail, private_key: privateKey },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: "Лист1!A:E",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[moscowTime(), name, phone, email, message]],
    },
  });
}

export async function POST(req: NextRequest) {
  const { name, phone, email = "", message = "" } = await req.json();

  if (!name || !phone || phone.replace(/\D/g, "").length !== 11) {
    return NextResponse.json({ error: "invalid_data" }, { status: 400 });
  }

  await Promise.allSettled([
    sendTelegram(name, phone, email, message),
    appendSheet(name, phone, email, message),
  ]);

  return NextResponse.json({ ok: true });
}
