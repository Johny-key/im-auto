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

# Mobile listing page — Playwright navigates here; the page internally calls the API.
# Can be overridden per-run to fetch different car subsets (the SPA limits each
# session to ~48 pages / 480 cars; different URLs yield different listings).
_CHINA_LIST_VARIANTS = [
    "https://m.che168.com/china/list/",               # default (most recent)
    "https://m.che168.com/china/list/?sortby=1",       # sort by price ↑
    "https://m.che168.com/china/list/?sortby=2",       # sort by price ↓
    "https://m.che168.com/china/list/?sortby=3",       # sort by mileage ↑
    "https://m.che168.com/china/list/?sortby=4",       # sort by age ↓
]
_LIST_VARIANT_IDX   = int(os.getenv("CHINA_LIST_VARIANT", "0"))
CHE168_LIST_BASE    = _CHINA_LIST_VARIANTS[_LIST_VARIANT_IDX % len(_CHINA_LIST_VARIANTS)]
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
    "保时捷": "Porsche",    "兰博基尼": "Lamborghini", "法拉利": "Ferrari",
    "玛莎拉蒂": "Maserati", "宾利":  "Bentley",       "劳斯莱斯": "Rolls-Royce",
    "迈巴赫": "Maybach",    "阿斯顿马丁": "Aston Martin", "沃尔沃": "Volvo",
    "捷豹":   "Jaguar",     "路虎":  "Land Rover",    "mini":  "MINI",
    "Mini":   "MINI",       "MINI":  "MINI",          "斯巴鲁": "Subaru",
    "马自达": "Mazda",      "三菱":  "Mitsubishi",    "雷克萨斯": "Lexus",
    "英菲尼迪": "Infiniti", "讴歌":  "Acura",
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

        # Brand: pbname (brand name) — if absent, parse from carname first word
        brand_cn  = _first(data, "pbname", "brandName", "BrandName", "brand", "Brand", default="")
        # Series/model name: syname (series name). NOTE: cname = city name, NOT car model — excluded.
        model_raw = _first(data, "syname", "seriesName", "SeriesName", "series", "model", default="")
        # Spec/trim: sname (spec name like "40TFSI 风尚运动型")
        badge     = _first(data, "sname", "specName", "SpecName", "trimName", "spec", "Spec")

        # Fuel type
        fuel_cn = _first(data, "fueltype", "fuelType", "FuelType", "fuel", "Fuel", default="")
        fuel    = translate_fuel(str(fuel_cn)) if fuel_cn else None
        # isnewenergy=1 → electric (new-energy vehicles)
        if not fuel and _first(data, "isnewenergy", default=0):
            fuel = "electric"

        # Year: firstregyear (first registration year, int e.g. 2021)
        raw_year = str(_first(data, "firstregyear", "registeryear", "registerDate", "RegisterDate", "year", "Year", default=""))
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

        # Photos: imageurl (single cover), imglist (list)
        cover = _first(data, "imageurl", "img", "mainpicurl", "coverImage", "CoverImage", "mainImage", "MainImage", "imgUrl")
        raw_photos = _first(data, "imglist", "images", "Images", "photos", "Photos", default=[])
        if isinstance(raw_photos, str):
            raw_photos = [raw_photos]
        photos = [
            (p if p.startswith("http") else f"https:{p}")
            for p in (raw_photos or []) if p
        ]
        if cover and not photos:
            photos = [cover if cover.startswith("http") else f"https:{cover}"]

        # City: cname = city name (e.g. "泰安"), cityid = numeric code
        city = _first(data, "cityname", "cname", "city", "City", "cityName", "CityName")
        if not city:
            city_id = _first(data, "cityid", "cityId")
            city = str(city_id) if city_id else None

        # Parse carname to fill missing brand and/or model.
        # carname format: "BrandSeries CityName Year Spec" e.g. "奥迪A6L 泰安 2019款 40TFSI"
        if not brand_cn or not model_raw:
            carname = _first(data, "carname", "CarName", default="")
            if carname:
                carname_str = str(carname)
                city_name = str(_first(data, "cname", default="") or "")
                # Longest-match against _BRAND_MAP to split brand prefix from series
                matched_brand_cn = ""
                matched_len = 0
                for cn_brand in _BRAND_MAP:
                    if carname_str.startswith(cn_brand) and len(cn_brand) > matched_len:
                        matched_brand_cn = cn_brand
                        matched_len = len(cn_brand)
                if matched_brand_cn:
                    if not brand_cn:
                        brand_cn = matched_brand_cn
                    if not model_raw:
                        # Series name = chars between brand prefix and city name
                        # e.g. "奔驰C级 成都 2017款" → after "奔驰" → "C级 成都 ..."
                        # → stop before city name → "C级"
                        rest = carname_str[matched_len:].strip()
                        if city_name and city_name in rest:
                            rest = rest[:rest.index(city_name)].strip()
                        # Take what's left (should be series name like "C级", "A6L")
                        series = rest.split()[0] if rest else ""
                        if series and not series.endswith("款") and not series.isdigit():
                            model_raw = series
                else:
                    # Unknown brand — whole first word is brand+series merged
                    if not brand_cn:
                        brand_cn = carname_str.split()[0]

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

