"""
Scraper for che168.com — China's largest used-car marketplace.

Uses Playwright (real Chromium) so the browser handles bot-detection challenges
and computes the _sign parameter automatically. We just intercept the API responses.

SETUP (VPS):
  pip install playwright
  playwright install chromium --with-deps

  Optional Chinese proxy/VPN if the VPS IP is blocked:
    CHINA_PROXY=socks5://user:pass@host:1080
    CHINA_PROXY=http://user:pass@host:3128

Run:
  python3 scraper_china.py full           # full sync (first time, runs for hours)
  python3 scraper_china.py incremental    # daily top-50-pages sync
  python3 scraper_china.py dump 1         # dump raw API response for page N to stdout
"""

import asyncio
import json
import logging
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

# Ensure the parser directory is in sys.path when running from a parent directory
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from calculator import get_cbr_rates, get_segment
from db import SessionLocal, init_db
from models import Car

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

# ── Config ─────────────────────────────────────────────────────────────────────

# Mobile listing page — Playwright navigates here; the page internally calls the API
CHE168_LIST_BASE   = "https://m.che168.com/china/list/"
# Pattern to match in intercepted XHR responses — any che168 API subdomain
# Old: api2scsou.che168.com/api/v11/search
# New: apiiautoappsh.che168.com (discovered 2026-08-30 via XHR capture)
CHE168_API_PATTERN = "che168.com"  # broad match — filter by content below

CHINA_PROXY        = os.getenv("CHINA_PROXY")
PAGE_SIZE          = int(os.getenv("CHINA_PAGE_SIZE", 10))   # che168 default = 10
NAV_TIMEOUT        = int(os.getenv("CHINA_NAV_TIMEOUT", 60_000))   # ms
EXTRA_WAIT_MS      = int(os.getenv("CHINA_EXTRA_WAIT_MS", 3_000))  # ms after networkidle
INCREMENTAL_PAGES  = int(os.getenv("CHINA_INCREMENTAL_PAGES", 50))

CHECKPOINT_PATH    = os.getenv("CHINA_CHECKPOINT_PATH", "/data/china_checkpoint.json")
DEBUG_DUMP_DIR     = os.getenv("CHINA_DEBUG_DUMP_DIR", "")  # if set, dump raw JSON here

# ── Fuel type mapping ──────────────────────────────────────────────────────────
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
    "LPG":            "gas",
    "氢燃料":         "hydrogen",
}

# ── Brand name mapping (Chinese → Latin/English) ───────────────────────────────
_BRAND_MAP: dict[str, str] = {
    "比亚迪": "BYD",        "理想":   "Li Auto",     "小鹏":   "Xpeng",
    "蔚来":   "NIO",        "奇瑞":   "Chery",        "吉利":   "Geely",
    "长安":   "Changan",    "哈弗":   "Haval",         "长城":  "Great Wall",
    "红旗":   "Hongqi",     "华为":   "Huawei",        "问界":  "AITO",
    "极氪":   "Zeekr",      "深蓝":   "Deepal",        "岚图":  "Voyah",
    "腾势":   "Denza",      "仰望":   "Yangwang",      "方程豹": "Fang Cheng Bao",
    "广汽":   "GAC",        "埃安":   "Aion",          "传祺":  "Trumpchi",
    "上汽":   "SAIC",       "荣威":   "Roewe",         "名爵":  "MG",
    "五菱":   "Wuling",     "宝骏":   "Baojun",        "东风":  "Dongfeng",
    "大众":   "Volkswagen", "宝马":   "BMW",           "奔驰":  "Mercedes-Benz",
    "奥迪":   "Audi",       "丰田":   "Toyota",        "本田":  "Honda",
    "日产":   "Nissan",     "现代":   "Hyundai",       "起亚":  "Kia",
    "福特":   "Ford",       "别克":   "Buick",         "雪佛兰": "Chevrolet",
    "凯迪拉克": "Cadillac", "特斯拉": "Tesla",         "领克":  "Lynk & Co",
    "极狐":   "ARCFOX",     "飞凡":   "Rising Auto",   "智己":  "IM Motors",
    "阿维塔": "Avatr",      "路特斯": "Lotus",         "星途":  "Exeed",
    "捷途":   "Jetour",     "坦克":   "Tank",          "欧拉":  "ORA",
    "魏牌":   "WEY",        "雷达":   "Radar",         "银河":  "Galaxy",
    "帝豪":   "Emgrand",    "星越":   "Xingyue",
}


