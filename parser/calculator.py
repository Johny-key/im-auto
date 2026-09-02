from __future__ import annotations

import json
import os
import aiohttp
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from typing import Optional

# Encar.com prices are in 만원 (10,000 KRW)
ENCAR_PRICE_MULTIPLIER = 10_000

FEES_PATH = os.environ.get("FEES_PATH", os.path.join(os.path.dirname(__file__), "fees.json"))

SEGMENTS = ["Эконом", "Комфорт", "Бизнес", "Премиум"]

# Segment thresholds by price_rub (legacy — used for fee lookup only)
_SEGMENT_THRESHOLDS = [
    (1_500_000, "Эконом"),
    (3_000_000, "Комфорт"),
    (6_000_000, "Бизнес"),
]


def get_segment(price_rub: float) -> str:
    """Legacy: segment by total price only. Used for fee table lookup."""
    for threshold, name in _SEGMENT_THRESHOLDS:
        if price_rub < threshold:
            return name
    return "Премиум"


# ── Brand tier table ──────────────────────────────────────────────────────────
# 0 = бюджет, 1 = массовый, 2 = премиальный, 3 = люкс
_BRAND_TIER: dict[str, int] = {
    # Люкс (3)
    "rolls-royce": 3, "bentley": 3, "ferrari": 3, "lamborghini": 3,
    "maserati": 3, "maybach": 3, "bugatti": 3, "aston martin": 3,
    "mclaren": 3, "koenigsegg": 3,
    # Премиальный (2)
    "porsche": 2, "lexus": 2, "genesis": 2, "infiniti": 2, "acura": 2,
    "lincoln": 2, "cadillac": 2, "volvo": 2, "land rover": 2,
    "range rover": 2, "jaguar": 2,
    "bmw": 2, "mercedes-benz": 2, "mercedes": 2, "audi": 2,
    "buick": 2,
    # Массовый (1)
    "toyota": 1, "honda": 1, "nissan": 1, "mazda": 1, "mitsubishi": 1,
    "subaru": 1, "suzuki": 1, "hyundai": 1, "kia": 1,
    "volkswagen": 1, "vw": 1, "skoda": 1, "seat": 1, "cupra": 1,
    "renault": 1, "peugeot": 1, "citroen": 1, "opel": 1,
    "ford": 1, "chevrolet": 1, "jeep": 1, "dodge": 1, "chrysler": 1,
    "geely": 1, "byd": 1, "changan": 1, "dongfeng": 1,
    "great wall": 1, "haval": 1, "li auto": 1, "nio": 1, "xpeng": 1,
    "zeekr": 1, "saic": 1, "gac": 1,
    # Бюджет (0)
    "daewoo": 0, "chery": 0, "lifan": 0, "baic": 0, "jac": 0,
    "zaz": 0, "lada": 0, "vaz": 0, "uaz": 0, "gaz": 0,
    "brilliance": 0, "faw": 0, "ssangyong": 0, "dacia": 0,
    "ravon": 0,
}


def _brand_tier(manufacturer: str | None) -> int:
    if not manufacturer:
        return 1  # default: массовый
    return _BRAND_TIER.get(manufacturer.lower().strip(), 1)


