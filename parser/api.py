import secrets
from fastapi import FastAPI, Query, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update
from pydantic import BaseModel
from datetime import datetime, timedelta
from typing import Optional, List
import os
from dotenv import load_dotenv

from db import get_session, init_db
from models import Car, ApiKey
from calculator import calc_car_cost, calc_china_car_cost, load_fees, save_fees, SEGMENTS

load_dotenv()

ADMIN_KEY = os.getenv("ADMIN_KEY", "")

_cors_raw = os.getenv("CORS_ORIGINS", "*")
CORS_ORIGINS = [o.strip() for o in _cors_raw.split(",") if o.strip()]

app = FastAPI(title="Encar Data API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["*"],
)


# ── Auth ──────────────────────────────────────────────────────────

async def require_api_key(
    x_api_key: str = Header(default=""),
    session: AsyncSession = Depends(get_session),
) -> ApiKey:
    if not x_api_key:
        raise HTTPException(status_code=401, detail="X-API-Key header required")

    result = await session.execute(select(ApiKey).where(ApiKey.key == x_api_key))
    key_obj = result.scalar_one_or_none()

    if not key_obj:
        raise HTTPException(status_code=401, detail="Invalid API key")
    if not key_obj.is_active:
        raise HTTPException(status_code=403, detail="API key is disabled")
    if key_obj.expires_at and key_obj.expires_at < datetime.utcnow():
        raise HTTPException(status_code=403, detail="API key expired")

    # Monthly counter reset
    if key_obj.reset_at < datetime.utcnow():
        key_obj.requests_used = 0
        key_obj.reset_at = _next_month()

    if key_obj.requests_limit > 0 and key_obj.requests_used >= key_obj.requests_limit:
        raise HTTPException(
            status_code=429,
            detail=f"Monthly limit of {key_obj.requests_limit} requests exceeded",
        )

    key_obj.requests_used += 1
    await session.commit()

    return key_obj


def require_admin(x_admin_key: str = Header(default="")):
    if not ADMIN_KEY or x_admin_key != ADMIN_KEY:
        raise HTTPException(status_code=401, detail="Invalid admin key")


def _next_month() -> datetime:
    now = datetime.utcnow()
    if now.month == 12:
        return now.replace(year=now.year + 1, month=1, day=1, hour=0, minute=0, second=0)
    return now.replace(month=now.month + 1, day=1, hour=0, minute=0, second=0)


# ── Startup ───────────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    await init_db()


# ── Car schemas ───────────────────────────────────────────────────

class CarSchema(BaseModel):
    id: str
    manufacturer: Optional[str]
    model: Optional[str]
    badge: Optional[str]
    fuel_type: Optional[str]
    year: Optional[int]
    manufacture_month: Optional[int]
    mileage: Optional[int]
    price: Optional[float]
    office_city: Optional[str]
    green_type: bool
    photos: Optional[list]
    condition: Optional[list]
    trust: Optional[list]
    sell_type: Optional[str]
    service_copy_car: Optional[str]
    engine_volume: Optional[int]
    horsepower: Optional[int]
    segment: Optional[str]
    total_rub: Optional[int]
    accident_cnt: Optional[int]
    my_accident_cost: Optional[int]
    other_accident_cost: Optional[int]
    owner_change_cnt: Optional[int]
    flood_damage: bool
    accident_fetched: bool
    is_available: bool
    country: Optional[str]
    first_seen_at: datetime
    last_seen_at: datetime

    class Config:
        from_attributes = True


class CarsResponse(BaseModel):
    total: int
    offset: int
    limit: int
    items: list[CarSchema]


# ── Car endpoints ─────────────────────────────────────────────────

