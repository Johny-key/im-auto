#!/usr/bin/env node
"use strict";
// Cron script: fetch KRW/RUB from CBR and save to /opt/data/rate.json
// Runs daily at 05:00 UTC (08:00 MSK)

const https = require("https");
const fs    = require("fs");
const path  = require("path");

const RATE_FILE = process.env.RATE_FILE_PATH || "/opt/data/rate.json";

function fetchXml(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let buf = "";
      res.on("data", (c) => (buf += c));
      res.on("end",  () => resolve(buf));
      res.on("error", reject);
    }).on("error", reject);
  });
}

async function main() {
  const ts = new Date().toISOString();
  process.stdout.write(`[${ts}] Fetching KRW rate from CBR... `);

  const xml = await fetchXml("https://www.cbr.ru/scripts/XML_daily.asp");

  const block = xml.match(
    /<Valute[^>]*>(?:(?!<\/Valute>)[\s\S])*?<CharCode>KRW<\/CharCode>[\s\S]*?<\/Valute>/
  );
  if (!block) throw new Error("KRW not found in CBR response");

  const nominal = parseInt(block[0].match(/<Nominal>(\d+)<\/Nominal>/)[1], 10);
  const value   = parseFloat(block[0].match(/<Value>([\d,]+)<\/Value>/)[1].replace(",", "."));
  const wonRate = parseFloat(((value / nominal) * 10_000).toFixed(2));

  const data = { wonRate, updatedAt: new Date().toISOString(), source: "cbr" };
  fs.mkdirSync(path.dirname(RATE_FILE), { recursive: true });
  fs.writeFileSync(RATE_FILE, JSON.stringify(data, null, 2), "utf8");

  console.log(`OK — 1 万₩ = ${wonRate} ₽`);
}

main().catch((err) => {
  console.error(`\n[${new Date().toISOString()}] FAILED:`, err.message);
  process.exit(1);
});