def get_segment_smart(
    base_price_rub: float,       # цена авто без пошлин/утильсбора
    manufacturer: str | None = None,
    year: int | None = None,
    mileage: int | None = None,  # km
    current_year: int = 2026,
) -> str:
    """
    Multi-factor segment scoring (0–100):
      40 pts — base car price (without Russian fees)
      30 pts — brand tier
      20 pts — age of car
      10 pts — mileage

    Thresholds: 0-24 Эконом | 25-49 Комфорт | 50-74 Бизнес | 75-100 Премиум
    """
    # 1. Price score (40 pts)
    price_breakpoints = [
        (500_000,   0),
        (1_000_000, 8),
        (2_000_000, 16),
        (3_500_000, 24),
        (6_000_000, 32),
    ]
    price_score = 40
    for threshold, score in price_breakpoints:
        if base_price_rub < threshold:
            price_score = score
            break

    # 2. Brand score (30 pts)
    tier = _brand_tier(manufacturer)
    brand_score = tier * 10  # 0/10/20/30

    # 3. Year score (20 pts) — lose 2 pts per year of age, floor 0
    if year:
        age = max(0, current_year - year)
        year_score = max(0, 20 - age * 2)
    else:
        year_score = 8  # unknown — assume ~6 years

    # 4. Mileage score (10 pts)
    if mileage is None:
        mileage_score = 5  # unknown — neutral
    elif mileage < 10_000:
        mileage_score = 10
    elif mileage < 30_000:
        mileage_score = 8
    elif mileage < 60_000:
        mileage_score = 6
    elif mileage < 100_000:
        mileage_score = 4
    elif mileage < 150_000:
        mileage_score = 2
    else:
        mileage_score = 0

    total = price_score + brand_score + year_score + mileage_score

    if total < 25:
        return "Эконом"
    if total < 52:
        return "Комфорт"
    if total < 76:
        return "Бизнес"
    return "Премиум"


