from sqlalchemy import String, Integer, Float, Boolean, DateTime, JSON, Text, Index
from sqlalchemy.orm import DeclarativeBase, mapped_column, Mapped
from datetime import datetime
from typing import Optional


class Base(DeclarativeBase):
    pass


class Car(Base):
    __tablename__ = "cars"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    manufacturer: Mapped[str | None] = mapped_column(String(100))
    model: Mapped[str | None] = mapped_column(String(100))
    badge: Mapped[str | None] = mapped_column(String(200))
    badge_detail: Mapped[str | None] = mapped_column(String(200))
    fuel_type: Mapped[str | None] = mapped_column(String(50))
    year: Mapped[int | None] = mapped_column(Integer)
    manufacture_month: Mapped[int | None] = mapped_column(Integer)
    mileage: Mapped[int | None] = mapped_column(Integer)
    price: Mapped[float | None] = mapped_column(Float)
    office_city: Mapped[str | None] = mapped_column(String(100))
    green_type: Mapped[bool] = mapped_column(Boolean, default=False)
    photos: Mapped[list | None] = mapped_column(JSON)
    photo_base: Mapped[str | None] = mapped_column(Text)
    condition: Mapped[list | None] = mapped_column(JSON)
    trust: Mapped[list | None] = mapped_column(JSON)
    service_mark: Mapped[list | None] = mapped_column(JSON)
    buy_type: Mapped[list | None] = mapped_column(JSON)
    sell_type: Mapped[str | None] = mapped_column(String(50))
    service_copy_car: Mapped[str | None] = mapped_column(String(50))
    engine_volume: Mapped[int | None] = mapped_column(Integer)     # куб.см
    horsepower: Mapped[int | None] = mapped_column(Integer)        # л.с.
    segment: Mapped[str | None] = mapped_column(String(20))        # Эконом/Комфорт/Бизнес/Премиум
    total_rub: Mapped[int | None] = mapped_column(Integer)          # итоговая стоимость в ₽
    accident_cnt: Mapped[int | None] = mapped_column(Integer)
    my_accident_cost: Mapped[int | None] = mapped_column(Integer)    # ₩ выплат за ремонт этого авто
    other_accident_cost: Mapped[int | None] = mapped_column(Integer) # ₩ выплат за ущерб другим
    owner_change_cnt: Mapped[int | None] = mapped_column(Integer)
    flood_damage: Mapped[bool] = mapped_column(Boolean, default=False)
    accident_fetched: Mapped[bool] = mapped_column(Boolean, default=False)
    details_fetched: Mapped[bool] = mapped_column(Boolean, default=False)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True)
    country: Mapped[str] = mapped_column(String(20), default="korea", server_default="korea")
    first_seen_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_cars_manufacturer", "manufacturer"),
        Index("ix_cars_model", "model"),
        Index("ix_cars_year", "year"),
        Index("ix_cars_price", "price"),
        Index("ix_cars_is_available", "is_available"),
    )


class ApiKey(Base):
    __tablename__ = "api_keys"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    client_name: Mapped[str] = mapped_column(String(200))
    plan: Mapped[str] = mapped_column(String(50), default="basic")
    # 0 = unlimited
    requests_limit: Mapped[int] = mapped_column(Integer, default=10_000)
    requests_used: Mapped[int] = mapped_column(Integer, default=0)
    # When the monthly counter resets
    reset_at: Mapped[datetime] = mapped_column(DateTime)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
