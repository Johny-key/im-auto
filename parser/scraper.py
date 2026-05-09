import asyncio
import aiohttp
import logging
from datetime import datetime
from sqlalchemy import select, update
from db import init_db, SessionLocal
from models import Car
import os
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

BATCH_SIZE = int(os.getenv("BATCH_SIZE", 100))
REQUEST_DELAY = float(os.getenv("REQUEST_DELAY", 1.1))

BASE_URL = "https://api.encar.com/search/car/list/general"
DETAIL_URL = "https://api.encar.com/car/{car_id}"
# Y = Korean domestic, N = imported (BMW, Mercedes, etc.)
QUERIES = [
    "(And.Hidden.N._.CarType.Y.)",
    "(And.Hidden.N._.CarType.N.)",
]
PHOTO_CDN = "https://ci.encar.com"

DETAIL_CONCURRENCY = int(os.getenv("DETAIL_CONCURRENCY", 15))
DETAIL_DELAY = float(os.getenv("DETAIL_DELAY", 0.4))

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Referer": "https://www.encar.com/",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8",
}


def parse_year(raw: str | None) -> int | None:
    if not raw:
        return None
    try:
        return int(str(raw)[:4])
    except (ValueError, TypeError):
        return None


def parse_volume_from_badge(badge: str | None) -> int | None:
    if not badge:
        return None
    import re
    m = re.search(r'(\d+\.\d+)', badge)
    if not m:
        return None
    liters = float(m.group(1))
    if liters < 0.5 or liters > 8:
        return None
    return round(liters * 1000)


def build_photo_urls(photo_base: str | None, photos: list | None) -> list[str]:
    if not photos:
        return []
    urls = []
    for p in photos:
        loc = p.get("location", "")
        if loc.startswith("http"):
            urls.append(loc)
        elif photo_base:
            urls.append(f"{PHOTO_CDN}{photo_base}{loc}")
        else:
            urls.append(f"{PHOTO_CDN}{loc}")
    return urls


