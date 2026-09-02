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
        # che168 v11/search uses 'infoid' as car ID
        car_id = str(_first(data, "infoid", "carid", "carId", "CarId", "id") or "")
        if not car_id:
            return None

        # Brand: pbname (brand name), carname (full name like "宝马 3系 2022款 330i")
        brand_cn  = _first(data, "pbname", "brandName", "BrandName", "brand", "Brand", default="")
        # Series/model name: syname (series), cname, seriesName
        model_raw = _first(data, "syname", "cname", "seriesName", "SeriesName", "series", "model", default="")
        # Spec/trim: sname
        badge     = _first(data, "sname", "specName", "SpecName", "trimName", "spec", "Spec")

        # Fuel type
        fuel_cn   = _first(data, "fueltype", "fuelType", "FuelType", "fuel", "Fuel", default="")
        fuel      = translate_fuel(str(fuel_cn)) if fuel_cn else None

        # Year/month: registeryear (int), or "202203" string
        raw_year = str(_first(data, "registeryear", "registerDate", "RegisterDate", "year", "Year", default=""))
        year  = int(raw_year[:4]) if len(raw_year) >= 4 and raw_year[:4].isdigit() else None
        month = int(raw_year[4:6]) if len(raw_year) >= 6 and raw_year[4:6].isdigit() else None

        # Mileage: might be int km, or "2.5万公里" string, or "2.5" (万km)
        raw_mileage = _first(data, "mileage", "Mileage", "licenseMileage", "LicenseMileage")
        mileage = None
        if raw_mileage is not None:
            s = str(raw_mileage).replace(",", "").strip()
            try:
                if "万" in s:
                    mileage = int(float(s.replace("万公里", "").replace("万", "")) * 10_000)
                elif s.replace(".", "").isdigit():
                    v = float(s)
                    # che168 reports mileage in 万km (e.g. 3.2 = 32000 km)
                    mileage = int(v * 10_000) if v < 200 else int(v)
                else:
                    mileage = int(float(s.replace("公里", "").replace("km", "")))
            except ValueError:
                pass

        # Price: price (万元), newprice, nowprice
        price_wan = _first(data, "price", "newprice", "nowprice", "Price", "salePrice", "SalePrice")
        price_cny = None
        if price_wan is not None:
            try:
                v = float(str(price_wan).replace("万", "").replace(",", ""))
                price_cny = v * 10_000 if v < 5000 else v  # already in CNY if > 5000
            except ValueError:
                pass

        # Engine
        cc_raw = _first(data, "displacement", "Displacement", "cc", "engineVolume", "engine")
        cc = None
        if cc_raw:
            try:
                s = str(cc_raw).replace("L", "").replace("l", "").strip()
                v = float(s)
                cc = int(v * 1000) if v < 20 else int(v)  # <20 means liters
            except ValueError:
                pass

        hp_raw = _first(data, "power", "Power", "horsepower", "Horsepower", "hp", "Hp")
        hp = int(hp_raw) if hp_raw else None

        # Photos: imglist (list), img (single), mainpicurl
        raw_photos = _first(data, "imglist", "images", "Images", "photos", "Photos", default=[])
        if isinstance(raw_photos, str):
            raw_photos = [raw_photos]
        photos = [
            (p if p.startswith("http") else f"https:{p}")
            for p in (raw_photos or []) if p
        ]
        cover = _first(data, "img", "mainpicurl", "coverImage", "CoverImage", "mainImage", "MainImage", "imgUrl")
        if cover and not photos:
            photos = [cover if cover.startswith("http") else f"https:{cover}"]

        # City: cityname (string) or cityid (int)
        city = _first(data, "cityname", "city", "City", "cityName", "CityName")
        if not city:
            city_id = _first(data, "cityid", "cityId")
            city = str(city_id) if city_id else None

        # If brand or model still empty, try to parse from carname
        # carname example: "宝马 3系 2022款 330i M运动套装"
        if not brand_cn or not model_raw:
            carname = _first(data, "carname", "CarName", default="")
            if carname:
                parts = str(carname).split()
                if not brand_cn and parts:
                    brand_cn = parts[0]
                if not model_raw and len(parts) > 1:
                    model_raw = parts[1]

        manufacturer = translate_brand(str(brand_cn)) if brand_cn else "Unknown"
        model_str = str(model_raw) if model_raw else ""

        return {
            "id":                  f"cn_{car_id}",
            "manufacturer":        manufacturer,
            "model":               model_str,
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


CHE168_DIRECT_API = "https://api2scsou.che168.com/api/v11/search"
_DIRECT_API_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Linux; Android 12; Pixel 6) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Mobile Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9",
    "Referer": "https://m.che168.com/",
    "Origin": "https://m.che168.com",
}