@app.get("/cars", response_model=CarsResponse)
async def get_cars(
    manufacturer: list[str] = Query(default=[]),
    model: Optional[str] = Query(None),
    models: list[str] = Query(default=[]),
    fuel_type: Optional[str] = Query(None),
    fuel_category: List[str] = Query(default=[]),  # electric | hybrid | regular | gas (multi)
    year_from: Optional[int] = Query(None),
    year_to: Optional[int] = Query(None),
    price_from: Optional[float] = Query(None),
    price_to: Optional[float] = Query(None),
    total_rub_from: Optional[int] = Query(None),
    total_rub_to: Optional[int] = Query(None),
    mileage_from: Optional[int] = Query(None),
    mileage_max: Optional[int] = Query(None),
    volume_from: Optional[int] = Query(None),
    volume_to: Optional[int] = Query(None),
    hp_from: Optional[int] = Query(None),
    hp_to: Optional[int] = Query(None),
    segment: Optional[str] = Query(None),
    country: Optional[str] = Query(None),  # 'korea' | 'china'
    drive_type: List[str] = Query(default=[]),  # 'awd' | 'rwd' | 'fwd'
    eco_fee: bool = Query(False),
    available_only: bool = Query(True),
    calculable_only: bool = Query(False),
    sort_by: str = Query("recent"),  # recent | price_asc | price_desc
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
    _key: ApiKey = Depends(require_api_key),
):
    q = select(Car)
    count_q = select(func.count()).select_from(Car)

    from sqlalchemy import or_
    filters = []
    # Never show duplicate listings (same car listed by multiple dealers)
    # Must use OR IS NULL because PostgreSQL treats NULL != 'x' as NULL (not TRUE)
    filters.append(or_(Car.service_copy_car.is_(None), Car.service_copy_car != "DUPLICATION"))
    if available_only:
        filters.append(Car.is_available == True)
    if calculable_only:
        filters.append(Car.year != None)
        filters.append(Car.price != None)
        filters.append(Car.price > 0)
        filters.append(Car.price.notin_([9997, 9998, 9999, 99999]))
        filters.append(Car.mileage != None)
        filters.append(Car.fuel_type != None)
        filters.append(Car.engine_volume != None)
        filters.append(Car.total_rub != None)
        filters.append(Car.total_rub > 0)
    if manufacturer:
        from sqlalchemy import or_
        filters.append(or_(*[Car.manufacturer.ilike(f"%{m}%") for m in manufacturer]))
    if model:
        filters.append(Car.model.ilike(f"%{model}%"))
    if models:
        from sqlalchemy import or_
        filters.append(or_(*[Car.model == m for m in models]))
    if fuel_type:
        filters.append(Car.fuel_type == fuel_type)
    if fuel_category:
        from sqlalchemy import or_
        _CAT_MAP = {
            "electric": ["전기", "electric"],
            "hybrid":   ["가솔린+전기", "디젤+전기", "LPG+전기", "hybrid", "phev"],
            "gas":      ["LPG(일반인 구입)", "가솔린+LPG", "CNG", "가솔린+CNG", "gas"],
            "regular":  ["가솔린", "디젤", "gasoline", "diesel"],
            "gasoline": ["가솔린", "gasoline"],
            "diesel":   ["디젤", "diesel"],
        }
        allowed: list[str] = []
        for cat in fuel_category:
            allowed.extend(_CAT_MAP.get(cat, []))
        if allowed:
            filters.append(or_(*[Car.fuel_type == t for t in allowed]))
    if year_from:
        filters.append(Car.year >= year_from)
    if year_to:
        filters.append(Car.year <= year_to)
    if price_from:
        filters.append(Car.price >= price_from)
    if price_to:
        filters.append(Car.price <= price_to)
    if total_rub_from:
        filters.append(Car.total_rub >= total_rub_from)
    if total_rub_to:
        filters.append(Car.total_rub <= total_rub_to)
    if mileage_from:
        filters.append(Car.mileage >= mileage_from)
    if mileage_max:
        filters.append(Car.mileage <= mileage_max)
    if hp_from:
        filters.append(Car.horsepower >= hp_from)
    if hp_to:
        filters.append(Car.horsepower <= hp_to)
    if volume_from:
        filters.append(Car.engine_volume >= volume_from)
    if volume_to:
        filters.append(Car.engine_volume <= volume_to)
    if segment:
        filters.append(Car.segment == segment)
    if country:
        filters.append(Car.country == country)
    if drive_type:
        _AWD_PATTERNS = ["AWD", "4WD", "4X4", "콰트로", "4매틱", "4MATIC", "xDrive", "4모션",
                         "e-AWD", "SH-AWD", "e-4ORCE", "HTRAC", "quattro", "4motion"]
        _RWD_PATTERNS = ["RWD"]
        _FWD_PATTERNS = ["2WD", "FWD"]
        drive_clauses = []
        for dt in drive_type:
            dt_lower = dt.lower()
            if dt_lower == "awd":
                drive_clauses.append(or_(*[Car.badge.ilike(f"%{p}%") for p in _AWD_PATTERNS]))
            elif dt_lower == "rwd":
                drive_clauses.append(or_(*[Car.badge.ilike(f"%{p}%") for p in _RWD_PATTERNS]))
            elif dt_lower == "fwd":
                drive_clauses.append(or_(*[Car.badge.ilike(f"%{p}%") for p in _FWD_PATTERNS]))
        if drive_clauses:
            filters.append(or_(*drive_clauses))
    if eco_fee:
        from sqlalchemy import or_, and_, func as sqlfunc
        _ev_types = ["전기", "electric", "ev", "하이브리드", "hybrid", "플러그인하이브리드", "가솔린+전기"]
        is_ev = sqlfunc.lower(Car.fuel_type).in_(_ev_types)
        lgotny_ice = and_(~is_ev, Car.horsepower != None, Car.horsepower <= 160, Car.engine_volume != None, Car.engine_volume <= 3000)
        lgotny_ev  = and_(is_ev,  Car.horsepower != None, Car.horsepower <= 80)
        filters.append(or_(lgotny_ice, lgotny_ev))

    if filters:
        from sqlalchemy import and_
        q = q.where(and_(*filters))
        count_q = count_q.where(and_(*filters))

    total = (await session.execute(count_q)).scalar()

    if sort_by == "price_asc":
        q = q.order_by(Car.total_rub.asc().nulls_last())
    elif sort_by == "price_desc":
        q = q.order_by(Car.total_rub.desc().nulls_last())
    else:
        q = q.order_by(Car.last_seen_at.desc())

    q = q.offset(offset).limit(limit)
    cars = (await session.execute(q)).scalars().all()

    return CarsResponse(total=total, offset=offset, limit=limit, items=cars)


