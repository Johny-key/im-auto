"""
Fast recalc: recompute total_rub and segment for all cars using existing DB data.
No external API calls — uses stored engine_volume, horsepower, year, manufacture_month.
"""
import asyncio, os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, update
from dotenv import load_dotenv

load_dotenv()
from models import Car
from calculator import (
    calc_utilshor, calc_customs_duty, calc_clearance_fee,
    get_segment, get_segment_smart, load_fees, get_cbr_rates, ENCAR_PRICE_MULTIPLIER,
)
from scraper import lookup_engine_by_model, parse_volume_from_badge, estimate_hp

DB_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://encar:encar@db:5432/encar")
engine = create_async_engine(DB_URL, pool_size=5)
Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

BATCH = 2000


async def main():
    rates = await get_cbr_rates()
    fees = load_fees()
    krw_rub = rates.get("KRW", 0)
    eur_rub = rates.get("EUR", 0)
    korea_fee_won = fees.get("korea_fee_won", 0)
    print(f"Rates: KRW={krw_rub:.6f}  EUR={eur_rub:.2f}  korea_fee={korea_fee_won}")

    updated = 0
    last_id = ""

    while True:
        async with Session() as s:
            rows = (await s.execute(
                select(Car)
                .where(Car.is_available == True, Car.price != None, Car.year != None, Car.id > last_id)
                .order_by(Car.id)
                .limit(BATCH)
            )).scalars().all()

        if not rows:
            break

        async with Session() as s:
            for car in rows:
                price_krw = int(car.price * ENCAR_PRICE_MULTIPLIER) + korea_fee_won
                price_rub = round(price_krw * krw_rub)
                month = car.manufacture_month

                lookup_cc, lookup_hp = lookup_engine_by_model(
                    car.manufacturer, car.model, car.fuel_type, car.badge, year=car.year
                )
                cc = lookup_cc or parse_volume_from_badge(car.badge) or car.engine_volume
                if lookup_hp is not None:
                    hp = lookup_hp
                elif car.horsepower:
                    hp = car.horsepower
                else:
                    hp = estimate_hp(cc, car.badge, car.fuel_type)

                utilshor = calc_utilshor(car.fuel_type, cc, hp, car.year, month)
                customs_eur = round(price_rub / eur_rub) if eur_rub else 0
                duty = calc_customs_duty(cc or 2000, car.year, customs_eur, eur_rub, month)
                clearance = calc_clearance_fee(price_rub)

                if utilshor is None or duty is None:
                    continue

                seg_fees = fees.get(get_segment(price_rub), {"broker_fee": 0, "agent_fee": 0})
                total = price_rub + utilshor + duty + clearance + seg_fees.get("broker_fee", 0) + seg_fees.get("agent_fee", 0)
                seg = get_segment_smart(
                    base_price_rub=price_rub,
                    manufacturer=car.manufacturer,
                    year=car.year,
                    mileage=car.mileage,
                )

                values = {"segment": seg, "total_rub": total}
                if lookup_hp is not None:
                    values["horsepower"] = lookup_hp
                await s.execute(
                    update(Car).where(Car.id == car.id).values(**values)
                )
                updated += 1
            await s.commit()

        last_id = rows[-1].id
        print(f"  updated {updated} so far (last id={last_id})")

    print(f"Done. Total updated: {updated}")


asyncio.run(main())