def map_car(data: dict) -> dict:
    photo_base = data.get("Photo")
    raw_photos = data.get("Photos") or []
    photo_urls = build_photo_urls(photo_base, raw_photos)

    badge = data.get("Badge")
    return {
        "id": str(data["Id"]),
        "manufacturer": data.get("Manufacturer"),
        "model": data.get("Model"),
        "badge": badge,
        "badge_detail": data.get("BadgeDetail"),
        "fuel_type": data.get("FuelType"),
        "year": parse_year(data.get("Year")),
        "mileage": data.get("Mileage"),
        "price": data.get("Price"),
        "office_city": data.get("OfficeCityState"),
        "green_type": data.get("GreenType") == "Y",
        "photos": photo_urls,
        "photo_base": photo_base,
        "condition": data.get("Condition"),
        "trust": data.get("Trust"),
        "service_mark": data.get("ServiceMark"),
        "buy_type": data.get("BuyType"),
        "engine_volume": parse_volume_from_badge(badge),
        "details_fetched": True,
        "is_available": True,
        "last_seen_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }


async def fetch_car_detail(session: aiohttp.ClientSession, car_id: str) -> dict | None:
    url = DETAIL_URL.format(car_id=car_id)
    try:
        async with session.get(url) as resp:
            if resp.status == 404:
                return None
            resp.raise_for_status()
            return await resp.json()
    except Exception as e:
        log.warning(f"Detail fetch failed for {car_id}: {e}")
        return None


def parse_engine_specs(detail: dict) -> dict:
    spec = detail.get("Spec") or {}
    perf = detail.get("Performance") or {}

    raw_volume = (
        spec.get("Displacement")
        or spec.get("EngineDisplacement")
        or detail.get("Displacement")
    )
    raw_hp = (
        perf.get("MaxOutputPs")
        or perf.get("PowerPs")
        or spec.get("PowerPs")
        or detail.get("PowerPs")
    )

    return {
        "engine_volume": int(raw_volume) if raw_volume else None,
        "horsepower": int(raw_hp) if raw_hp else None,
    }


async def enrich_new_cars(http: aiohttp.ClientSession):
    """Fetches engine specs for cars that haven't been enriched yet."""
    async with SessionLocal() as session:
        result = await session.execute(
            select(Car.id).where(Car.details_fetched == False).limit(500)
        )
        ids = [row[0] for row in result]

    if not ids:
        return

    log.info(f"Enriching details for {len(ids)} cars...")
    semaphore = asyncio.Semaphore(DETAIL_CONCURRENCY)

    async def fetch_and_update(car_id: str):
        async with semaphore:
            await asyncio.sleep(DETAIL_DELAY)
            detail = await fetch_car_detail(http, car_id)
            specs = parse_engine_specs(detail) if detail else {"engine_volume": None, "horsepower": None}
            async with SessionLocal() as session:
                await session.execute(
                    update(Car)
                    .where(Car.id == car_id)
                    .values(**specs, details_fetched=True, updated_at=datetime.utcnow())
                )
                await session.commit()

    await asyncio.gather(*[fetch_and_update(cid) for cid in ids])
    log.info(f"Enrichment done for {len(ids)} cars")


async def fetch_page(session: aiohttp.ClientSession, offset: int, query: str) -> dict:
    params = {
        "count": "true",
        "q": query,
        "sr": f"|ModifiedDate|{offset}|{BATCH_SIZE}",
    }
    async with session.get(BASE_URL, params=params) as resp:
        resp.raise_for_status()
        return await resp.json()


async def upsert_cars(cars_data: list[dict]):
    now = datetime.utcnow()
    async with SessionLocal() as session:
        ids = [c["id"] for c in cars_data]

        existing = await session.execute(select(Car.id).where(Car.id.in_(ids)))
        existing_ids = {row[0] for row in existing}

        new_cars = []
        for c in cars_data:
            if c["id"] in existing_ids:
                await session.execute(
                    update(Car)
                    .where(Car.id == c["id"])
                    .values(
                        price=c["price"],
                        mileage=c["mileage"],
                        photos=c["photos"],
                        engine_volume=c["engine_volume"],
                        details_fetched=True,
                        is_available=True,
                        last_seen_at=now,
                        updated_at=now,
                    )
                )
            else:
                new_cars.append(Car(**c, first_seen_at=now))

        if new_cars:
            session.add_all(new_cars)

        await session.commit()
        log.info(f"Upserted {len(cars_data)}: {len(new_cars)} new, {len(existing_ids)} updated")


async def mark_unavailable(seen_ids: set[str]):
    async with SessionLocal() as session:
        await session.execute(
            update(Car)
            .where(Car.id.notin_(seen_ids))
            .where(Car.is_available == True)
            .values(is_available=False, updated_at=datetime.utcnow())
        )
        await session.commit()
        log.info(f"Marked cars not in {len(seen_ids)} IDs as unavailable")


async def run_full_sync():
    log.info("Starting full sync...")
    await init_db()

    connector = aiohttp.TCPConnector(limit=1, ssl=False)

    async with aiohttp.ClientSession(headers=HEADERS, connector=connector) as http:
        all_seen_ids: set[str] = set()

        for query in QUERIES:
            log.info(f"Syncing query: {query}")
            first = await fetch_page(http, 0, query)
            total = first.get("Count", 0)
            log.info(f"Total cars for this query: {total}")

            batch = first.get("SearchResults", [])
            cars = [map_car(c) for c in batch]
            all_seen_ids.update(c["id"] for c in cars)
            await upsert_cars(cars)

            offset = BATCH_SIZE
            while offset < total:
                await asyncio.sleep(REQUEST_DELAY)
                try:
                    data = await fetch_page(http, offset, query)
                    batch = data.get("SearchResults", [])
                    if not batch:
                        break
                    cars = [map_car(c) for c in batch]
                    all_seen_ids.update(c["id"] for c in cars)
                    await upsert_cars(cars)
                    log.info(f"Progress: {offset}/{total}")
                except Exception as e:
                    log.error(f"Error at offset {offset}: {e}")
                    await asyncio.sleep(5)
                offset += BATCH_SIZE

        await mark_unavailable(all_seen_ids)
        await enrich_new_cars(http)
    log.info("Full sync complete")


async def run_incremental_sync():
    """Fetches only recent pages (first 1000 cars by ModifiedDate) to catch new and updated listings."""
    log.info("Starting incremental sync...")

    connector = aiohttp.TCPConnector(limit=1, ssl=False)

    async with aiohttp.ClientSession(headers=HEADERS, connector=connector) as http:
        for query in QUERIES:
            for offset in range(0, 1000, BATCH_SIZE):
                await asyncio.sleep(REQUEST_DELAY)
                try:
                    data = await fetch_page(http, offset, query)
                    batch = data.get("SearchResults", [])
                    if not batch:
                        break
                    cars = [map_car(c) for c in batch]
                    await upsert_cars(cars)
                except Exception as e:
                    log.error(f"Incremental error at offset {offset}: {e}")

    log.info("Incremental sync complete")


if __name__ == "__main__":
    import sys
    mode = sys.argv[1] if len(sys.argv) > 1 else "incremental"
    if mode == "full":
        asyncio.run(run_full_sync())
    else:
        asyncio.run(run_incremental_sync())