async def _fetch_page_direct(page_num: int) -> list[dict]:
    """Try fetching car list via direct httpx call to the API."""
    import httpx
    params = {
        "pagerIndex": page_num,
        "pagerSize": PAGE_SIZE,
        "pvareaid": "20220",
        "frompage": "5",
    }
    try:
        async with httpx.AsyncClient(timeout=20, headers=_DIRECT_API_HEADERS) as client:
            r = await client.get(CHE168_DIRECT_API, params=params)
            log.info(f"Direct API page {page_num}: HTTP {r.status_code} {len(r.content)}b")
            if r.status_code != 200:
                return []
            data = r.json()
            rc = data.get("returncode", -1)
            if rc != 0:
                log.warning(f"Direct API page {page_num}: returncode={rc} msg={data.get('message','')}")
                return []
            items = _extract_items(data)
            log.info(f"Direct API page {page_num}: {len(items)} items")
            return [m for item in items if (m := map_china_car(item))]
    except Exception as e:
        log.warning(f"Direct API page {page_num} error: {e}")
        return []


async def _establish_session(context) -> "playwright.async_api.Page":
    """
    Open m.che168.com once to set cookies, dismiss overseas popup, then keep
    the tab open.  Returns the Page so callers can reuse it for JS fetches.
    """
    from playwright.async_api import Page
    page: Page = await context.new_page()
    try:
        await page.goto(CHE168_LIST_BASE, wait_until="domcontentloaded", timeout=NAV_TIMEOUT)
    except Exception as e:
        log.warning(f"Session page nav timeout (continuing): {e}")

    await page.wait_for_timeout(3000)

    # Dismiss overseas popup
    try:
        for sel in ["text=Continue to Chinese Site", "text=继续访问中国站"]:
            btn = await page.query_selector(sel)
            if btn:
                await btn.click()
                log.info("Session: dismissed overseas popup")
                await page.wait_for_timeout(1500)
                break
    except Exception:
        pass

    await page.wait_for_timeout(3000)   # Let cookies settle
    return page


