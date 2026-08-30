"""
Scraper for ru.guazi.com — Chinese used-car marketplace (SSR/Next.js).

Uses Playwright (real Chromium) for Tencent Cloud EdgeOne bot protection.
Parses SSR HTML directly — no XHR interception needed.

SETUP:
  pip install playwright beautifulsoup4
  playwright install chromium

Run:
  python3 scraper_guazi.py full           # full sync with checkpoint
  python3 scraper_guazi.py incremental    # latest N pages
  python3 scraper_guazi.py dump 1         # dump raw HTML for page N

ENV:
  DATABASE_URL=postgresql+asyncpg://postgres:encar@185.219.41.49:5432/encar
  GUAZI_PROXY=socks5://user:pass@host:1080   # optional
  GUAZI_HEADLESS=false                        # set false to see browser / solve CAPTCHA
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import sys
import uuid
from datetime import datetime
from pathlib import Path

from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

# ── Config ─────────────────────────────────────────────────────────────────────

GUAZI_BASE        = "https://ru.guazi.com"
GUAZI_LIST_URL    = "https://ru.guazi.com/used-cars/"
GUAZI_PROXY       = os.getenv("GUAZI_PROXY")
HEADLESS          = os.getenv("GUAZI_HEADLESS", "true").lower() != "false"
NAV_TIMEOUT       = int(os.getenv("GUAZI_NAV_TIMEOUT", 60_000))
EXTRA_WAIT_MS     = int(os.getenv("GUAZI_EXTRA_WAIT_MS", 4_000))
INCREMENTAL_PAGES = int(os.getenv("GUAZI_INCREMENTAL_PAGES", 30))
CHECKPOINT_PATH   = os.getenv("GUAZI_CHECKPOINT_PATH", "/data/guazi_checkpoint.json")


# ── Fuel type mapping (Chinese labels) ────────────────────────────────────────

_FUEL_MAP: dict[str, str] = {
    "汽油":           "gasoline",
    "柴油":           "diesel",
    "纯电动":         "electric",
    "电动":           "electric",
    "混合动力":       "hybrid",
    "油电混合":       "hybrid",
    "插电式混合动力": "phev",
    "插电混合":       "phev",
    "增程式":         "phev",
    "天然气":         "gas",
    # Russian labels (site is ru.guazi.com)
    "бензин":         "gasoline",
    "дизель":         "diesel",
    "электро":        "electric",
    "электрический":  "electric",
    "гибрид":         "hybrid",
    "подзаряжаемый":  "phev",
    "phev":           "phev",
}

def _map_fuel(raw: str | None) -> str | None:
    if not raw:
        return None
    r = raw.strip().lower()
    for k, v in _FUEL_MAP.items():
        if k.lower() in r:
            return v
    return "gasoline"

def _parse_mileage(raw: str | None) -> int | None:
    """Parse mileage — guazi shows '5万km' (5*10000 km) or plain numbers."""
    if not raw:
        return None
    raw = raw.replace(",", "").replace(" ", "")
    m = re.search(r"([\d.]+)\s*万", raw)
    if m:
        return int(float(m.group(1)) * 10_000)
    m = re.search(r"([\d]+)", raw)
    if m:
        return int(m.group(1))
    return None

def _parse_price_cny(raw: str | None) -> float | None:
    """Parse price — guazi shows '10.5万' (CNY) or plain numbers."""
    if not raw:
        return None
    raw = raw.replace(",", "").replace(" ", "").replace("¥", "")
    m = re.search(r"([\d.]+)\s*万", raw)
    if m:
        return float(m.group(1)) * 10_000
    m = re.search(r"([\d.]+)", raw)
    if m:
        return float(m.group(1))
    return None

def _parse_year(raw: str | None) -> int | None:
    if not raw:
        return None
    m = re.search(r"(20\d{2}|19\d{2})", raw)
    return int(m.group(1)) if m else None

def _parse_volume(raw: str | None) -> int | None:
    """Parse engine volume — '2.0L' → 2000."""
    if not raw:
        return None
    m = re.search(r"([\d.]+)\s*[Ll]", raw)
    if m:
        return int(float(m.group(1)) * 1000)
    return None

def _get_segment(price_cny: float | None) -> str | None:
    if price_cny is None:
        return None
    if price_cny < 150_000:
        return "Эконом"
    if price_cny < 400_000:
        return "Комфорт"
    if price_cny < 800_000:
        return "Бизнес"
    return "Премиум"

_cny_rub_cache: float | None = None

async def _get_cny_rub() -> float:
    global _cny_rub_cache
    if _cny_rub_cache:
        return _cny_rub_cache
    try:
        import httpx
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get("https://www.cbr.ru/scripts/XML_daily.asp")
            import re as _re
            m = _re.search(r'<CharCode>CNY</CharCode>.*?<Value>([\d,]+)</Value>', r.text, _re.S)
            if m:
                _cny_rub_cache = float(m.group(1).replace(",", "."))
                return _cny_rub_cache
    except Exception:
        pass
    return 13.0  # fallback

def _calc_total_rub_sync(price_cny: float | None, cny_rub: float) -> int | None:
    if price_cny is None:
        return None
    return int(price_cny * cny_rub)

# ── Playwright browser ─────────────────────────────────────────────────────────

async def _make_context(playwright):
    browser = await playwright.chromium.launch(
        headless=HEADLESS,
        args=[
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-blink-features=AutomationControlled",
        ],
        proxy={"server": GUAZI_PROXY} if GUAZI_PROXY else None,
    )
    context = await browser.new_context(
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        locale="ru-RU",
        timezone_id="Europe/Moscow",
        viewport={"width": 1280, "height": 900},
    )
    await context.add_init_script(
        "Object.defineProperty(navigator,'webdriver',{get:()=>undefined})"
    )
    return browser, context

async def _load_page(context, url: str) -> str | None:
    """Navigate to URL and return page HTML. Waits for networkidle."""
    page = await context.new_page()
    try:
        await page.goto(url, wait_until="networkidle", timeout=NAV_TIMEOUT)
        await page.wait_for_timeout(EXTRA_WAIT_MS)

        # If Tencent CAPTCHA is shown, wait up to 60s for user to solve it
        # (when HEADLESS=false the browser window is visible)
        for _ in range(12):
            title = await page.title()
            content = await page.content()
            if "Security Verification" in title or "verify" in title.lower():
                log.warning("CAPTCHA detected, waiting 5s...")
                await page.wait_for_timeout(5_000)
            else:
                break

        html = await page.content()
        return html
    except Exception as e:
        log.warning(f"Navigation error for {url}: {e}")
        return None
    finally:
        await page.close()

# ── HTML Parser ────────────────────────────────────────────────────────────────

def _parse_car_list(html: str, cny_rub: float = 13.0) -> list[dict]:
    """Extract car cards from guazi listing page HTML."""
    soup = BeautifulSoup(html, "html.parser")
    cars = []

    # guazi.com Next.js SSR — car cards are typically <a> or <li> elements
    # Try multiple selector patterns
    selectors = [
        "a[href*='/products/']",      # product links
        "[class*='car-item']",
        "[class*='CarItem']",
        "[class*='product-item']",
        "[class*='listing']",
        "li[class*='item']",
    ]

    cards = []
    for sel in selectors:
        cards = soup.select(sel)
        if len(cards) >= 3:
            log.info(f"Found {len(cards)} cards with selector: {sel}")
            break

    if not cards:
        log.warning("No car cards found — site structure may have changed")
        log.debug(f"Page title: {soup.title.string if soup.title else 'N/A'}")
        return []

    for card in cards:
        try:
            car = _parse_card(card, cny_rub)
            if car:
                cars.append(car)
        except Exception as e:
            log.debug(f"Card parse error: {e}")

    return cars

def _parse_slug(slug: str) -> dict:
    """
    Extract car data from URL slug.
    Format: {brand}-{model}-{year}-{engine?}-{color}-{mileage}km-{trans}-{drive}-{seats}-seats-{id}
    Example: audi-a3-2022-141-white-29100km-at-2wd-5-seats-3u8h47xk59
    """
    parts = slug.split("-")
    result: dict = {}

    # Year — 4-digit 19xx/20xx
    for i, p in enumerate(parts):
        if re.fullmatch(r"(19|20)\d{2}", p):
            result["year"] = int(p)
            # Brand = parts before year, model = parts right after brand
            brand_parts = parts[:i]
            # Last element of brand_parts might be model start — guess brand is 1 word
            if brand_parts:
                result["manufacturer"] = brand_parts[0].title()
                if len(brand_parts) > 1:
                    result["model"] = " ".join(brand_parts[1:]).upper()
            break

    # Mileage — NNNNNkm
    m = re.search(r"(\d+)km", slug)
    if m:
        result["mileage"] = int(m.group(1))

    # Engine volume — 3-digit number like 141 = 1.4L, 200 = 2.0L, 30 = 3.0L
    # appears right after year
    if "year" in result:
        year_idx = next(i for i, p in enumerate(parts) if p == str(result["year"]))
        if year_idx + 1 < len(parts):
            candidate = parts[year_idx + 1]
            m2 = re.fullmatch(r"(\d{2,3})", candidate)
            if m2:
                n = int(m2.group(1))
                # 10 → 1.0L=1000, 14→1.4L=1400, 20→2.0L=2000, 30→3.0L=3000
                if n <= 99:
                    result["engine_volume"] = n * 100
                else:
                    # 141 → 1.4L=1400 (drop last digit, *100)
                    result["engine_volume"] = (n // 10) * 100

    # Fuel type from slug keywords
    if "electric" in slug or "ev" in slug:
        result["fuel_type"] = "electric"
    elif "hybrid" in slug or "phev" in slug:
        result["fuel_type"] = "phev"
    elif "diesel" in slug:
        result["fuel_type"] = "diesel"

    return result


def _parse_card(card, cny_rub: float = 13.0) -> dict | None:
    """Parse a single car card element."""
    href = card.get("href") or (card.find("a") and card.find("a").get("href")) or ""
    if not href:
        return None

    if href.startswith("/"):
        href = GUAZI_BASE + href
    slug = href.rstrip("/").split("/")[-1].replace(".html", "")
    car_id = f"guazi_{slug}"

    # Base data from URL slug (reliable even when JS hasn't hydrated)
    slug_data = _parse_slug(slug)

    # Extract all text content from card HTML
    text = card.get_text(" ", strip=True)

    # Title from heading elements
    title_el = (
        card.find(["h2", "h3", "h1"]) or
        card.find(class_=re.compile(r"title|name|car-name", re.I))
    )
    title = title_el.get_text(strip=True) if title_el else ""
    if not title:
        # Build title from slug data
        mfr = slug_data.get("manufacturer", "")
        mdl = slug_data.get("model", "")
        yr  = slug_data.get("year", "")
        title = f"{mfr} {mdl} {yr}".strip()

    manufacturer, model = _split_title(title)
    manufacturer = manufacturer or slug_data.get("manufacturer")
    model        = model        or slug_data.get("model")

    # Price — look for price elements or 万 pattern in text
    price_cny = None
    price_el = (
        card.find(class_=re.compile(r"price|Price", re.I)) or
        card.find(string=re.compile(r"万|¥"))
    )
    price_raw = price_el.get_text(strip=True) if hasattr(price_el, "get_text") else (price_el or "")
    if not price_raw:
        m = re.search(r"[\d.]+\s*万", text)
        price_raw = m.group(0) if m else ""
    price_cny = _parse_price_cny(price_raw)

    # Year — from slug (reliable), fallback text
    year = slug_data.get("year")
    if not year:
        m = re.search(r"(20\d{2}|19\d{2})", text)
        year = int(m.group(1)) if m else None

    # Mileage — from slug (reliable), fallback text
    mileage = slug_data.get("mileage")
    if not mileage:
        m = re.search(r"[\d.]+\s*万\s*[Kk][Mm]|[\d,]+\s*[Kk][Mm]", text)
        mileage = _parse_mileage(m.group(0) if m else None)

    # Engine volume — from slug, fallback text
    engine_volume = slug_data.get("engine_volume")
    if not engine_volume:
        m = re.search(r"[\d.]+\s*[Ll](?:\s|[-,]|$)", text)
        engine_volume = _parse_volume(m.group(0) if m else None)

    # Fuel type — from slug, fallback text
    fuel_type = slug_data.get("fuel_type")
    if not fuel_type:
        m = re.search(r"бензин|дизель|электро|гибрид|phev|汽油|柴油|纯电动|混合动力|插电", text, re.I)
        fuel_type = _map_fuel(m.group(0) if m else None)

    # City
    city_el = card.find(class_=re.compile(r"city|location|area|region", re.I))
    city = city_el.get_text(strip=True) if city_el else None

    # Images — accept any https image, guazi CDN typically uses guazistatic.com
    imgs = []
    for img in card.find_all("img"):
        src = img.get("src") or img.get("data-src") or img.get("data-lazy")
        if src and src.startswith("http") and not src.endswith(".svg"):
            imgs.append(src)

    total_rub = _calc_total_rub_sync(price_cny, cny_rub)

    return {
        "id":            car_id,
        "manufacturer":  manufacturer,
        "model":         model,
        "badge":         title,
        "fuel_type":     fuel_type,
        "year":          year,
        "mileage":       mileage,
        "price":         price_cny,
        "office_city":   city,
        "photos":        imgs or None,
        "photo_base":    imgs[0] if imgs else None,
        "engine_volume": engine_volume,
        "segment":       _get_segment(price_cny),
        "total_rub":     total_rub,
        "country":       "china",
        "source_url":    href,
    }

def _split_title(title: str) -> tuple[str | None, str | None]:
    """Split 'BMW 3 Series 2021' into ('BMW', '3 Series')."""
    if not title:
        return None, None
    # Known brands (first word or two)
    known = [
        "BMW", "Mercedes-Benz", "Mercedes", "Audi", "Toyota", "Honda", "Nissan",
        "Hyundai", "Kia", "Volkswagen", "VW", "Porsche", "Lexus", "Volvo",
        "BYD", "Geely", "Chery", "Haval", "Great Wall", "Changan", "Li Auto",
        "NIO", "Xpeng", "BAIC", "JAC", "Dongfeng", "SAIC", "FAW", "GAC",
        "Cadillac", "Buick", "Chevrolet", "Ford", "Land Rover", "Jeep",
        "Mitsubishi", "Mazda", "Subaru", "Suzuki", "Infiniti", "Acura",
    ]
    title_clean = re.sub(r"\s+(20\d{2}|19\d{2}).*$", "", title).strip()
    for brand in known:
        if title_clean.lower().startswith(brand.lower()):
            rest = title_clean[len(brand):].strip()
            return brand, rest if rest else None
    parts = title_clean.split(maxsplit=1)
    return parts[0] if parts else None, parts[1] if len(parts) > 1 else None

# ── Pagination helper ──────────────────────────────────────────────────────────

def _next_page_url(html: str, current_url: str, page_num: int) -> str | None:
    """Build URL for next page — guazi uses ?page=N or /page/N."""
    # Try to find next page link
    soup = BeautifulSoup(html, "html.parser")
    next_link = (
        soup.find("a", string=re.compile(r"следующ|next|>|›", re.I)) or
        soup.find("a", attrs={"aria-label": re.compile(r"next|след", re.I)})
    )
    if next_link and next_link.get("href"):
        href = next_link["href"]
        return GUAZI_BASE + href if href.startswith("/") else href

    # Fallback: append ?page=N
    base = current_url.split("?")[0]
    return f"{base}?page={page_num}"

# ── DB upsert ─────────────────────────────────────────────────────────────────

async def _upsert_cars(cars: list[dict]) -> int:
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    from db import SessionLocal
    from models import Car
    if not cars:
        return 0
    now = datetime.utcnow()
    async with SessionLocal() as session:
        saved = 0
        for c in cars:
            try:
                stmt = pg_insert(Car).values(
                    id=c["id"],
                    manufacturer=c.get("manufacturer"),
                    model=c.get("model"),
                    badge=c.get("badge"),
                    fuel_type=c.get("fuel_type"),
                    year=c.get("year"),
                    mileage=c.get("mileage"),
                    price=c.get("price"),
                    office_city=c.get("office_city"),
                    photos=c.get("photos"),
                    photo_base=c.get("photo_base"),
                    engine_volume=c.get("engine_volume"),
                    segment=c.get("segment"),
                    total_rub=c.get("total_rub"),
                    country="china",
                    green_type=False,
                    flood_damage=False,
                    accident_fetched=False,
                    details_fetched=False,
                    is_available=True,
                    first_seen_at=now,
                    last_seen_at=now,
                    updated_at=now,
                ).on_conflict_do_update(
                    index_elements=["id"],
                    set_=dict(
                        price=c.get("price"),
                        total_rub=c.get("total_rub"),
                        mileage=c.get("mileage"),
                        photos=c.get("photos"),
                        photo_base=c.get("photo_base"),
                        is_available=True,
                        last_seen_at=now,
                        updated_at=now,
                    ),
                )
                await session.execute(stmt)
                saved += 1
            except Exception as e:
                log.warning(f"DB error for {c.get('id')}: {e}")
        await session.commit()
    return saved

# ── Checkpoint ────────────────────────────────────────────────────────────────

def _load_checkpoint() -> dict:
    try:
        return json.loads(Path(CHECKPOINT_PATH).read_text())
    except Exception:
        return {"last_page": 0, "total_saved": 0}

def _save_checkpoint(data: dict):
    try:
        Path(CHECKPOINT_PATH).parent.mkdir(parents=True, exist_ok=True)
        Path(CHECKPOINT_PATH).write_text(json.dumps(data))
    except Exception as e:
        log.warning(f"Checkpoint save failed: {e}")

# ── Main scraping loop ────────────────────────────────────────────────────────

async def scrape(mode: str, dump_page: int = 1):
    from playwright.async_api import async_playwright

    if mode != "dump":
        from db import init_db
        await init_db()

    cny_rub = await _get_cny_rub()
    log.info(f"CNY/RUB rate: {cny_rub}")

    async with async_playwright() as pw:
        browser, context = await _make_context(pw)
        try:
            if mode == "dump":
                url = f"{GUAZI_LIST_URL}?page={dump_page}"
                log.info(f"Dumping page {dump_page}: {url}")
                html = await _load_page(context, url)
                if html:
                    print(html[:5000])
                    cars = _parse_car_list(html, cny_rub)
                    log.info(f"Parsed {len(cars)} cars from dump")
                    for c in cars[:3]:
                        print(json.dumps(c, ensure_ascii=False, indent=2))
                return

            if mode == "incremental":
                start_page = 1
                max_pages = INCREMENTAL_PAGES
            else:  # full
                cp = _load_checkpoint()
                start_page = cp.get("last_page", 0) + 1
                max_pages = 9999

            total_saved = 0
            current_url = GUAZI_LIST_URL
            page_num = start_page

            if page_num > 1:
                current_url = f"{GUAZI_LIST_URL}?page={page_num}"

            for i in range(max_pages):
                log.info(f"Scraping page {page_num}: {current_url}")
                html = await _load_page(context, current_url)

                if not html:
                    log.warning(f"Empty response on page {page_num}, stopping")
                    break

                cars = _parse_car_list(html, cny_rub)
                if not cars:
                    log.info(f"No cars on page {page_num}, reached end")
                    break

                saved = await _upsert_cars(cars)
                total_saved += saved
                log.info(f"Page {page_num}: {len(cars)} parsed, {saved} saved (total: {total_saved})")

                if mode == "full":
                    _save_checkpoint({"last_page": page_num, "total_saved": total_saved})

                # Find next page URL
                next_url = _next_page_url(html, current_url, page_num + 1)
                if not next_url or next_url == current_url:
                    log.info("No next page found, done")
                    break

                current_url = next_url
                page_num += 1
                await asyncio.sleep(2)  # polite delay

            log.info(f"Done. Total saved: {total_saved}")

        finally:
            await browser.close()


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "incremental"
    dump_page = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    asyncio.run(scrape(mode, dump_page))