@app.get("/cars/{car_id}", response_model=CarSchema)
async def get_car(
    car_id: str,
    session: AsyncSession = Depends(get_session),
    _key: ApiKey = Depends(require_api_key),
):
    car = (await session.execute(select(Car).where(Car.id == car_id))).scalar_one_or_none()
    if not car:
        raise HTTPException(status_code=404, detail="Car not found")
    return car


class ExchangeRates(BaseModel):
    krw_rub: float
    eur_rub: float


class CarCostSchema(BaseModel):
    price_krw: Optional[int]
    price_rub: Optional[int]
    customs_value_eur: Optional[int]
    utilshor_rub: Optional[int]
    customs_duty_rub: Optional[int]
    customs_clearance_rub: Optional[int]
    broker_fee_rub: int
    agent_fee_rub: int
    segment: Optional[str]
    total_rub: Optional[int]
    exchange_rates: ExchangeRates


@app.get("/cars/{car_id}/cost", response_model=CarCostSchema)
async def get_car_cost(
    car_id: str,
    session: AsyncSession = Depends(get_session),
    _key: ApiKey = Depends(require_api_key),
):
    car = (await session.execute(select(Car).where(Car.id == car_id))).scalar_one_or_none()
    if not car:
        raise HTTPException(status_code=404, detail="Car not found")
    try:
        if car.country == "china":
            cost = await calc_china_car_cost(car)
        else:
            cost = await calc_car_cost(car)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch exchange rates: {e}")
    return cost


@app.get("/filters")
async def get_filters(
    session: AsyncSession = Depends(get_session),
    _key: ApiKey = Depends(require_api_key),
):
    base = Car.is_available == True
    calculable = (Car.year != None, Car.price != None, Car.price > 0, Car.price < 9997)

    from sqlalchemy import and_
    cond = and_(base, *calculable)

    manufacturers = await session.execute(
        select(Car.manufacturer).where(cond).distinct().order_by(Car.manufacturer)
    )
    year_range = await session.execute(
        select(func.min(Car.year), func.max(Car.year)).where(cond)
    )
    yr = year_range.one()
    return {
        "manufacturers": [r[0] for r in manufacturers if r[0]],
        "year_min": yr[0],
        "year_max": yr[1],
    }


@app.get("/models")
async def get_models(
    manufacturer: list[str] = Query(default=[]),
    session: AsyncSession = Depends(get_session),
    _key: ApiKey = Depends(require_api_key),
):
    from sqlalchemy import and_, or_
    base_cond = and_(
        Car.is_available == True,
        Car.year != None,
        Car.price != None,
        Car.price > 0,
        Car.price < 9997,
        Car.service_copy_car != "DUPLICATION",
    )
    if manufacturer:
        cond = and_(base_cond, or_(*[Car.manufacturer.ilike(f"%{m}%") for m in manufacturer]))
    else:
        cond = base_cond

    result = await session.execute(
        select(Car.model).where(cond).distinct().order_by(Car.model)
    )
    return {"models": [r[0] for r in result if r[0]]}


@app.get("/stats")
async def get_stats(
    session: AsyncSession = Depends(get_session),
    _key: ApiKey = Depends(require_api_key),
):
    total = (await session.execute(select(func.count()).select_from(Car))).scalar()
    available = (await session.execute(
        select(func.count()).select_from(Car).where(Car.is_available == True)
    )).scalar()
    return {"total": total, "available": available}