def translate_brand(raw: str) -> str:
    return _BRAND_MAP.get(raw.strip(), raw.strip())


def translate_fuel(raw: str) -> str:
    return _FUEL_MAP.get(raw.strip(), raw.strip())


# ── Price calculation ──────────────────────────────────────────────────────────

async def calc_total_rub(price_cny: float) -> tuple[str | None, int | None]:
    try:
        rates = await get_cbr_rates()
        cny_rub = rates.get("CNY", 0)
        if not cny_rub:
            return None, None
        total = int(price_cny * cny_rub)
        return get_segment(total), total
    except Exception as e:
        log.warning(f"calc_total_rub error: {e}")
        return None, None


# ── Data mapping ───────────────────────────────────────────────────────────────

def _first(d: dict, *keys, default=None):
    """Return first non-None value for any of the given keys."""
    for k in keys:
        v = d.get(k)
        if v is not None and v != "":
            return v
    return default


def map_china_car(data: dict) -> dict | None:
    """
    Map a raw che168 API item to our Car schema.

    Field names are flexible — we try multiple variants because the actual
    API response shape is confirmed at runtime (see `dump` mode).
    """
    try:
        car_id = str(_first(data, "carid", "carId", "CarId", "id") or "")
        if not car_id:
            return None

        brand_cn  = _first(data, "brandName", "BrandName", "brand", "Brand", default="")
        model_raw = _first(data, "seriesName", "SeriesName", "series", "model", default="")
        badge     = _first(data, "specName", "SpecName", "trimName", "spec", "Spec")
        fuel_cn   = _first(data, "fuelType", "FuelType", "fuel", "Fuel", default="")
        fuel      = translate_fuel(str(fuel_cn)) if fuel_cn else None

        # Year/month: "202203" or "2022"
        raw_year = str(_first(data, "registerDate", "RegisterDate", "year", "Year", default=""))
        year  = int(raw_year[:4]) if len(raw_year) >= 4 else None
        month = int(raw_year[4:6]) if len(raw_year) >= 6 else None

        # Mileage: might be int km, or "2.5万公里" string
        raw_mileage = _first(data, "mileage", "Mileage", "licenseMileage", "LicenseMileage")
        mileage = None
        if raw_mileage is not None:
            s = str(raw_mileage).replace(",", "").strip()
            if "万" in s:
                mileage = int(float(s.replace("万公里", "").replace("万", "")) * 10_000)
            else:
                mileage = int(float(s.replace("公里", "").replace("km", ""))) if s else None

        # Price in 万元 (10,000 CNY)
        price_wan = _first(data, "price", "Price", "salePrice", "SalePrice")
        price_cny = float(price_wan) * 10_000 if price_wan else None

        # Engine
        cc_raw = _first(data, "displacement", "Displacement", "cc", "engineVolume")
        cc = int(float(str(cc_raw).replace("L", "").replace("l", "")) * 1000) if cc_raw else None
        # Some APIs report displacement as liters (e.g. "1.6"), correct to cc
        if cc and cc < 100:
            cc = int(cc * 1000)

        hp_raw = _first(data, "power", "Power", "horsepower", "Horsepower", "hp", "Hp")
        hp = int(hp_raw) if hp_raw else None

        # Photos
        raw_photos = _first(data, "images", "Images", "photos", "Photos", "imgUrl", "ImgUrl", default=[])
        if isinstance(raw_photos, str):
            raw_photos = [raw_photos]
        photos = [
            (p if p.startswith("http") else f"https:{p}")
            for p in raw_photos if p
        ]
        # Some APIs return a single cover image string
        cover = _first(data, "coverImage", "CoverImage", "mainImage", "MainImage")
        if cover and not photos:
            photos = [cover if cover.startswith("http") else f"https:{cover}"]

        city = _first(data, "city", "City", "cityName", "CityName")

        return {
            "id":                  f"cn_{car_id}",
            "manufacturer":        translate_brand(str(brand_cn)),
            "model":               str(model_raw),
            "badge":               badge,
            "badge_detail":        None,
            "fuel_type":           fuel,
            "year":                year,
            "manufacture_month":   month,
            "mileage":             mileage,
            "price":               price_cny,
            "office_city":         city,
            "green_type":          False,
            "photos":              photos,
            "photo_base":          None,
            "condition":           None,
            "trust":               None,
            "service_mark":        None,
            "buy_type":            None,
            "sell_type":           None,
            "service_copy_car":    None,
            "engine_volume":       cc,
            "horsepower":          hp,
            "segment":             None,
            "total_rub":           None,
            "details_fetched":     False,
            "is_available":        True,
            "country":             "china",
            "accident_cnt":        None,
            "my_accident_cost":    None,
            "other_accident_cost": None,
            "owner_change_cnt":    None,
            "flood_damage":        False,
            "accident_fetched":    False,
            "last_seen_at":        datetime.utcnow(),
            "updated_at":          datetime.utcnow(),
        }
    except Exception as e:
        log.warning(f"map_china_car error: {e} — data={data}")
        return None


