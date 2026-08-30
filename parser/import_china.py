"""
Import China cars from JSON file into the database.
Run on VPS: python3 import_china.py /tmp/china_cars.json
"""
import asyncio
import json
import logging
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy.dialects.postgresql import insert as pg_insert
from db import SessionLocal, init_db
from models import Car
from calculator import get_cbr_rates, get_segment

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)


async def calc_total_rub(price_cny: float):
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


async def upsert_batch(rows: list[dict]):
    stmt = pg_insert(Car).values(rows)
    stmt = stmt.on_conflict_do_update(
        index_elements=["id"],
        set_={
            "price":         stmt.excluded.price,
            "mileage":       stmt.excluded.mileage,
            "photos":        stmt.excluded.photos,
            "is_available":  True,
            "last_seen_at":  stmt.excluded.last_seen_at,
            "updated_at":    stmt.excluded.updated_at,
        },
    )
    async with SessionLocal() as session:
        await session.execute(stmt)
        await session.commit()


async def main(json_path: str):
    await init_db()

    data = json.loads(Path(json_path).read_text(encoding="utf-8"))
    log.info(f"Loaded {len(data)} cars from {json_path}")

    # Enrich with CNY→RUB conversion
    rates = await get_cbr_rates()
    cny_rub = rates.get("CNY", 13.0)
    log.info(f"CNY/RUB rate: {cny_rub}")

    now = datetime.utcnow()
    rows = []
    for car in data:
        price = car.get("price")
        if price:
            total = int(price * cny_rub)
            seg = get_segment(total)
        else:
            total, seg = None, None

        rows.append({
            **car,
            "first_seen_at": now,
            "segment":       seg,
            "total_rub":     total,
            "details_fetched": True,
            "last_seen_at":  now,
            "updated_at":    now,
        })

    # Upsert in batches of 100
    batch_size = 100
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        await upsert_batch(batch)
        log.info(f"Upserted batch {i // batch_size + 1}: {len(batch)} cars")

    log.info(f"Import complete: {len(rows)} China cars in DB")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 import_china.py <path_to_json>")
        sys.exit(1)
    asyncio.run(main(sys.argv[1]))