# ── Key info (for clients) ────────────────────────────────────────

@app.get("/me")
async def my_key_info(key: ApiKey = Depends(require_api_key)):
    remaining = (
        key.requests_limit - key.requests_used
        if key.requests_limit > 0
        else None
    )
    return {
        "client_name": key.client_name,
        "plan": key.plan,
        "requests_used": key.requests_used,
        "requests_limit": key.requests_limit,
        "requests_remaining": remaining,
        "reset_at": key.reset_at,
        "expires_at": key.expires_at,
    }


# ── Fees (internal, no key needed) ───────────────────────────────

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


@app.put("/fees")
async def update_fees(
    data: FeesPayload,
    x_admin_key: str = Header(default=""),
):
    require_admin(x_admin_key)
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


# ── Admin: key management ─────────────────────────────────────────

class CreateKeyRequest(BaseModel):
    client_name: str
    plan: str = "basic"
    requests_limit: int = 10_000
    expires_days: Optional[int] = None
    notes: Optional[str] = None


class KeySchema(BaseModel):
    key: str
    client_name: str
    plan: str
    requests_limit: int
    requests_used: int
    reset_at: datetime
    expires_at: Optional[datetime]
    is_active: bool
    created_at: datetime
    notes: Optional[str]

    class Config:
        from_attributes = True


class UpdateKeyRequest(BaseModel):
    client_name: Optional[str] = None
    plan: Optional[str] = None
    requests_limit: Optional[int] = None
    is_active: Optional[bool] = None
    expires_days: Optional[int] = None
    notes: Optional[str] = None


@app.post("/admin/keys", response_model=KeySchema)
async def create_key(
    data: CreateKeyRequest,
    session: AsyncSession = Depends(get_session),
    _: None = Depends(require_admin),
):
    key = ApiKey(
        key=f"ak_{secrets.token_urlsafe(32)}",
        client_name=data.client_name,
        plan=data.plan,
        requests_limit=data.requests_limit,
        requests_used=0,
        reset_at=_next_month(),
        expires_at=(
            datetime.utcnow() + timedelta(days=data.expires_days)
            if data.expires_days else None
        ),
        is_active=True,
        created_at=datetime.utcnow(),
        notes=data.notes,
    )
    session.add(key)
    await session.commit()
    await session.refresh(key)
    return key


@app.get("/admin/keys", response_model=list[KeySchema])
async def list_keys(
    session: AsyncSession = Depends(get_session),
    _: None = Depends(require_admin),
):
    result = await session.execute(select(ApiKey).order_by(ApiKey.created_at.desc()))
    return result.scalars().all()


@app.get("/admin/keys/{key}", response_model=KeySchema)
async def get_key(
    key: str,
    session: AsyncSession = Depends(get_session),
    _: None = Depends(require_admin),
):
    obj = (await session.execute(select(ApiKey).where(ApiKey.key == key))).scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Key not found")
    return obj


@app.patch("/admin/keys/{key}", response_model=KeySchema)
async def update_key(
    key: str,
    data: UpdateKeyRequest,
    session: AsyncSession = Depends(get_session),
    _: None = Depends(require_admin),
):
    obj = (await session.execute(select(ApiKey).where(ApiKey.key == key))).scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Key not found")
    if data.client_name is not None:
        obj.client_name = data.client_name
    if data.plan is not None:
        obj.plan = data.plan
    if data.requests_limit is not None:
        obj.requests_limit = data.requests_limit
    if data.is_active is not None:
        obj.is_active = data.is_active
    if data.expires_days is not None:
        obj.expires_at = datetime.utcnow() + timedelta(days=data.expires_days)
    if data.notes is not None:
        obj.notes = data.notes
    await session.commit()
    await session.refresh(obj)
    return obj


@app.post("/admin/keys/{key}/reset-usage", response_model=KeySchema)
async def reset_usage(
    key: str,
    session: AsyncSession = Depends(get_session),
    _: None = Depends(require_admin),
):
    obj = (await session.execute(select(ApiKey).where(ApiKey.key == key))).scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Key not found")
    obj.requests_used = 0
    obj.reset_at = _next_month()
    await session.commit()
    await session.refresh(obj)
    return obj


@app.delete("/admin/keys/{key}", status_code=204)
async def delete_key(
    key: str,
    session: AsyncSession = Depends(get_session),
    _: None = Depends(require_admin),
):
    obj = (await session.execute(select(ApiKey).where(ApiKey.key == key))).scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Key not found")
    await session.delete(obj)
    await session.commit()