# ── Playwright helpers ─────────────────────────────────────────────────────────

async def _make_browser_context(playwright):
    """Launch Chromium with mobile UA (matches m.che168.com)."""
    proxy_cfg = {"server": CHINA_PROXY} if CHINA_PROXY else None
    browser = await playwright.chromium.launch(
        headless=True,
        args=[
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-blink-features=AutomationControlled",
        ],
        proxy=proxy_cfg,
    )
    context = await browser.new_context(
        user_agent=(
            "Mozilla/5.0 (Linux; Android 12; Pixel 6) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Mobile Safari/537.36"
        ),
        viewport={"width": 390, "height": 844},
        locale="zh-CN",
        timezone_id="Asia/Shanghai",
        extra_http_headers={"Accept-Language": "zh-CN,zh;q=0.9"},
    )
    # Mask webdriver flag
    await context.add_init_script(
        "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
    )
    return browser, context


async def _fetch_page(context, page_num: int) -> dict | None:
    """
    Open listing page N in a new browser tab and capture the XHR API response.

    Returns the parsed JSON dict from che168's search API, or None on failure.
    """
    page = await context.new_page()
    # Store (response_object, body_bytes) tuples for all JSON XHRs
    captured_responses: list = []

    async def _on_response(response):
        ct = response.headers.get("content-type", "")
        if "json" in ct and response.status == 200 and CHE168_API_PATTERN in response.url:
            try:
                body = await response.body()
                captured_responses.append((response.url, body))
            except Exception:
                captured_responses.append((response.url, b""))

    page.on("response", _on_response)

    url = f"{CHE168_LIST_BASE}?pagerIndex={page_num}"
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=NAV_TIMEOUT)
        # Wait for initial JS to run
        await page.wait_for_timeout(3000)
        # Scroll down to trigger lazy-loaded car list XHR
        await page.evaluate("window.scrollTo(0, 400)")
        await page.wait_for_timeout(2000)
        await page.evaluate("window.scrollTo(0, 800)")
        await page.wait_for_timeout(EXTRA_WAIT_MS)
    except Exception as e:
        log.warning(f"Page {page_num} navigation error: {e}")
    finally:
        page.remove_listener("response", _on_response)

    if captured_responses:
        log.info(f"Page {page_num}: {len(captured_responses)} JSON XHRs from che168.com:")
        for resp_url, body in captured_responses:
            log.info(f"  [{len(body)}b] {resp_url[:120]}")
            log.info(f"  preview: {body[:200]}")
    else:
        log.warning(f"Page {page_num}: no JSON XHR captured from che168.com")

    result = None
    for resp_url, body in captured_responses:
        try:
            data = json.loads(body)
            if DEBUG_DUMP_DIR:
                Path(DEBUG_DUMP_DIR).mkdir(parents=True, exist_ok=True)
                dump_file = Path(DEBUG_DUMP_DIR) / f"page_{page_num}.json"
                dump_file.write_text(json.dumps(data, ensure_ascii=False, indent=2))
            # Skip non-list responses (user info, search guide, etc.)
            items = _extract_items(data)
            if items:
                result = data
                log.info(f"Page {page_num}: found car list at {resp_url[:80]} ({len(items)} items)")
                break
            rc = data.get("returncode", data.get("code", -1))
            if rc == 0 and ("result" in data or "list" in data):
                result = data
                break
        except Exception as e:
            log.warning(f"Page {page_num}: failed to parse JSON from {resp_url[:60]}: {e}")

    await page.close()
    return result