async def _fetch_page_via_intercept(page, page_num: int, api_url_template: list) -> list[dict]:
    """
    Fetch page N from che168.

    - page_num == 1: navigate to the listing URL, intercept the XHR response,
      and store the request URL in api_url_template[0] for reuse.
    - page_num > 1: reuse api_url_template[0] by replacing pageindex= param,
      then fetch it via page.evaluate(fetch(...)) — avoids full page reload.

    The mobile SPA ignores ?pageindex=N in the page URL and always loads p.1;
    subsequent pages must be fetched directly through the API URL the app used.
    """
    import re as _re

    result: list[dict] = []

    def _parse_items(raw_bytes: bytes, page_num: int) -> list[dict]:
        data = json.loads(raw_bytes)
        rc = data.get("returncode", -1)
        if rc != 0:
            log.warning(f"Page {page_num}: API returncode={rc} msg={data.get('message','')}")
            return []
        result_obj = data.get("result", {})
        items = _extract_items(data)
        total = result_obj.get("totalcount", "?")
        actual_page = result_obj.get("pageindex", "?")
        if items:
            log.info(f"Page {page_num}: pageindex={actual_page} → {len(items)} items (total={total})")
        else:
            log.warning(f"Page {page_num}: 0 items, result keys={list(result_obj.keys())}, total={total}")
            try:
                Path("/tmp/che168_raw_response.json").write_bytes(raw_bytes)
            except Exception:
                pass
        return [m for item in items if (m := map_china_car(item))]

    # ── Page 1: navigate + intercept ────────────────────────────────────────────
    if page_num == 1 or not api_url_template:
        api_done = asyncio.Event()
        captured_req_url: list[str] = []
        captured_body: list[bytes] = []

        async def handle_response(response):
            if "api/v11/search" in response.url and not api_done.is_set():
                captured_req_url.append(response.url)
                try:
                    body = await response.body()
                    captured_body.append(body)
                except Exception as e:
                    log.warning(f"Page 1: body read error: {e}")
                finally:
                    api_done.set()

        page.on("response", handle_response)
        try:
            nav_url = f"{CHE168_LIST_BASE}?pageindex=1"
            try:
                await page.goto(nav_url, wait_until="domcontentloaded", timeout=NAV_TIMEOUT)
            except Exception as e:
                log.warning(f"Page 1: nav timeout (continuing): {e}")
            try:
                await asyncio.wait_for(api_done.wait(), timeout=15.0)
            except asyncio.TimeoutError:
                log.warning("Page 1: XHR not intercepted within 15s")
        finally:
            page.remove_listener("response", handle_response)

        if captured_req_url:
            api_url_template.append(captured_req_url[0])
            log.info(f"Captured API URL template: {captured_req_url[0][:120]}")
        if captured_body:
            result = _parse_items(captured_body[0], 1)

        # If page_num was 1 but we were called for a later page (shouldn't happen),
        # just return what we got for page 1.
        return result

    # ── Page 2+: replace pageindex in captured URL, fetch via JS ────────────────
    base_url = api_url_template[0]
    # Replace pageindex=<digits> with the target page number
    api_url = _re.sub(r'pageindex=\d+', f'pageindex={page_num}', base_url)
    if api_url == base_url:
        # pageindex param wasn't found — append it
        sep = "&" if "?" in api_url else "?"
        api_url = f"{api_url}{sep}pageindex={page_num}"

    try:
        raw = await page.evaluate(
            """(url) => fetch(url, {credentials: 'include'})
                         .then(r => r.arrayBuffer())
                         .then(b => Array.from(new Uint8Array(b)))""",
            api_url,
        )
        body_bytes = bytes(raw)
        result = _parse_items(body_bytes, page_num)
    except Exception as e:
        log.warning(f"Page {page_num}: JS fetch error: {e}")

    return result


async def _fetch_page(context, page_num: int) -> list[dict]:
    """Single-page fetch (used only by run_dump). Normal sync uses _run_pages."""
    page = await context.new_page()
    api_url_template: list[str] = []
    try:
        if page_num > 1:
            await _fetch_page_via_intercept(page, 1, api_url_template)
        return await _fetch_page_via_intercept(page, page_num, api_url_template)
    finally:
        await page.close()


def parse_html_cars(html: str) -> list[dict]:
    """
    Parse car listings from che168 mobile HTML (React Native Web / SSR).

    Each car card is a div.r-1loqt21 containing text like:
      "Brand Model YEAR年 / X.X万公里 / City ... PRICE 万 ..."
    """
    from bs4 import BeautifulSoup
    import re as _re
    import hashlib

    soup = BeautifulSoup(html, "html.parser")
    cards = soup.find_all("div", class_="r-1loqt21")

    result = []
    seen = set()
    for card in cards:
        text = " ".join(card.get_text(" ", strip=True).split())
        # Must contain year and mileage pattern
        m = _re.match(
            r"^(.+?) (\d{4})年 / (\d+\.?\d*)万公里 / (\S+)",
            text,
        )
        if not m:
            continue
        full_name, year_str, mileage_wan, city = m.groups()
        # Price is the last "NUMBER 万" before any "首付" or end
        price_text = text[m.end():]
        pm = _re.search(r"(\d+\.?\d*)\s*万", price_text)
        if not pm:
            continue
        price_wan = float(pm.group(1))

        # Deduplicate by (name, year, price)
        key = (full_name, year_str, price_wan)
        if key in seen:
            continue
        seen.add(key)

        # Extract first photo
        imgs = card.find_all("img")
        photos = []
        for img in imgs:
            src = img.get("src", "")
            if src and "autoimg.cn" in src and "escimg" in src:
                if not src.startswith("http"):
                    src = f"https:{src}"
                photos.append(src)
                break

        # Stable ID from name+year+price hash
        raw_id = hashlib.md5(f"{full_name}_{year_str}_{price_wan}_{city}".encode()).hexdigest()[:12]

        result.append({
            "_full_name": full_name,
            "_year": year_str,
            "_mileage_wan": mileage_wan,
            "_city": city,
            "_price_wan": price_wan,
            "_photos": photos,
            "_id": raw_id,
        })

    return result