# Captured at runtime from the first successful XHR — used to replay for pages 2+
_captured_api_url: str | None = None
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


async def _fetch_page_via_context_request(context, page_num: int) -> list[dict]:
    """
    Replay the che168 API call for page N using the browser session cookies.

    context.request runs in Playwright's Node.js layer (not the browser JS
    sandbox), so there are no CORS restrictions and no monitoring-library
    interference.  The URL captured on page 1 already has the correct signed
    params; we just swap pageindex=1 → pageindex=N.
    """
    import re as _re
    global _captured_api_url
    if not _captured_api_url:
        log.warning(f"Page {page_num}: no captured API URL yet — falling back to scroll")
        return []

    # Replace pageindex value in the captured URL
    if _re.search(r'pageindex=\d+', _captured_api_url, _re.IGNORECASE):
        api_url = _re.sub(r'pageindex=\d+', f'pageindex={page_num}', _captured_api_url, flags=_re.IGNORECASE)
    else:
        sep = '&' if '?' in _captured_api_url else '?'
        api_url = f"{_captured_api_url}{sep}pageindex={page_num}"

    try:
        log.info(f"Page {page_num}: context.request.get → {api_url[:120]}")
        resp = await context.request.get(
            api_url,
            headers={
                "Referer": "https://m.che168.com/",
                "Accept": "application/json, text/plain, */*",
            },
        )
        body = await resp.body()
        data = json.loads(body)
        rc = data.get("returncode", -1)
        if rc == 0:
            items = _extract_items(data)
            result_obj = data.get("result", {})
            actual_page = result_obj.get("pageindex", "?")
            total = result_obj.get("totalcount", "?")
            log.info(f"Page {page_num}: pageindex={actual_page} → {len(items)} items (total={total})")
            return [m for item in items if (m := map_china_car(item))]
        else:
            log.warning(f"Page {page_num}: context.request returncode={rc} msg={data.get('message', '')}")
            return []
    except Exception as e:
        log.warning(f"Page {page_num}: context.request error: {e}")
        return []


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