def _extract_items(data: dict) -> list[dict]:
    """Extract car list from API response regardless of nesting."""
    for path in [
        ["result", "list"],
        ["data", "list"],
        ["result", "searchlist"],
        ["list"],
        ["items"],
        ["data"],
    ]:
        node = data
        for key in path:
            node = node.get(key) if isinstance(node, dict) else None
            if node is None:
                break
        if isinstance(node, list):
            return node
    return []


def _extract_total(data: dict) -> int:
    for path in [
        ["result", "total"],
        ["data", "total"],
        ["result", "count"],
        ["total"],
        ["count"],
    ]:
        node = data
        for key in path:
            node = node.get(key) if isinstance(node, dict) else None
            if node is None:
                break
        if isinstance(node, int) and node > 0:
            return node
    return 0


# ── Checkpoint ─────────────────────────────────────────────────────────────────

def _load_checkpoint() -> dict:
    try:
        return json.loads(Path(CHECKPOINT_PATH).read_text())
    except Exception:
        return {}


def _save_checkpoint(data: dict):
    try:
        Path(CHECKPOINT_PATH).parent.mkdir(parents=True, exist_ok=True)
        Path(CHECKPOINT_PATH).write_text(json.dumps(data, indent=2))
    except Exception as e:
        log.warning(f"Checkpoint save failed: {e}")


# ── Database helpers ───────────────────────────────────────────────────────────

async def upsert_cars(cars_data: list[dict]):
    now  = datetime.utcnow()
    rows = [{**c, "first_seen_at": now} for c in cars_data]
    stmt = pg_insert(Car).values(rows)
    stmt = stmt.on_conflict_do_update(
        index_elements=["id"],
        set_={
            "price":             stmt.excluded.price,
            "mileage":           stmt.excluded.mileage,
            "photos":            stmt.excluded.photos,
            "engine_volume":     stmt.excluded.engine_volume,
            "horsepower":        stmt.excluded.horsepower,
            "manufacture_month": stmt.excluded.manufacture_month,
            "is_available":      True,
            "last_seen_at":      stmt.excluded.last_seen_at,
            "updated_at":        stmt.excluded.updated_at,
        },
    )
    async with SessionLocal() as session:
        await session.execute(stmt)
        await session.commit()
    log.info(f"Upserted {len(rows)} China cars")


async def enrich_segments():
    """Calculate total_rub + segment for China cars that don't have it yet."""
    async with SessionLocal() as session:
        result = await session.execute(
            select(Car).where(
                Car.country == "china",
                Car.details_fetched == False,
                Car.price != None,
                Car.year  != None,
            ).limit(500)
        )
        cars = result.scalars().all()

    if not cars:
        return

    log.info(f"Enriching {len(cars)} China cars...")
    for car in cars:
        seg, total = await calc_total_rub(car.price)
        async with SessionLocal() as s:
            await s.execute(
                update(Car).where(Car.id == car.id).values(
                    segment=seg,
                    total_rub=total,
                    details_fetched=True,
                    updated_at=datetime.utcnow(),
                )
            )
            await s.commit()
    log.info(f"Enriched {len(cars)} China cars")