def map_china_car_html(raw: dict) -> dict | None:
    """Map a parsed HTML car dict to our Car schema."""
    try:
        full_name = raw["_full_name"]
        year = int(raw["_year"])
        mileage = int(float(raw["_mileage_wan"]) * 10_000)
        city = raw["_city"]
        price_cny = raw["_price_wan"] * 10_000

        # Separate brand from model using _BRAND_MAP
        brand_en = None
        brand_len = 0
        for cn, en in _BRAND_MAP.items():
            if full_name.startswith(cn) and len(cn) > brand_len:
                brand_en = en
                brand_len = len(cn)
        model = full_name[brand_len:].strip() if brand_en else full_name

        if not brand_en:
            brand_en = full_name.split()[0] if full_name else "Unknown"

        now = datetime.utcnow()
        return {
            "id":                  f"cn_{raw['_id']}",
            "manufacturer":        brand_en,
            "model":               model,
            "badge":               None,
            "badge_detail":        None,
            "fuel_type":           None,
            "year":                year,
            "manufacture_month":   None,
            "mileage":             mileage,
            "price":               price_cny,
            "office_city":         city,
            "green_type":          False,
            "photos":              raw["_photos"],
            "photo_base":          None,
            "condition":           None,
            "trust":               None,
            "service_mark":        None,
            "buy_type":            None,
            "sell_type":           None,
            "service_copy_car":    None,
            "engine_volume":       None,
            "horsepower":          None,
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
            "last_seen_at":        now,
            "updated_at":          now,
        }
    except Exception as e:
        log.warning(f"map_china_car_html error: {e} — raw={raw}")
        return None


def _extract_items(data: dict) -> list[dict]:
    """Extract car list from API response regardless of nesting."""
    for path in [
        ["result", "list"],
        ["result", "searchlist"],
        ["result", "carlist"],
        ["result", "data"],
        ["data", "list"],
        ["list"],
        ["items"],
        ["data"],
    ]:
        node = data
        for key in path:
            node = node.get(key) if isinstance(node, dict) else None
            if node is None:
                break
        if isinstance(node, list) and node:
            return node

    # Fallback: scan all list-typed values at result/data level
    for top_key in ("result", "data"):
        top = data.get(top_key)
        if isinstance(top, dict):
            for k, v in top.items():
                if isinstance(v, list) and v and isinstance(v[0], dict):
                    log.debug(f"_extract_items: found list at {top_key}.{k} ({len(v)} items)")
                    return v
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


# ── Output: JSON file or DB ────────────────────────────────────────────────────

OUTPUT_JSON = os.getenv("CHINA_OUTPUT_JSON", "")  # if set, save to file instead of DB

_json_buffer: list[dict] = []

async def _save_cars(mapped: list[dict]):
    """Save cars to JSON buffer or directly to DB."""
    if OUTPUT_JSON:
        _json_buffer.extend(mapped)
        log.info(f"Buffered {len(mapped)} cars (total {len(_json_buffer)})")
    else:
        await upsert_cars(mapped)


def _flush_json():
    """Write buffered cars to OUTPUT_JSON file."""
    if not OUTPUT_JSON:
        return
    log.info(f"Flushing {len(_json_buffer)} cars to {OUTPUT_JSON}")
    Path(OUTPUT_JSON).write_text(
        json.dumps(_json_buffer, ensure_ascii=False, default=str, indent=2),
        encoding="utf-8",
    )
    log.info(f"Saved {len(_json_buffer)} cars to {OUTPUT_JSON}")


# ── Sync modes ─────────────────────────────────────────────────────────────────