async def _navigate_and_wait_for_xhr(page, label: str = "") -> list[dict]:
    """
    Navigate to the che168 listing page and wait for the first page-1 XHR.
    Uses wait_until="commit" so the call returns as soon as the HTTP response
    starts, without waiting for domcontentloaded (which can take 90 s on GH Actions).
    Returns the mapped cars for page 1.
    """
    global _captured_api_url
    result: list[dict] = []
    api_done = asyncio.Event()

    async def handle_response(response):
        global _captured_api_url
        if "api/v11/search" not in response.url or api_done.is_set():
            return
        if not _captured_api_url:
            _captured_api_url = response.url
            log.info(f"Captured API URL: {response.url[:120]}")
        try:
            body = await response.body()
            data = json.loads(body)
            rc = data.get("returncode", -1)
            if rc == 0:
                result_obj = data.get("result", {})
                items = _extract_items(data)
                total = result_obj.get("totalcount", "?")
                actual_page = result_obj.get("pageindex", "?")
                log.info(f"{label}Page 1: pageindex={actual_page} → {len(items)} items (total={total})")
                if not items:
                    try:
                        Path("/tmp/che168_raw_response.json").write_bytes(body)
                    except Exception:
                        pass
                result.extend([m for item in items if (m := map_china_car(item))])
            else:
                log.warning(f"{label}Page 1: API returncode={rc} msg={data.get('message','')}")
        except Exception as e:
            log.warning(f"{label}Page 1: parse error: {e}")
        finally:
            api_done.set()

    page.on("response", handle_response)
    try:
        try:
            # commit = return as soon as HTTP response starts (before DOM loads)
            await page.goto(CHE168_LIST_BASE, wait_until="commit", timeout=NAV_TIMEOUT)
            log.info(f"{label}HTTP response received, waiting for XHR (up to 90 s)...")
        except Exception as e:
            log.warning(f"{label}Nav error: {e}")

        # Page loads slowly in China; give it 90 s for the XHR to fire
        try:
            await asyncio.wait_for(api_done.wait(), timeout=90.0)
        except asyncio.TimeoutError:
            log.warning(f"{label}Page 1 XHR not intercepted in 90 s")
    finally:
        page.remove_listener("response", handle_response)

    return result


async def _scroll_to_trigger_next_page(page, received: asyncio.Queue, label: str = "") -> bool:
    """
    Try multiple scroll methods to trigger the SPA's infinite-scroll XHR.
    Returns True if a new XHR appeared in `received` within the timeout.
    """
    # Method 1: hard-scroll all overflow containers + document
    await page.evaluate("""() => {
        Array.from(document.querySelectorAll('*')).forEach(el => {
            try {
                const ov = getComputedStyle(el).overflowY;
                if ((ov === 'auto' || ov === 'scroll') && el.scrollHeight > el.clientHeight + 50) {
                    el.scrollTop = el.scrollHeight;
                }
            } catch(e) {}
        });
        window.scrollTo(0, document.body.scrollHeight);
        document.documentElement.scrollTop = document.documentElement.scrollHeight;
    }""")
    await page.wait_for_timeout(400)
    if not received.empty():
        return True

    # Method 2: incremental scroll (moves IntersectionObserver sentinel into view step-by-step)
    total_h = await page.evaluate(
        "Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, 2000)"
    )
    pos = 0
    while pos < total_h:
        if not received.empty():
            return True
        pos = min(pos + 300, total_h)
        await page.evaluate(f"""() => {{
            window.scrollTo(0, {pos});
            Array.from(document.querySelectorAll('*')).forEach(el => {{
                try {{
                    const ov = getComputedStyle(el).overflowY;
                    if ((ov === 'auto' || ov === 'scroll') && el.scrollHeight > el.clientHeight + 50) {{
                        el.scrollTop = el.scrollHeight * ({pos} / {total_h});
                    }}
                }} catch(e) {{}}
            }});
        }}""")
        await page.wait_for_timeout(100)

    if not received.empty():
        return True

    # Method 3: simulate mouse wheel (some SPAs use onwheel handler, not IntersectionObserver)
    await page.mouse.move(200, 400)
    for _ in range(30):
        if not received.empty():
            return True
        await page.mouse.wheel(0, 600)
        await page.wait_for_timeout(80)

    if not received.empty():
        return True

    # Method 4: End key
    await page.keyboard.press("End")
    await page.wait_for_timeout(800)
    return not received.empty()