def load_fees() -> dict:
    try:
        with open(FEES_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {s: {"broker_fee": 0, "agent_fee": 0} for s in SEGMENTS}


def save_fees(data: dict) -> None:
    with open(FEES_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

CBR_URL = "https://www.cbr.ru/scripts/XML_daily.asp"
_cbr_cache: dict = {}
_cbr_cache_time: Optional[datetime] = None
CBR_CACHE_TTL = timedelta(hours=1)

UTILSHOR_BASE = 20_000  # базовая ставка

# --- Утильсбор с 01.01.2026 ---
# Две возрастных категории: до 3 лет и более 3 лет (ФТС РФ, renins.ru).
# Колонки: (макс. л.с., коэф. до 3 лет, коэф. более 3 лет)

# == Физлица ==

UTILSHOR_EV = [
    (80,           0.17,   0.26),
    (100,          49.56,  82.08),
    (130,          65.88,  95.64),
    (160,          78.00,  111.36),
    (190,          92.40,  129.72),
    (220,          109.68, 151.20),
    (250,          129.96, 176.16),
    (280,          153.96, 205.20),
    (float("inf"), 182.40, 239.04),
]

UTILSHOR_ICE_UNDER_1L = [
    (160,          0.17,   0.26),
    (190,          15.36,  28.44),
    (220,          15.84,  29.28),
    (250,          16.20,  30.12),
    (float("inf"), 17.28,  30.12),
]

UTILSHOR_ICE_1_2L = [
    (160,          0.17,   0.26),
    (190,          45.00,  74.64),
    (220,          47.64,  79.20),
    (250,          50.52,  83.88),
    (280,          57.12,  91.92),
    (310,          64.56,  100.56),
    (340,          72.96,  110.16),
    (370,          83.16,  120.60),
    (400,          94.80,  132.00),
    (430,          108.00, 144.60),
    (460,          123.24, 158.40),
    (500,          140.40, 173.40),
    (float("inf"), 160.08, 189.84),
]

UTILSHOR_ICE_2_3L = [
    (160,          0.17,   0.26),
    (190,          115.34, 172.80),
    (220,          118.20, 175.08),
    (250,          120.12, 177.60),
    (280,          126.00, 183.00),
    (310,          131.04, 188.52),
    (340,          136.32, 193.68),
    (370,          141.72, 199.08),
    (400,          147.48, 204.72),
    (430,          153.36, 210.48),
    (460,          159.48, 216.36),
    (500,          165.84, 222.36),
    (float("inf"), 172.44, 228.60),
]

UTILSHOR_ICE_3_35L = [
    (160,          129.20, 197.81),
    (190,          131.76, 200.04),
    (220,          134.40, 202.20),
    (250,          137.16, 204.36),
    (280,          140.52, 207.24),
    (310,          144.00, 212.40),
    (340,          151.92, 217.80),
    (370,          160.32, 224.28),
    (400,          169.20, 231.00),
    (430,          178.44, 237.96),
    (460,          188.28, 245.04),
    (500,          198.60, 252.48),
    (float("inf"), 209.52, 260.04),
]

UTILSHOR_ICE_OVER_35L = [
    (160,          164.53, 216.29),
    (190,          167.28, 219.48),
    (220,          170.16, 222.84),
    (250,          173.04, 226.20),
    (280,          176.52, 231.36),
    (310,          180.00, 236.64),
    (340,          186.36, 249.60),
    (370,          192.88, 263.40),
    (400,          199.68, 277.92),
    (430,          206.64, 293.16),
    (460,          213.84, 309.36),
    (500,          221.28, 326.40),
    (float("inf"), 229.08, 344.28),
]

# == Юрлица / ИП ==
# Отличаются только льготной зоной (≤160 л.с. для ДВС, ≤80 л.с. для EV).
# ICE 3-3.5L и ICE >3.5L — льготной нет ни у кого, таблицы одинаковые.

UTILSHOR_EV_COMPANY = [
    (80,           40.04,  70.44),   # льготная юрлиц: выше чем у физлиц
    (100,          49.56,  82.08),
    (130,          65.88,  95.64),
    (160,          78.00,  111.36),
    (190,          92.40,  129.72),
    (220,          109.68, 151.20),
    (250,          129.96, 176.16),
    (280,          153.96, 205.20),
    (float("inf"), 182.40, 239.04),
]

UTILSHOR_ICE_UNDER_1L_COMPANY = [
    (160,          14.88,  27.60),   # льготная юрлиц
    (190,          15.36,  28.43),
    (220,          15.84,  29.28),
    (250,          16.20,  30.12),
    (float("inf"), 17.28,  30.12),
]

UTILSHOR_ICE_1_2L_COMPANY = [
    (160,          40.04,  70.44),   # льготная юрлиц
    (190,          45.00,  74.64),
    (220,          47.64,  79.20),
    (250,          50.52,  83.88),
    (280,          57.12,  91.92),
    (310,          64.56,  100.56),
    (340,          72.96,  110.16),
    (370,          83.16,  120.60),
    (400,          94.80,  132.00),
    (430,          108.00, 144.60),
    (460,          123.24, 158.40),
    (500,          140.40, 173.40),
    (float("inf"), 160.08, 189.84),
]

UTILSHOR_ICE_2_3L_COMPANY = [
    (160,          112.52, 170.36),  # льготная юрлиц
    (190,          115.34, 172.80),
    (220,          118.20, 175.08),
    (250,          120.12, 177.60),
    (280,          126.00, 183.00),
    (310,          131.04, 188.52),
    (340,          136.32, 193.68),
    (370,          141.72, 199.08),
    (400,          147.48, 204.72),
    (430,          153.36, 210.48),
    (460,          159.48, 216.36),
    (500,          165.84, 222.36),
    (float("inf"), 172.44, 228.60),
]

# ICE 3-3.5L и ICE >3.5L одинаковы для физлиц и юрлиц — используем те же таблицы.

# --- Таможенная пошлина (физлица, ЕАЭС) ---

# До 3 лет: (макс. таможенная стоимость EUR, %, мин. EUR/куб.см)
DUTY_UNDER_3Y = [
    (8_500,        0.54, 2.5),
    (16_700,       0.48, 3.5),
    (42_300,       0.48, 5.5),
    (84_500,       0.48, 7.5),
    (169_000,      0.48, 15.0),
    (float("inf"), 0.48, 20.0),
]

# 3-5 лет: (макс. куб.см, EUR/куб.см)
DUTY_3_5Y = [
    (1000,         1.5),
    (1500,         1.7),
    (1800,         2.5),
    (2300,         2.7),
    (3000,         3.0),
    (float("inf"), 3.6),
]

# 5+ лет: (макс. куб.см, EUR/куб.см)
DUTY_5Y_PLUS = [
    (1000,         3.0),
    (1500,         3.2),
    (1800,         3.5),
    (2300,         4.8),
    (3000,         5.0),
    (float("inf"), 5.7),
]

# --- Таможенный сбор (таможенное оформление) по таможенной стоимости в руб ---
CLEARANCE_FEES = [
    (200_000,       1_067),
    (450_000,       2_134),
    (1_200_000,     4_269),
    (2_700_000,     11_746),
    (4_200_000,     16_524),
    (5_500_000,     21_781),
    (7_000_000,     27_540),
    (10_000_000,    36_052),
    (15_000_000,    52_076),
    (20_000_000,    75_110),
    (30_000_000,    105_155),
    (float("inf"), 136_536),
]

# Типы топлива encar.com → категория для утильсбора
# Только чистые электромобили используют EV-таблицу (по кВт).
# Гибриды (HEV/PHEV) считаются как ДВС — по объёму двигателя и л.с.
_EV_TYPES = {"전기", "electric", "ev"}
_HYBRID_EV_TYPES: set[str] = set()  # гибриды → ICE-таблица


async def get_cbr_rates() -> dict:
    global _cbr_cache, _cbr_cache_time
    now = datetime.utcnow()
    if _cbr_cache_time and (now - _cbr_cache_time) < CBR_CACHE_TTL:
        return _cbr_cache

    async with aiohttp.ClientSession() as session:
        async with session.get(CBR_URL, timeout=aiohttp.ClientTimeout(total=10)) as resp:
            resp.raise_for_status()
            xml_bytes = await resp.read()

    root = ET.fromstring(xml_bytes.decode("windows-1251"))
    rates: dict[str, float] = {}
    for valute in root.findall("Valute"):
        code = valute.findtext("CharCode")
        nominal = int(valute.findtext("Nominal", "1"))
        value = float(valute.findtext("Value", "0").replace(",", "."))
        if code:
            rates[code] = value / nominal

    _cbr_cache = rates
    _cbr_cache_time = now
    return rates


def _car_age_years(car_year: int, car_month: Optional[int] = None) -> float:
    """
    Age in fractional years.
    If manufacture month is known — uses exact calculation.
    Otherwise assumes January manufacture + 2-month buffer.
    """
    now = datetime.now()
    if car_month is not None:
        age_months = (now.year - car_year) * 12 + (now.month - car_month)
    else:
        age_months = (now.year - car_year) * 12 + (now.month - 1) + 2
    return age_months / 12


def _lookup_hp(table: list, hp: int) -> tuple:
    for row in table:
        if hp <= row[0]:
            return row[1], row[2]
    return table[-1][1], table[-1][2]


def calc_utilshor(
    fuel_type: Optional[str],
    engine_volume_cc: Optional[int],
    horsepower: Optional[int],
    car_year: Optional[int],
    car_month: Optional[int] = None,
    subject_type: str = "individual",
) -> Optional[int]:
    if horsepower is None or car_year is None:
        return None

    age = _car_age_years(car_year, car_month)

    ft = (fuel_type or "").lower().strip()
    is_company = subject_type == "company"

    if ft in _EV_TYPES or ft in _HYBRID_EV_TYPES:
        table = UTILSHOR_EV_COMPANY if is_company else UTILSHOR_EV
    else:
        cc = engine_volume_cc or 2000
        if cc <= 1000:
            table = UTILSHOR_ICE_UNDER_1L_COMPANY if is_company else UTILSHOR_ICE_UNDER_1L
        elif cc <= 2000:
            table = UTILSHOR_ICE_1_2L_COMPANY if is_company else UTILSHOR_ICE_1_2L
        elif cc <= 3000:
            table = UTILSHOR_ICE_2_3L_COMPANY if is_company else UTILSHOR_ICE_2_3L
        elif cc <= 3500:
            table = UTILSHOR_ICE_3_35L
        else:
            table = UTILSHOR_ICE_OVER_35L

    coef_0_3, coef_3p = _lookup_hp(table, horsepower)

    coef = coef_0_3 if age < 3 else coef_3p

    return round(coef * UTILSHOR_BASE)


def calc_customs_duty(
    engine_volume_cc: Optional[int],
    car_year: Optional[int],
    customs_value_eur: float,
    eur_rub: float,
    car_month: Optional[int] = None,
) -> Optional[int]:
    if car_year is None or engine_volume_cc is None or eur_rub == 0:
        return None

    age = _car_age_years(car_year, car_month)
    cc = engine_volume_cc

    if age < 3:
        for max_eur, pct, min_eur_cc in DUTY_UNDER_3Y:
            if customs_value_eur <= max_eur:
                by_pct = customs_value_eur * pct * eur_rub
                by_cc = min_eur_cc * cc * eur_rub
                return round(max(by_pct, by_cc))
    elif age < 5:
        for max_cc, rate in DUTY_3_5Y:
            if cc <= max_cc:
                return round(rate * cc * eur_rub)
    else:
        for max_cc, rate in DUTY_5Y_PLUS:
            if cc <= max_cc:
                return round(rate * cc * eur_rub)

    return None


def calc_clearance_fee(customs_value_rub: float) -> int:
    for max_val, fee in CLEARANCE_FEES:
        if customs_value_rub <= max_val:
            return fee
    return CLEARANCE_FEES[-1][1]


async def calc_car_cost(car) -> dict:
    rates = await get_cbr_rates()
    krw_rub: float = rates.get("KRW", 0)
    eur_rub: float = rates.get("EUR", 0)

    fees = load_fees()
    korea_fee_won: int = fees.get("korea_fee_won", 0)

    month = getattr(car, "manufacture_month", None)

    if car.price is not None:
        price_krw = int(car.price * ENCAR_PRICE_MULTIPLIER) + korea_fee_won
        price_rub = round(price_krw * krw_rub)
        customs_value_eur = round(price_rub / eur_rub) if eur_rub else 0
        duty = calc_customs_duty(car.engine_volume, car.year, customs_value_eur, eur_rub, month)
        clearance = calc_clearance_fee(price_rub)
        seg_fees = fees.get(get_segment(price_rub), {"broker_fee": 0, "agent_fee": 0})
    else:
        price_krw = None
        price_rub = None
        customs_value_eur = None
        duty = None
        clearance = None
        seg_fees = {"broker_fee": 0, "agent_fee": 0}

    utilshor = calc_utilshor(car.fuel_type, car.engine_volume, car.horsepower, car.year, month)
    broker_fee = seg_fees.get("broker_fee", 0)
    agent_fee = seg_fees.get("agent_fee", 0)

    fixed_costs = [price_rub, utilshor, duty, clearance]
    total = (
        sum(fixed_costs) + broker_fee + agent_fee
        if all(v is not None for v in fixed_costs)
        else None
    )

    segment = get_segment(total) if total is not None else None

    return {
        "price_krw": price_krw,
        "price_rub": price_rub,
        "customs_value_eur": customs_value_eur,
        "utilshor_rub": utilshor,
        "customs_duty_rub": duty,
        "customs_clearance_rub": clearance,
        "broker_fee_rub": broker_fee,
        "agent_fee_rub": agent_fee,
        "segment": segment,
        "total_rub": total,
        "exchange_rates": {
            "krw_rub": round(krw_rub, 6),
            "eur_rub": round(eur_rub, 2),
        },
    }


# ── VTB CNY rate ───────────────────────────────────────────────────────────────

_vtb_cache: dict = {}
_vtb_cache_time: Optional[datetime] = None
_VTB_CACHE_TTL = timedelta(hours=1)

async def get_vtb_cny_rate() -> float:
    """
    Fetch VTB's CNY→RUB rate.  Falls back to CBR CNY × 1.03 if VTB is unreachable.
    """
    global _vtb_cache, _vtb_cache_time
    now = datetime.utcnow()
    if _vtb_cache_time and (now - _vtb_cache_time) < _VTB_CACHE_TTL:
        return _vtb_cache.get("CNY", 0)

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                "https://www.vtb.ru/api/currency-exchange/current-rates/",
                timeout=aiohttp.ClientTimeout(total=8),
                headers={"User-Agent": "Mozilla/5.0"},
            ) as resp:
                resp.raise_for_status()
                data = await resp.json(content_type=None)
        # Response: list of {ISOCode, RateSell, RateBuy, ...}
        for item in (data if isinstance(data, list) else data.get("rates", [])):
            if item.get("ISOCode") == "CNY":
                sell = float(item.get("RateSell", 0))
                buy  = float(item.get("RateBuy",  0))
                rate = sell or buy
                if rate > 0:
                    _vtb_cache = {"CNY": rate}
                    _vtb_cache_time = now
                    return rate
    except Exception:
        pass

    # Fallback: CBR rate + 3 % markup
    cbr = await get_cbr_rates()
    rate = cbr.get("CNY", 0) * 1.03
    _vtb_cache = {"CNY": rate}
    _vtb_cache_time = now
    return rate


# ── China car cost calculator ──────────────────────────────────────────────────

#  Константы, которые можно переопределить через fees.json
_CHINA_EXPENSES_CNY  = 15_000   # расходы по Китаю (агент, местная доставка и т.д.)
_CHINA_BANK_COMM     = 0.02     # комиссия банка 2 %
_CHINA_AUTOVOZ_RUB   = 15_000   # автовоз — прячем в clearance + broker (по 7 500 каждый)


async def calc_china_car_cost(car) -> dict:
    """
    Расчёт полной стоимости китайского авто (CNY → RUB).

    Формула:
      1. цена_cny + расходы_по_китаю(15 000 CNY)
      2. × (1 + комиссия_банка 2 %)
      3. × курс ВТБ CNY→RUB
      4. → price_rub  (таможенная стоимость, переводим в EUR для пошлины)
      5. + таможенная пошлина  (те же таблицы, что и Корея)
      6. + таможенное оформление  (+7 500 скрытый автовоз)
      7. + утильсбор
      8. + брокер  (+7 500 скрытый автовоз)
      9. = total_rub
    """
    fees = load_fees()
    month = getattr(car, "manufacture_month", None)

    vtb_cny_rub = await get_vtb_cny_rate()
    cbr_rates   = await get_cbr_rates()
    eur_rub     = cbr_rates.get("EUR", 0)

    # Настройки из fees.json (с дефолтами)
    china_exp   = fees.get("china_expenses_cny",  _CHINA_EXPENSES_CNY)
    bank_comm   = fees.get("china_bank_commission", _CHINA_BANK_COMM)
    autovoz     = fees.get("china_autovoz_rub",   _CHINA_AUTOVOZ_RUB)
    autovoz_half = autovoz // 2   # прячем в clearance + broker

    if car.price is not None and vtb_cny_rub > 0:
        total_cny   = car.price + china_exp
        price_rub   = round(total_cny * (1 + bank_comm) * vtb_cny_rub)

        customs_value_eur = round(price_rub / eur_rub) if eur_rub else 0
        duty              = calc_customs_duty(car.engine_volume, car.year,
                                              customs_value_eur, eur_rub, month)
        clearance         = calc_clearance_fee(price_rub)
        seg_fees          = fees.get(get_segment(price_rub), {"broker_fee": 0, "agent_fee": 0})
    else:
        price_rub         = None
        customs_value_eur = None
        duty              = None
        clearance         = None
        seg_fees          = {"broker_fee": 0, "agent_fee": 0}
        autovoz_half      = 0

    utilshor   = calc_utilshor(car.fuel_type, car.engine_volume,
                               car.horsepower, car.year, month)
    broker_fee = seg_fees.get("broker_fee", 0) + autovoz_half
    agent_fee  = seg_fees.get("agent_fee",  0)
    clearance_eff = (clearance or 0) + autovoz_half

    fixed = [price_rub, utilshor, duty, clearance_eff]
    total = (
        sum(fixed) + broker_fee + agent_fee
        if all(v is not None for v in fixed)
        else None
    )

    segment = get_segment(total) if total is not None else None

    return {
        "price_cny":            car.price,
        "price_rub":            price_rub,
        "customs_value_eur":    customs_value_eur,
        "utilshor_rub":         utilshor,
        "customs_duty_rub":     duty,
        "customs_clearance_rub": clearance_eff,
        "broker_fee_rub":       broker_fee,
        "agent_fee_rub":        agent_fee,
        "segment":              segment,
        "total_rub":            total,
        "exchange_rates": {
            "cny_rub_vtb": round(vtb_cny_rub, 4),
            "eur_rub":     round(eur_rub, 2),
        },
    }