async def _run_pages(context, start_page: int, end_page: int, label: str = ""):
    """
    Fetch pages start_page..end_page.

    Strategy:
      1. Navigate to page 1, intercept the XHR response, capture the API URL.
      2. For pages 2+, replay the API URL via page.evaluate(fetch()) with
         incremented pageindex — no full page reload needed, much faster.
    """
    page = await context.new_page()
    log.info(f"{label}Starting page loop {start_page}–{end_page} via XHR intercept")

    # api_url_template[0] will hold the first-page API URL (populated by page 1 fetch)
    api_url_template: list[str] = []

    # If start_page > 1 we still need to load page 1 first to capture the URL
    actual_start = start_page
    if start_page > 1:
        log.info(f"{label}start_page={start_page}: loading page 1 first to capture API URL")
        await _fetch_page_via_intercept(page, 1, api_url_template)
        # Don't save these — they belong to page 1, not our range

    done = 0
    consecutive_empty = 0
    try:
        for page_num in range(actual_start, end_page + 1):
            cars = await _fetch_page_via_intercept(page, page_num, api_url_template)
            if not cars:
                consecutive_empty += 1
                if consecutive_empty >= 5:
                    log.info(f"{label}5 consecutive empty pages at {page_num} — stopping")
                    break
                continue
            consecutive_empty = 0
            await _save_cars(cars)
            done += 1
            if page_num % 10 == 0:
                log.info(f"{label}Progress: page {page_num}, buffered {len(_json_buffer)} cars")
            await asyncio.sleep(0.3)   # polite delay
    finally:
        await page.close()

    return done


async def run_full_sync():
    log.info("China full sync starting (HTML parse)...")
    if not OUTPUT_JSON:
        await init_db()

    cp = _load_checkpoint()
    start_page = cp.get("last_page", 0) + 1
    if start_page > 1:
        log.info(f"Resuming from page {start_page} (checkpoint)")

    try:
        from playwright.async_api import async_playwright
    except ImportError:
        log.error("Playwright not installed.")
        return

    async with async_playwright() as pw:
        browser, context = await _make_browser_context(pw)
        try:
            page = await context.new_page()
            page_num = start_page
            consecutive_empty = 0
            try:
                while True:
                    cars = await _fetch_page_via_intercept(page, page_num)
                    if not cars:
                        consecutive_empty += 1
                        if consecutive_empty >= 5:
                            log.info(f"Page {page_num}: 5 consecutive empty — full sync done")
                            break
                        page_num += 1
                        continue
                    consecutive_empty = 0
                    await _save_cars(cars)
                    _save_checkpoint({"last_page": page_num})
                    if page_num % 20 == 0:
                        log.info(f"Full sync progress: {page_num} pages")
                    page_num += 1
                    await asyncio.sleep(0.5)
            finally:
                await page.close()
        finally:
            await browser.close()

    _flush_json()
    if not OUTPUT_JSON:
        await mark_unavailable()
        await enrich_segments()
    _save_checkpoint({})
    log.info("China full sync complete")