async def mark_unavailable():
    cutoff = datetime.utcnow() - timedelta(days=30)
    async with SessionLocal() as session:
        result = await session.execute(
            update(Car)
            .where(Car.country == "china", Car.is_available == True, Car.last_seen_at < cutoff)
            .values(is_available=False, updated_at=datetime.utcnow())
        )
        await session.commit()
        log.info(f"Marked {result.rowcount} stale China cars unavailable")


# ── Sync modes ─────────────────────────────────────────────────────────────────

async def run_full_sync():
    log.info("China full sync starting (Playwright)...")
    await init_db()

    cp = _load_checkpoint()
    start_page = cp.get("last_page", 0) + 1
    total_pages = cp.get("total_pages", 0)
    if start_page > 1:
        log.info(f"Resuming from page {start_page} (checkpoint)")

    try:
        from playwright.async_api import async_playwright
    except ImportError:
        log.error("Playwright not installed. Run: pip install playwright && playwright install chromium --with-deps")
        return

    async with async_playwright() as pw:
        browser, context = await _make_browser_context(pw)

        try:
            # Page 1: get total count
            log.info(f"Fetching page {start_page}...")
            first = await _fetch_page(context, start_page)
            if not first:
                log.error(
                    "Failed to capture API response on page 1.\n"
                    "Tips:\n"
                    "  • Check CHE168_API_PATTERN matches the XHR URL in DevTools\n"
                    "  • Set CHINA_DEBUG_DUMP_DIR=/tmp/che168 and inspect raw HTML\n"
                    "  • Set CHINA_PROXY if the server IP is geo-blocked\n"
                    "  • Try: python3 scraper_china.py dump 1"
                )
                return

            if not total_pages:
                total = _extract_total(first)
                total_pages = max(1, (total + PAGE_SIZE - 1) // PAGE_SIZE)
                log.info(f"Total China cars: {total} → {total_pages} pages")
                _save_checkpoint({"last_page": 0, "total_pages": total_pages})

            items = _extract_items(first)
            log.info(f"Page {start_page}: {len(items)} items")
            if items:
                mapped = [m for item in items if (m := map_china_car(item))]
                if mapped:
                    await upsert_cars(mapped)

            _save_checkpoint({"last_page": start_page, "total_pages": total_pages})

            for page_num in range(start_page + 1, total_pages + 1):
                data = await _fetch_page(context, page_num)
                if not data:
                    log.warning(f"Page {page_num}: no response captured, skipping")
                    continue

                items = _extract_items(data)
                if not items:
                    log.info(f"Page {page_num}: empty — assuming end of results")
                    break

                mapped = [m for item in items if (m := map_china_car(item))]
                if mapped:
                    await upsert_cars(mapped)

                _save_checkpoint({"last_page": page_num, "total_pages": total_pages})

                if page_num % 50 == 0:
                    log.info(f"Progress: {page_num}/{total_pages} pages")

        finally:
            await browser.close()

    await mark_unavailable()
    await enrich_segments()
    # Clear checkpoint on successful completion
    _save_checkpoint({})
    log.info("China full sync complete")


async def run_incremental_sync():
    """Fetch the N most recent pages only."""
    log.info(f"China incremental sync starting ({INCREMENTAL_PAGES} pages)...")

    try:
        from playwright.async_api import async_playwright
    except ImportError:
        log.error("Playwright not installed. Run: pip install playwright && playwright install chromium --with-deps")
        return

    async with async_playwright() as pw:
        browser, context = await _make_browser_context(pw)
        try:
            for page_num in range(1, INCREMENTAL_PAGES + 1):
                data = await _fetch_page(context, page_num)
                if not data:
                    log.warning(f"Incremental page {page_num}: no response, stopping")
                    break

                items = _extract_items(data)
                if not items:
                    log.info(f"Incremental page {page_num}: empty, done")
                    break

                mapped = [m for item in items if (m := map_china_car(item))]
                if mapped:
                    await upsert_cars(mapped)
        finally:
            await browser.close()

    await enrich_segments()
    log.info("China incremental sync complete")


async def run_connectivity_test():
    """
    Quick test: can we reach Chinese car sites from this server?
    Prints HTTP status codes and page titles for several sources.
    """
    import httpx

    test_urls = [
        ("che168 main",     "https://m.che168.com/china/list/"),
        ("che168 API",      "https://api2scsou.che168.com/api/v11/search?pagerIndex=1"),
        ("autohome used",   "https://www.autohome.com.cn/used/"),
        ("dongchedi",       "https://www.dongchedi.com/usedcar/list"),
        ("guazi",           "https://www.guazi.com/www/buy/"),
    ]

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Linux; Android 12; Pixel 6) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Mobile Safari/537.36"
        ),
        "Accept-Language": "zh-CN,zh;q=0.9",
    }

    print("=== Connectivity Test ===")
    async with httpx.AsyncClient(timeout=15, follow_redirects=True, headers=headers) as client:
        for label, url in test_urls:
            try:
                r = await client.get(url)
                # Extract title
                import re
                m = re.search(r'<title[^>]*>([^<]{1,80})', r.text, re.I)
                title = m.group(1).strip() if m else "(no title)"
                content_len = len(r.content)
                print(f"  [{r.status_code}] {label}: {title[:60]} ({content_len} bytes)")
            except Exception as e:
                print(f"  [ERR] {label}: {e}")
    print("=== End Connectivity Test ===")