async def _fetch_page(context, page_num: int) -> list[dict]:
    """Single-page fetch (used only by run_dump). Normal sync uses _run_pages."""
    page = await context.new_page()
    try:
        cars_p1 = await _navigate_and_wait_for_xhr(page, label="Dump ")
        if page_num == 1:
            return cars_p1
        # For pages 2+: try scrolling (dump only, not used in incremental)
        received: asyncio.Queue = asyncio.Queue()
        async def _capture(response):
            if "api/v11/search" in response.url:
                try:
                    body = await response.body()
                    data = json.loads(body)
                    if data.get("returncode") == 0:
                        items = _extract_items(data)
                        cars = [m for item in items if (m := map_china_car(item))]
                        await received.put(cars)
                except Exception:
                    pass
        page.on("response", _capture)
        try:
            for attempt in range(page_num - 1):
                await page.wait_for_timeout(3000)
                await _scroll_to_trigger_next_page(page, received, label=f"Dump p{attempt+2} ")
                try:
                    cars = await asyncio.wait_for(received.get(), timeout=20.0)
                    if attempt == page_num - 2:
                        return cars
                except asyncio.TimeoutError:
                    log.warning(f"Dump: page {attempt+2} XHR timeout")
                    break
        finally:
            page.remove_listener("response", _capture)
        return []
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
    Fetch pages start_page..end_page in a single browser tab using infinite-scroll interception.

    Strategy:
      1. Navigate to the listing page, wait up to 90 s for the XHR (page 1 data).
      2. After XHR fires, wait 5 s for React to render the list items.
      3. Trigger the SPA's IntersectionObserver by scrolling: DOM-scroll all
         overflow containers, incremental window.scrollTo, mouse wheel, End key.
      4. The SPA issues an XHR for the next page automatically — capture it.
      5. Repeat until end_page or 3 consecutive timeouts.
    """
    page = await context.new_page()
    log.info(f"{label}Starting page loop {start_page}–{end_page} (single scroll session)")

    # Shared queue: each resolved XHR puts (api_page, cars) here
    received: asyncio.Queue = asyncio.Queue()

    async def handle_response(response):
        global _captured_api_url
        if "api/v11/search" not in response.url:
            return
        try:
            body = await response.body()
            data = json.loads(body)
            if data.get("returncode") == 0:
                if not _captured_api_url:
                    _captured_api_url = response.url
                    log.info(f"Captured API URL: {response.url[:120]}")
                result_obj = data.get("result", {})
                api_page = result_obj.get("pageindex", 0)
                items = _extract_items(data)
                total = result_obj.get("totalcount", "?")
                cars = [m for item in items if (m := map_china_car(item))]
                log.info(f"{label}XHR pageindex={api_page} → {len(cars)} cars (total={total})")
                await received.put((api_page, cars))
            else:
                log.warning(f"{label}XHR returncode={data.get('returncode')} msg={data.get('message', '')}")
        except Exception as e:
            log.warning(f"{label}Response parse error: {e}")

    page.on("response", handle_response)
    done = 0
    try:
        # ── Page 1: navigate and wait for first XHR ──────────────────────────
        log.info(f"{label}Navigating (wait_until=commit)...")
        try:
            await page.goto(CHE168_LIST_BASE, wait_until="commit", timeout=NAV_TIMEOUT)
            log.info(f"{label}HTTP response received, waiting for XHR (up to 90 s)...")
        except Exception as e:
            log.warning(f"{label}Nav error: {e}")

        try:
            api_page1, cars1 = await asyncio.wait_for(received.get(), timeout=90.0)
        except asyncio.TimeoutError:
            log.error(f"{label}Page 1 XHR not received in 90 s — likely blocked")
            return 0

        if start_page == 1 and cars1:
            await _save_cars(cars1)
            done += 1
            log.info(f"{label}Page 1 saved ({len(cars1)} cars)")

        # ── Pages 2+: scroll loop ────────────────────────────────────────────
        consecutive_empty = 0
        for target_page in range(2, end_page + 1):
            # Wait for React to render list items from the previous XHR.
            # 2 s is enough — dump showed page 2 XHR fires ~1 s after scroll.
            await page.wait_for_timeout(2000)

            await _scroll_to_trigger_next_page(page, received, label=label)

            # Wait for the next XHR to fire
            try:
                api_page, cars = await asyncio.wait_for(received.get(), timeout=20.0)
                if api_page >= start_page and cars:
                    await _save_cars(cars)
                    done += 1
                    consecutive_empty = 0
                    if done % 10 == 0:
                        log.info(f"{label}Progress: {done} pages saved, total buffered {len(_json_buffer)}")
                else:
                    consecutive_empty += 1
            except asyncio.TimeoutError:
                consecutive_empty += 1
                log.warning(f"{label}Page {target_page}: XHR timeout ({consecutive_empty}/3)")
                if consecutive_empty >= 3:
                    log.info(f"{label}3 consecutive timeouts — stopping")
                    break

        return done
    finally:
        page.remove_listener("response", handle_response)
        await page.close()


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
            # Run in chunks of 200 pages; each chunk opens a fresh tab
            chunk = 200
            p = start_page
            while True:
                done = await _run_pages(context, p, p + chunk - 1, "Full ")
                if done == 0:
                    log.info(f"Full sync: no pages fetched starting at {p} — done")
                    break
                _save_checkpoint({"last_page": p + done - 1})
                p += done
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

            # ── Scroll diagnostic: find scroll containers and test infinite scroll ──
            scroll_page = await context.new_page()
            scroll_received: asyncio.Queue = asyncio.Queue()

            async def _scroll_capture(response):
                if "api/v11/search" in response.url:
                    try:
                        body = await response.body()
                        data = json.loads(body)
                        if data.get("returncode") == 0:
                            result_obj = data.get("result", {})
                            api_pg = result_obj.get("pageindex", "?")
                            items = _extract_items(data)
                            log.warning(f"SCROLL TEST XHR: pageindex={api_pg}, items={len(items)}")
                            await scroll_received.put(api_pg)
                    except Exception as e:
                        log.warning(f"SCROLL CAPTURE error: {e}")

            scroll_page.on("response", _scroll_capture)
            try:
                log.info("SCROLL DIAG: navigating (wait_until=commit)...")
                try:
                    await scroll_page.goto(CHE168_LIST_BASE, wait_until="commit", timeout=NAV_TIMEOUT)
                except Exception as e:
                    log.warning(f"SCROLL DIAG nav error: {e}")

                # Wait for page 1 XHR
                try:
                    p1 = await asyncio.wait_for(scroll_received.get(), timeout=90.0)
                    log.info(f"SCROLL DIAG: page 1 XHR received (pageindex={p1})")
                except asyncio.TimeoutError:
                    log.warning("SCROLL DIAG: page 1 XHR timeout")
                    p1 = None

                if p1 is not None:
                    # Log scroll containers BEFORE scroll (after 5s render wait)
                    await scroll_page.wait_for_timeout(5000)
                    containers = await scroll_page.evaluate("""() => {
                        return Array.from(document.querySelectorAll('*'))
                            .filter(el => {
                                try {
                                    const ov = getComputedStyle(el).overflowY;
                                    return (ov === 'auto' || ov === 'scroll')
                                           && el.scrollHeight > el.clientHeight + 50;
                                } catch(e) { return false; }
                            })
                            .map(el => ({
                                tag: el.tagName,
                                cls: el.className.substring(0, 60),
                                scrollH: el.scrollHeight,
                                clientH: el.clientHeight,
                                scrollTop: el.scrollTop,
                                id: el.id || ''
                            }));
                    }""")
                    log.warning(f"SCROLL DIAG: scrollable containers ({len(containers)} found):")
                    for c in containers[:10]:
                        log.warning(f"  {c}")

                    body_h = await scroll_page.evaluate("document.body.scrollHeight")
                    doc_h = await scroll_page.evaluate("document.documentElement.scrollHeight")
                    win_h = await scroll_page.evaluate("window.innerHeight")
                    log.warning(f"SCROLL DIAG: body.scrollHeight={body_h}, doc.scrollHeight={doc_h}, innerHeight={win_h}")

                    # Attempt scroll and wait for page 2 XHR
                    log.info("SCROLL DIAG: attempting scroll to trigger page 2...")
                    await _scroll_to_trigger_next_page(scroll_page, scroll_received, label="SCROLL DIAG ")
                    try:
                        p2 = await asyncio.wait_for(scroll_received.get(), timeout=20.0)
                        log.warning(f"SCROLL DIAG: ✓ page 2 XHR received! (pageindex={p2})")
                    except asyncio.TimeoutError:
                        log.warning("SCROLL DIAG: ✗ page 2 XHR NOT received within 20 s — scroll doesn't work")
            finally:
                scroll_page.remove_listener("response", _scroll_capture)
                await scroll_page.close()

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
