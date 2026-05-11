from fastapi import FastAPI, Query, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from datetime import datetime
from typing import Optional
import os
from dotenv import load_dotenv

from db import get_session, init_db
from models import Car
from calculator import calc_car_cost, load_fees, save_fees, SEGMENTS

load_dotenv()

API_KEY = os.getenv("API_KEY", "")

_cors_raw = os.getenv("CORS_ORIGINS", "http://localhost:3000")
CORS_ORIGINS = [o.strip() for o in _cors_raw.split(",") if o.strip()]

app = FastAPI(title="Encar Parser API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET"],
    allow_headers=["*"],
)


def check_api_key(x_api_key: str = Header(default="")):
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")


class CarSchema(BaseModel):
    id: str
    manufacturer: Optional[str]
    model: Optional[str]
    badge: Optional[str]
    fuel_type: Optional[str]
    year: Optional[int]
    mileage: Optional[int]
    price: Optional[float]
    office_city: Optional[str]
    green_type: bool
    photos: Optional[list]
    condition: Optional[list]
    trust: Optional[list]
    engine_volume: Optional[int]
    horsepower: Optional[int]
    is_available: bool
    first_seen_at: datetime
    last_seen_at: datetime

    class Config:
        from_attributes = True


class CarsResponse(BaseModel):
    total: int
    offset: int
    limit: int
    items: list[CarSchema]


@app.on_event("startup")
async def startup():
    await init_db()


@app.get("/cars", response_model=CarsResponse, dependencies=[Depends(check_api_key)])
async def get_cars(
    manufacturer: Optional[str] = Query(None),
    model: Optional[str] = Query(None),
    fuel_type: Optional[str] = Query(None),
    year_from: Optional[int] = Query(None),
    year_to: Optional[int] = Query(None),
    price_from: Optional[float] = Query(None),
    price_to: Optional[float] = Query(None),
    mileage_max: Optional[int] = Query(None),
    available_only: bool = Query(True),
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
):
    q = select(Car)
    count_q = select(func.count()).select_from(Car)

    filters = []
    if available_only:
        filters.append(Car.is_available == True)
    if manufacturer:
        filters.append(Car.manufacturer.ilike(f"%{manufacturer}%"))
    if model:
        filters.append(Car.model.ilike(f"%{model}%"))
    if fuel_type:
        filters.append(Car.fuel_type == fuel_type)
    if year_from:
        filters.append(Car.year >= year_from)
    if year_to:
        filters.append(Car.year <= year_to)
    if price_from:
        filters.append(Car.price >= price_from)
    if price_to:
        filters.append(Car.price <= price_to)
    if mileage_max:
        filters.append(Car.mileage <= mileage_max)

    if filters:
        from sqlalchemy import and_
        q = q.where(and_(*filters))
        count_q = count_q.where(and_(*filters))

    total_result = await session.execute(count_q)
    total = total_result.scalar()

    q = q.order_by(Car.last_seen_at.desc()).offset(offset).limit(limit)
    result = await session.execute(q)
    cars = result.scalars().all()

    return CarsResponse(total=total, offset=offset, limit=limit, items=cars)


@app.get("/cars/{car_id}", response_model=CarSchema, dependencies=[Depends(check_api_key)])
async def get_car(car_id: str, session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Car).where(Car.id == car_id))
    car = result.scalar_one_or_none()
    if not car:
        raise HTTPException(status_code=404, detail="Car not found")
    return car


class ExchangeRates(BaseModel):
    krw_rub: float
    eur_rub: float


class CarCostSchema(BaseModel):
    price_krw: int
    price_rub: int
    customs_value_eur: int
    utilshor_rub: Optional[int]
    customs_duty_rub: Optional[int]
    customs_clearance_rub: Optional[int]
    broker_fee_rub: int
    agent_fee_rub: int
    segment: str
    total_rub: Optional[int]
    exchange_rates: ExchangeRates


@app.get("/cars/{car_id}/cost", response_model=CarCostSchema, dependencies=[Depends(check_api_key)])
async def get_car_cost(car_id: str, session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Car).where(Car.id == car_id))
    car = result.scalar_one_or_none()
    if not car:
        raise HTTPException(status_code=404, detail="Car not found")
    try:
        cost = await calc_car_cost(car)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch exchange rates: {e}")
    return cost


@app.get("/filters", dependencies=[Depends(check_api_key)])
async def get_filters(session: AsyncSession = Depends(get_session)):
    manufacturers = await session.execute(
        select(Car.manufacturer).where(Car.is_available == True).distinct().order_by(Car.manufacturer)
    )
    fuel_types = await session.execute(
        select(Car.fuel_type).where(Car.is_available == True).distinct().order_by(Car.fuel_type)
    )
    return {
        "manufacturers": [r[0] for r in manufacturers if r[0]],
        "fuel_types": [r[0] for r in fuel_types if r[0]],
    }


class SegmentFees(BaseModel):
    broker_fee: int
    agent_fee: int
    car_markup: float = 0
    car_markup_type: str = "fixed"


@app.get("/fees")
async def get_fees():
    return load_fees()


class FeesPayload(BaseModel):
    segments: dict[str, SegmentFees] = {}
    korea_fee_won: int = 0


@app.put("/fees", dependencies=[Depends(check_api_key)])
async def update_fees(data: FeesPayload):
    unknown = set(data.segments.keys()) - set(SEGMENTS)
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown segments: {unknown}")
    current = load_fees()
    for seg, fees in data.segments.items():
        if fees.broker_fee < 0 or fees.agent_fee < 0:
            raise HTTPException(status_code=400, detail="Fees must be non-negative")
        current[seg] = {
            "broker_fee": fees.broker_fee,
            "agent_fee": fees.agent_fee,
            "car_markup": fees.car_markup,
            "car_markup_type": fees.car_markup_type,
        }
    if data.korea_fee_won >= 0:
        current["korea_fee_won"] = data.korea_fee_won
    save_fees(current)
    return current


@app.get("/stats")
async def get_stats(session: AsyncSession = Depends(get_session)):
    total = await session.execute(select(func.count()).select_from(Car))
    available = await session.execute(select(func.count()).select_from(Car).where(Car.is_available == True))
    return {
        "total": total.scalar(),
        "available": available.scalar(),
    }