async def run_dump(page_num: int):
    """
    Fetch one page and print the raw API response to stdout.
    Use this to inspect field names and response structure:
      python3 scraper_china.py dump 1
    """
    # First do a quick connectivity check
    await run_connectivity_test()
    print("", file=sys.stderr)

    try:
        from playwright.async_api import async_playwright
    except ImportError:
        print("Playwright not installed. Run: pip install playwright && playwright install chromium --with-deps")
        return

    async with async_playwright() as pw:
        browser, context = await _make_browser_context(pw)
        try:
            # Take screenshot of what browser sees before waiting for XHR
            diag_page = await context.new_page()
            url = f"{CHE168_LIST_BASE}?pagerIndex={page_num}"
            log.info(f"Navigating to {url} for screenshot...")
            try:
                await diag_page.goto(url, wait_until="domcontentloaded", timeout=60_000)
                await diag_page.wait_for_timeout(4000)
                await diag_page.evaluate("window.scrollTo(0, 400)")
                await diag_page.wait_for_timeout(3000)
                title = await diag_page.title()
                current_url = diag_page.url
                log.info(f"Page title: {title!r}, URL: {current_url}")
                screenshot_path = "/tmp/che168_screenshot.png"
                await diag_page.screenshot(path=screenshot_path, full_page=True)
                log.info(f"Screenshot saved to {screenshot_path}")
                html = await diag_page.content()
                html_path = "/tmp/che168_page.html"
                Path(html_path).write_text(html, encoding="utf-8")
                log.info(f"Full HTML saved to {html_path} ({len(html)} chars)")
                print(f"\n--- Page HTML (first 3000 chars) ---\n{html[:3000]}\n---", file=sys.stderr)
            except Exception as e:
                log.warning(f"Screenshot navigation error: {e}")
            finally:
                await diag_page.close()

            data = await _fetch_page(context, page_num)
            if data:
                print(json.dumps(data, ensure_ascii=False, indent=2))
                items = _extract_items(data)
                print(f"\n--- Extracted {len(items)} items ---", file=sys.stderr)
                if items:
                    print(f"First item keys: {list(items[0].keys())}", file=sys.stderr)
                    mapped = map_china_car(items[0])
                    print(f"Mapped: {json.dumps(mapped, ensure_ascii=False, default=str, indent=2)}", file=sys.stderr)
            else:
                print("ERROR: No API response captured.", file=sys.stderr)
                print(
                    "The page loaded but no XHR was intercepted.\n"
                    "Check connectivity test output above for geo-block status.",
                    file=sys.stderr,
                )
        finally:
            await browser.close()


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "incremental"
    if mode == "full":
        asyncio.run(run_full_sync())
    elif mode == "dump":
        page_num = int(sys.argv[2]) if len(sys.argv) > 2 else 1
        asyncio.run(run_dump(page_num))
    else:
        asyncio.run(run_incremental_sync())