async def run_incremental_sync():
    """Fetch the N most recent pages only."""
    log.info(f"China incremental sync starting ({INCREMENTAL_PAGES} pages, HTML parse)...")
    if not OUTPUT_JSON:
        await init_db()

    try:
        from playwright.async_api import async_playwright
    except ImportError:
        log.error("Playwright not installed.")
        return

    async with async_playwright() as pw:
        browser, context = await _make_browser_context(pw)
        try:
            await _run_pages(context, 1, INCREMENTAL_PAGES, "Incremental ")
        finally:
            await browser.close()

    _flush_json()
    if not OUTPUT_JSON:
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
            # Diagnostic: log ALL network requests to find where car data comes from
            diag_page = await context.new_page()
            all_requests: list[str] = []
            all_responses: list[tuple] = []  # (status, url, content_type, size)

            async def _diag_response(response):
                ct = response.headers.get("content-type", "")
                try:
                    body = await response.body()
                    size = len(body)
                    # Log non-image, non-font responses
                    if not any(x in ct for x in ["image", "font", "css"]):
                        all_responses.append((response.status, response.url, ct, size, body[:300]))
                except Exception:
                    all_responses.append((response.status, response.url, ct, 0, b""))

            diag_page.on("response", _diag_response)

            url = f"{CHE168_LIST_BASE}?pageindex={page_num}"
            log.info(f"Navigating to {url} for full diagnostic...")
            try:
                await diag_page.goto(url, wait_until="domcontentloaded", timeout=60_000)
                await diag_page.wait_for_timeout(3000)
                await diag_page.evaluate("window.scrollTo(0, 400)")
                await diag_page.wait_for_timeout(3000)
                title = await diag_page.title()
                current_url = diag_page.url
                log.info(f"Page title: {title!r}, redirected to: {current_url}")

                screenshot_path = "/tmp/che168_screenshot.png"
                await diag_page.screenshot(path=screenshot_path, full_page=True)
                log.info(f"Screenshot saved to {screenshot_path}")

                html = await diag_page.content()
                html_path = "/tmp/che168_page.html"
                Path(html_path).write_text(html, encoding="utf-8")
                log.info(f"Full HTML saved to {html_path} ({len(html)} chars)")

                # Print ALL non-asset responses
                log.info(f"=== All non-asset network responses ({len(all_responses)}) ===")
                for status, resp_url, ct, size, preview in all_responses:
                    log.info(f"  [{status}] [{size}b] {resp_url[:100]}")
                    if size > 0 and ("json" in ct or size < 5000):
                        log.info(f"    preview: {preview[:150]}")

                # Also check if HTML contains car data (search for price patterns)
                import re as _re
                prices = _re.findall(r'"price"[:\s]*[\d.]+', html[:50000])
                car_ids = _re.findall(r'"carid"[:\s]*[\d]+', html[:50000])
                log.info(f"HTML contains 'price' fields: {len(prices)}, 'carid' fields: {len(car_ids)}")
                if car_ids:
                    log.info(f"Sample carid matches: {car_ids[:5]}")

            except Exception as e:
                log.warning(f"Diagnostic navigation error: {e}")
            finally:
                diag_page.remove_listener("response", _diag_response)
                await diag_page.close()

            # Also show raw API item fields to debug field name mapping
            raw_items_holder: list[dict] = []

            async def _raw_capture(response):
                if "api/v11/search" in response.url and not raw_items_holder:
                    try:
                        body = await response.body()
                        data = json.loads(body)
                        if data.get("returncode") == 0:
                            result_obj = data.get("result", data.get("data", {}))
                            # Find ANY list in the response, regardless of key
                            for k, v in result_obj.items() if isinstance(result_obj, dict) else []:
                                if isinstance(v, list) and v:
                                    raw_items_holder.extend(v[:3])
                                    log.warning(f"RAW CAPTURE: found list at result.{k!r} with {len(v)} items")
                                    break
                            if not raw_items_holder:
                                # Just log the result keys and first 500 chars
                                log.warning(f"RAW CAPTURE: result keys = {list(result_obj.keys()) if isinstance(result_obj, dict) else type(result_obj)}")
                                Path("/tmp/che168_raw_response.json").write_bytes(body)
                    except Exception as e:
                        log.warning(f"RAW CAPTURE error: {e}")

            diag_page2 = await context.new_page()
            diag_page2.on("response", _raw_capture)
            try:
                await diag_page2.goto(f"{CHE168_LIST_BASE}?pageindex={page_num}", wait_until="domcontentloaded", timeout=60_000)
                await asyncio.sleep(5)
            except Exception:
                pass
            finally:
                diag_page2.remove_listener("response", _raw_capture)
                await diag_page2.close()

            if raw_items_holder:
                print(f"\n=== RAW API ITEM FIELDS (first item) ===", file=sys.stderr)
                print(json.dumps(raw_items_holder[0], ensure_ascii=False, default=str, indent=2), file=sys.stderr)

            cars_mapped = await _fetch_page(context, page_num)
            print(f"\n--- Extracted {len(cars_mapped)} cars via XHR intercept ---", file=sys.stderr)
            if cars_mapped:
                for i, car in enumerate(cars_mapped[:3]):
                    print(f"Car {i+1}: {json.dumps(car, ensure_ascii=False, default=str, indent=2)}", file=sys.stderr)
            else:
                print("ERROR: No cars extracted.", file=sys.stderr)
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
