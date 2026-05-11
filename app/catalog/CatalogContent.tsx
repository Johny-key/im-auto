"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { ChevronLeft, ChevronRight, SlidersHorizontal, X, Phone, ChevronDown, ArrowUpDown } from "lucide-react";
import ConsultationModal from "@/components/landing/ConsultationModal";
import { translateBrand, translateModel, translateFuel, fixPhotoUrl } from "./translate";

/* ── Types ────────────────────────────────────────────────────── */

type Category = "all" | "ekonom" | "komfort" | "biznes" | "premium";

interface City { id: string; name: string; price: number; }
interface SegmentFees { broker_fee: number; agent_fee: number; car_markup?: number; car_markup_type?: "fixed" | "percent"; }
type FeesMap = Record<string, SegmentFees>;

interface ParserCar {
  id: string;
  manufacturer: string | null;
  model: string | null;
  badge: string | null;
  fuel_type: string | null;
  year: number | null;
  mileage: number | null;
  price: number | null;
  photos: string[] | null;
  engine_volume: number | null;
  horsepower: number | null;
  is_available: boolean;
}

interface Car {
  id: string;
  brand: string;
  model: string;
  year: number;
  priceWon: number;
  category: "Эконом" | "Комфорт" | "Бизнес" | "Премиум";
  categorySlug: "ekonom" | "komfort" | "biznes" | "premium";
  engine: string;
  mileage: string;
  photos: string[];
  engineVolumeCc: number | null;
  horsepower: number | null;
  carYear: number | null;
}

/* ── Mapping ──────────────────────────────────────────────────── */

function categoryFromWon(price: number): Car["category"] {
  if (price < 1500) return "Эконом";
  if (price < 3000) return "Комфорт";
  if (price < 6000) return "Бизнес";
  return "Премиум";
}

function categoryFromRub(rub: number): Car["category"] {
  if (rub < 1_500_000) return "Эконом";
  if (rub < 3_000_000) return "Комфорт";
  if (rub < 6_000_000) return "Бизнес";
  return "Премиум";
}

const slugMap: Record<Car["category"], Car["categorySlug"]> = {
  Эконом: "ekonom",
  Комфорт: "komfort",
  Бизнес: "biznes",
  Премиум: "premium",
};

function parseVolumeFromBadge(badge: string | null): number | null {
  if (!badge) return null;
  const m = badge.match(/(\d+\.\d+)/);
  if (!m) return null;
  const liters = parseFloat(m[1]);
  if (liters < 0.5 || liters > 8) return null;
  return Math.round(liters * 1000);
}

function mapCar(p: ParserCar): Car {
  const category = categoryFromWon(p.price ?? 0);
  const rawModel = [p.model, p.badge].filter(Boolean).join(" ");
  const engineVolumeCc = p.engine_volume ?? parseVolumeFromBadge(p.badge);
  return {
    id: p.id,
    brand: translateBrand(p.manufacturer ?? ""),
    model: translateModel(rawModel),
    year: p.year ?? 0,
    priceWon: p.price ?? 0,
    category,
    categorySlug: slugMap[category],
    engine: translateFuel(p.fuel_type),
    mileage: p.mileage ? `${p.mileage.toLocaleString("ru")} км` : "—",
    photos: (p.photos ?? []).map(fixPhotoUrl).filter(Boolean),
    engineVolumeCc,
    horsepower: p.horsepower ?? null,
    carYear: p.year,
  };
}

/* ── Config ───────────────────────────────────────────────────── */

const categoryConfig: Record<string, { label: string; accent: string }> = {
  all:     { label: "Все категории", accent: "#D4AF37" },
  ekonom:  { label: "Эконом",        accent: "#4ade80" },
  komfort: { label: "Комфорт",        accent: "#60a5fa" },
  biznes:  { label: "Бизнес",         accent: "#c084fc" },
  premium: { label: "Премиум",        accent: "#D4AF37" },
};

const categoryColors: Record<string, string> = {
  Эконом:  "#4ade80",
  Комфорт: "#60a5fa",
  Бизнес:  "#c084fc",
  Премиум: "#D4AF37",
};

/* ── Component ────────────────────────────────────────────────── */

export default function CatalogContent() {
  const searchParams = useSearchParams();
  const initialCat = (searchParams.get("category") ?? "all") as Category;

  const [activeCategory, setActiveCategory] = useState<Category>(initialCat);
  const [selectedBrand, setSelectedBrand] = useState<string>("");
  const [yearFrom, setYearFrom] = useState<number | "">("");
  const [yearTo, setYearTo] = useState<number | "">("");
  const [priceSort, setPriceSort] = useState<"asc" | "desc" | "">("");
  const [modalOpen, setModalOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [allCars, setAllCars] = useState<Car[]>([]);
  const [visibleCount, setVisibleCount] = useState(30);
  const [loading, setLoading] = useState(true);
  const [bgLoading, setBgLoading] = useState(false);
  const [bgTotal, setBgTotal] = useState(0);
  const [error, setError] = useState(false);
  const [wonRate, setWonRate] = useState(650);
  const [eurRate, setEurRate] = useState(95);
  const [koreaFeeWon, setKoreaFeeWon] = useState(2500000);
  const [cities, setCities] = useState<City[]>([]);
  const [fees, setFees] = useState<FeesMap>({});

  const PAGE_SIZE = 200;

  useEffect(() => {
    let cancelled = false;

    const loadAll = async () => {
      try {
        const first = await fetch(`/api/catalog/cars?limit=${PAGE_SIZE}&offset=0`).then(r => r.json());
        if (cancelled) return;
        if (!first.items) { setError(true); return; }

        const total: number = first.total ?? 0;
        const initial = first.items.map(mapCar);
        setAllCars(initial);
        setBgTotal(total);
        setLoading(false);

        if (initial.length >= total) return;

        setBgLoading(true);
        let offset = PAGE_SIZE;
        while (offset < total) {
          if (cancelled) return;
          const page = await fetch(`/api/catalog/cars?limit=${PAGE_SIZE}&offset=${offset}`).then(r => r.json()).catch(() => null);
          if (cancelled) return;
          if (page?.items) {
            setAllCars(prev => [...prev, ...page.items.map(mapCar)]);
          }
          offset += PAGE_SIZE;
        }
        setBgLoading(false);
      } catch {
        if (!cancelled) { setError(true); setLoading(false); }
      }
    };

    loadAll();

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    fetch("/api/admin/rate")
      .then((r) => r.json())
      .then((d) => {
        if (d.wonRate) setWonRate(d.wonRate);
        if (d.eurRate) setEurRate(d.eurRate);
      })
      .catch(() => {});

    fetch("/api/catalog/cities")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setCities(d); })
      .catch(() => {});

    fetch("/api/catalog/fees")
      .then((r) => r.json())
      .then((d) => {
        if (d && typeof d === "object") {
          setFees(d);
          if (typeof d.korea_fee_won === "number") setKoreaFeeWon(d.korea_fee_won);
        }
      })
      .catch(() => {});
  }, []);

  // korea_fee_won is stored in raw won; encar prices are in 万₩ (10 000 won)
  const koreaFeeMaWon = koreaFeeWon / 10_000;

  const filtered = useMemo(() => {
    let list = allCars.filter(isCalculable);
    if (selectedBrand) list = list.filter(car => car.brand === selectedBrand);
    if (yearFrom !== "") list = list.filter(car => car.year >= (yearFrom as number));
    if (yearTo !== "") list = list.filter(car => car.year <= (yearTo as number));
    if (activeCategory !== "all") {
      list = list.filter(car => {
        const segFees = fees[car.category] ?? { broker_fee: 25_000, agent_fee: 180_000 };
        const costs = calcCosts(car.priceWon + koreaFeeMaWon, wonRate, eurRate, segFees.broker_fee, segFees.agent_fee, car.engineVolumeCc, car.horsepower, car.engine, car.carYear, segFees.car_markup ?? 0, segFees.car_markup_type ?? "fixed");
        return costs ? slugMap[categoryFromRub(costs.total)] === activeCategory : false;
      });
    }
    if (priceSort) {
      list = [...list].sort((a, b) => {
        const getTotal = (car: Car) => {
          const segFees = fees[car.category] ?? { broker_fee: 25_000, agent_fee: 180_000 };
          const costs = calcCosts(car.priceWon + koreaFeeMaWon, wonRate, eurRate, segFees.broker_fee, segFees.agent_fee, car.engineVolumeCc, car.horsepower, car.engine, car.carYear, segFees.car_markup ?? 0, segFees.car_markup_type ?? "fixed");
          return costs?.total ?? 0;
        };
        return priceSort === "asc" ? getTotal(a) - getTotal(b) : getTotal(b) - getTotal(a);
      });
    }
    return list;
  }, [allCars, activeCategory, selectedBrand, yearFrom, yearTo, priceSort, wonRate, eurRate, fees, koreaFeeMaWon]);

  // Reset visible count when filters change
  useEffect(() => { setVisibleCount(30); }, [activeCategory, selectedBrand, yearFrom, yearTo, priceSort]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  const brands = useMemo(() => {
    const calculable = allCars.filter(isCalculable);
    return Array.from(new Set(calculable.map(c => c.brand))).sort((a, b) => a.localeCompare(b, "ru"));
  }, [allCars]);

  const availableYears = useMemo(() => {
    const calculable = allCars.filter(isCalculable);
    const years = Array.from(new Set(calculable.map(c => c.year).filter(y => y > 2000))).sort((a, b) => b - a);
    return years;
  }, [allCars]);

  const hasActiveFilters = activeCategory !== "all" || selectedBrand !== "" || yearFrom !== "" || yearTo !== "" || priceSort !== "";

  const resetFilters = () => { setActiveCategory("all"); setSelectedBrand(""); setYearFrom(""); setYearTo(""); setPriceSort(""); };

  const categories: Category[] = ["all", "ekonom", "komfort", "biznes", "premium"];

  return (
    <>
      {/* ── Hero banner ── */}
      <section className="pt-28 pb-14 relative overflow-hidden">
        <div className="absolute inset-0 racing-stripe-bg opacity-40 pointer-events-none" />
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-[#D4AF37]/[0.04] blur-[100px] pointer-events-none" />

        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <div className="flex items-center gap-2 text-[#8892A4] text-sm mb-6">
            <a href="/" className="hover:text-[#D4AF37] transition-colors">Главная</a>
            <ChevronRight size={14} />
            <span className="text-[#F0EDE8]">Каталог</span>
          </div>

          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="h-px w-8 bg-[#D4AF37]" />
                <span className="text-[#D4AF37] text-xs tracking-[0.3em] uppercase font-display">Каталог</span>
              </div>
              <h1 className="font-display text-5xl md:text-6xl text-[#F0EDE8]">
                АВТО ИЗ-ЗА{" "}
                <span className="shimmer-text">РУБЕЖА</span>
              </h1>
            </div>
            {!loading && !error && (
              <div className="flex items-center gap-3">
                <p className="text-[#8892A4] text-sm max-w-xs leading-relaxed">
                  {filtered.length}{" "}
                  {filtered.length === 1 ? "автомобиль" : filtered.length < 5 ? "автомобиля" : "автомобилей"} в наличии
                </p>
                {bgLoading && (
                  <span className="flex items-center gap-1.5 text-[#8892A4]/60 text-xs">
                    <span className="w-3 h-3 border border-[#D4AF37]/30 border-t-[#D4AF37]/70 rounded-full animate-spin" />
                    загружаем {allCars.length} / {bgTotal}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Filters ── */}
      <section className="sticky top-[72px] z-30 bg-[#0A0F1E]/95 backdrop-blur-md border-b border-[rgba(212,175,55,0.1)]">
        <div className="max-w-6xl mx-auto px-6">
          {/* Desktop */}
          <div className="hidden md:block">
            {/* Category row */}
            <div className="flex items-center gap-0 pt-3 pb-2 overflow-x-auto">
              <div className="flex gap-2 shrink-0">
                {categories.map((cat) => {
                  const conf = categoryConfig[cat];
                  const isActive = activeCategory === cat;
                  return (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      className="relative text-xs px-4 py-2 uppercase tracking-widest font-display transition-all duration-200 whitespace-nowrap"
                      style={{
                        color: isActive ? conf.accent : "#8892A4",
                        border: `1px solid ${isActive ? conf.accent + "60" : "rgba(212,175,55,0.1)"}`,
                        background: isActive ? conf.accent + "12" : "transparent",
                      }}
                    >
                      {conf.label}
                    </button>
                  );
                })}
              </div>

              {hasActiveFilters && (
                <button
                  onClick={resetFilters}
                  className="ml-auto shrink-0 flex items-center gap-1.5 text-[#8892A4] hover:text-[#F0EDE8] text-xs transition-colors"
                >
                  <X size={12} />
                  Сбросить
                </button>
              )}
            </div>

            {/* Brand combobox + year + sort */}
            <div className="flex items-center gap-3 pb-3">
              {brands.length > 0 && (
                <div className="w-52">
                  <BrandCombobox brands={brands} value={selectedBrand} onChange={setSelectedBrand} />
                </div>
              )}
              {availableYears.length > 0 && (
                <YearRangeFilter
                  years={availableYears}
                  from={yearFrom}
                  to={yearTo}
                  onFromChange={setYearFrom}
                  onToChange={setYearTo}
                />
              )}
              <PriceSortButton value={priceSort} onChange={setPriceSort} />
            </div>
          </div>

          {/* Mobile */}
          <div className="flex md:hidden items-center justify-between py-3">
            <span className="text-[#8892A4] text-sm">{filtered.length} авто</span>
            <button
              onClick={() => setFiltersOpen(!filtersOpen)}
              className="flex items-center gap-2 text-[#D4AF37] text-sm border border-[#D4AF37]/30 px-4 py-2"
            >
              <SlidersHorizontal size={14} />
              Фильтры
              {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-[#D4AF37]" />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {filtersOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="md:hidden overflow-hidden border-t border-[rgba(212,175,55,0.1)]"
            >
              <div className="px-6 py-4 space-y-4">
                <div>
                  <div className="text-xs text-[#8892A4] uppercase tracking-wider mb-2">Категория</div>
                  <div className="flex flex-wrap gap-2">
                    {categories.map((cat) => {
                      const conf = categoryConfig[cat];
                      const isActive = activeCategory === cat;
                      return (
                        <button
                          key={cat}
                          onClick={() => { setActiveCategory(cat); }}
                          className="text-xs px-3 py-1.5 font-display transition-all"
                          style={{
                            color: isActive ? conf.accent : "#8892A4",
                            border: `1px solid ${isActive ? conf.accent + "60" : "rgba(212,175,55,0.1)"}`,
                            background: isActive ? conf.accent + "12" : "transparent",
                          }}
                        >
                          {conf.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {brands.length > 0 && (
                  <div>
                    <div className="text-xs text-[#8892A4] uppercase tracking-wider mb-2">Марка</div>
                    <BrandCombobox brands={brands} value={selectedBrand} onChange={setSelectedBrand} />
                  </div>
                )}

                {availableYears.length > 0 && (
                  <div>
                    <div className="text-xs text-[#8892A4] uppercase tracking-wider mb-2">Год выпуска</div>
                    <YearRangeFilter
                      years={availableYears}
                      from={yearFrom}
                      to={yearTo}
                      onFromChange={setYearFrom}
                      onToChange={setYearTo}
                    />
                  </div>
                )}

                <div>
                  <div className="text-xs text-[#8892A4] uppercase tracking-wider mb-2">Сортировка по цене</div>
                  <PriceSortButton value={priceSort} onChange={setPriceSort} />
                </div>

                {hasActiveFilters && (
                  <button
                    onClick={() => { resetFilters(); setFiltersOpen(false); }}
                    className="flex items-center gap-1.5 text-[#8892A4] hover:text-[#F0EDE8] text-xs transition-colors"
                  >
                    <X size={12} />
                    Сбросить все фильтры
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* ── Grid ── */}
      <section className="py-12">
        <div className="max-w-6xl mx-auto px-6">

          {loading && <SkeletonGrid />}

          {error && !loading && (
            <div className="text-center py-24">
              <div className="text-[#D4AF37]/20 text-8xl font-display mb-4">!</div>
              <p className="text-[#8892A4]">Не удалось загрузить каталог. Попробуйте позже.</p>
            </div>
          )}

          {!loading && !error && (
            <AnimatePresence mode="wait">
              {filtered.length === 0 ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center py-24"
                >
                  <div className="text-[#D4AF37]/20 text-8xl font-display mb-4">∅</div>
                  <p className="text-[#8892A4] mb-6">Ничего не найдено по выбранным фильтрам</p>
                  <button
                    onClick={() => setActiveCategory("all")}
                    className="text-[#D4AF37] border border-[#D4AF37]/30 px-6 py-2 text-sm hover:bg-[#D4AF37]/10 transition-colors"
                  >
                    Сбросить фильтры
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key={activeCategory}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                >
                  {visible.map((car, i) => (
                    <CarCard key={car.id} car={car} index={i} wonRate={wonRate} eurRate={eurRate} koreaFeeMaWon={koreaFeeMaWon} cities={cities} fees={fees} onConsult={() => setModalOpen(true)} />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          )}

          {/* Show more */}
          {!loading && !error && hasMore && (
            <div className="flex justify-center mt-10">
              <button
                onClick={() => setVisibleCount(c => c + 30)}
                className="flex items-center gap-2 border border-[#D4AF37]/40 text-[#D4AF37] px-8 py-3 text-sm font-display uppercase tracking-widest hover:bg-[#D4AF37]/10 transition-all duration-200"
              >
                Показать ещё ({filtered.length - visibleCount} осталось)
              </button>
            </div>
          )}

          {/* CTA */}
          <motion.div
            className="mt-16 relative overflow-hidden border border-[rgba(212,175,55,0.2)] bg-[#0F1629] p-10 text-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="absolute inset-0 racing-stripe-bg opacity-50 pointer-events-none" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-32 bg-[#D4AF37]/[0.04] blur-[60px] pointer-events-none" />
            <div className="relative z-10">
              <div className="text-xs text-[#D4AF37] tracking-[0.3em] uppercase font-display mb-3">Не нашли подходящий?</div>
              <h2 className="font-display text-3xl md:text-4xl text-[#F0EDE8] mb-4">
                ПОДБЕРЁМ <span className="shimmer-text">ПОД ВАС</span>
              </h2>
              <p className="text-[#8892A4] mb-8 max-w-md mx-auto text-sm leading-relaxed">
                Оставьте заявку — менеджер найдёт именно тот автомобиль, который вы ищете, по вашему бюджету и требованиям.
              </p>
              <button
                onClick={() => setModalOpen(true)}
                className="inline-flex items-center gap-2 bg-[#D4AF37] text-[#0A0F1E] font-display font-bold text-sm px-8 py-3.5 uppercase tracking-widest hover:bg-[#F0D060] transition-colors"
              >
                <Phone size={15} />
                Получить консультацию
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      <ConsultationModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}

/* ── Skeleton ─────────────────────────────────────────────────── */

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="bg-[#0F1629] border border-[rgba(212,175,55,0.08)] overflow-hidden animate-pulse">
          <div className="h-44 bg-[#1a2035]" />
          <div className="p-5 space-y-3">
            <div className="h-4 bg-[#1a2035] rounded w-3/4" />
            <div className="h-3 bg-[#1a2035] rounded w-1/2" />
            <div className="h-px bg-[#1a2035]" />
            <div className="h-4 bg-[#1a2035] rounded w-1/3 ml-auto" />
            <div className="h-9 bg-[#1a2035] rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Cost calculator ─────────────────────────────────────────── */

// До 3 лет: max(% от цены, мин. €/см³) × курс EUR
const DUTY_UNDER_3Y = [
  { maxEur: 8_500,    pct: 0.54, minPerCc: 2.5 },
  { maxEur: 16_700,   pct: 0.48, minPerCc: 3.5 },
  { maxEur: 42_300,   pct: 0.48, minPerCc: 5.5 },
  { maxEur: 84_500,   pct: 0.48, minPerCc: 7.5 },
  { maxEur: 169_000,  pct: 0.48, minPerCc: 15.0 },
  { maxEur: Infinity, pct: 0.48, minPerCc: 20.0 },
];
// 3–5 лет: фиксированные €/см³
const DUTY_3_5Y = [
  { maxCc: 1000,     rate: 1.5 },
  { maxCc: 1500,     rate: 1.7 },
  { maxCc: 1800,     rate: 2.5 },
  { maxCc: 2300,     rate: 2.7 },
  { maxCc: 3000,     rate: 3.0 },
  { maxCc: Infinity, rate: 3.6 },
];
// 5+ лет: повышенные €/см³ (берём min с 48% от цены)
const DUTY_5Y_PLUS = [
  { maxCc: 1000,     rate: 3.0 },
  { maxCc: 1500,     rate: 3.2 },
  { maxCc: 1800,     rate: 3.5 },
  { maxCc: 2300,     rate: 4.8 },
  { maxCc: 3000,     rate: 5.0 },
  { maxCc: Infinity, rate: 5.7 },
];

function calcDuty(
  priceRub: number,
  eurRate: number,
  cc: number | null,
  carYear: number | null,
): number {
  const age = carYear ? new Date().getFullYear() - carYear : 4;
  const priceEur = eurRate > 0 ? priceRub / eurRate : 0;

  if (!cc) {
    // нет данных о двигателе — грубая оценка
    return Math.round(priceRub * 0.15);
  }

  if (age <= 3) {
    const row = DUTY_UNDER_3Y.find(r => priceEur <= r.maxEur) ?? DUTY_UNDER_3Y.at(-1)!;
    const byPct = priceEur * row.pct;
    const byMin = row.minPerCc * cc;
    return Math.round(Math.max(byPct, byMin) * eurRate);
  }

  if (age <= 5) {
    const row = DUTY_3_5Y.find(r => cc <= r.maxCc) ?? DUTY_3_5Y.at(-1)!;
    return Math.round(row.rate * cc * eurRate);
  }

  // 5+ лет
  const row = DUTY_5Y_PLUS.find(r => cc <= r.maxCc) ?? DUTY_5Y_PLUS.at(-1)!;
  const byCc   = row.rate * cc * eurRate;
  const by48   = priceEur * 0.48 * eurRate;
  return Math.round(Math.min(byCc, by48));
}

// Таможенный сбор (гос. плата) по цене авто в ₽
const CLEARANCE_TABLE = [
  { maxRub: 200_000,    fee: 1_231 },
  { maxRub: 450_000,    fee: 2_462 },
  { maxRub: 1_200_000,  fee: 4_924 },
  { maxRub: 2_700_000,  fee: 13_541 },
  { maxRub: 4_200_000,  fee: 18_465 },
  { maxRub: 5_500_000,  fee: 21_344 },
  { maxRub: 10_000_000, fee: 49_240 },
  { maxRub: Infinity,   fee: 73_860 },
];

function calcClearance(priceRub: number): number {
  return (CLEARANCE_TABLE.find(r => priceRub <= r.maxRub) ?? CLEARANCE_TABLE.at(-1)!).fee;
}

// ── Утильсбор (физлица, с 01.01.2026, базовая ставка 20 000 ₽) ──────────────
// Возвращает null: нет нужных данных или авто вне таблицы (>5 лет, >3 л ДВС)

const RECYCLING_EV = [
  { maxHp: 80,       s03: 3_400,     s35: 5_200 },
  { maxHp: 100,      s03: 991_200,   s35: 1_641_600 },
  { maxHp: 130,      s03: 1_317_600, s35: 1_912_800 },
  { maxHp: 160,      s03: 1_560_000, s35: 2_227_200 },
  { maxHp: 190,      s03: 1_848_000, s35: 2_594_400 },
  { maxHp: 220,      s03: 2_193_600, s35: 3_024_000 },
  { maxHp: 250,      s03: 2_599_200, s35: 3_523_200 },
  { maxHp: 280,      s03: 3_079_200, s35: 4_104_000 },
  { maxHp: Infinity, s03: 3_648_000, s35: 4_780_800 },
];

// ≤2000 см³ (ДВС): ≤160 л.с. — льготная ставка
const RECYCLING_UNDER_2L = [
  { maxHp: 160,      s03: 3_400,     s35: 5_200 },
  { maxHp: 190,      s03: 900_000,   s35: 1_492_800 },
  { maxHp: 220,      s03: 952_800,   s35: 1_584_000 },
  { maxHp: 250,      s03: 1_010_400, s35: 1_677_600 },
  { maxHp: 280,      s03: 1_142_400, s35: 1_838_400 },
  { maxHp: 310,      s03: 1_291_200, s35: 2_011_200 },
  { maxHp: 340,      s03: 1_459_200, s35: 2_203_200 },
  { maxHp: 370,      s03: 1_663_200, s35: 2_412_000 },
  { maxHp: 400,      s03: 1_896_000, s35: 2_640_000 },
  { maxHp: 430,      s03: 2_160_000, s35: 2_892_000 },
  { maxHp: 460,      s03: 2_464_800, s35: 3_168_000 },
  { maxHp: 500,      s03: 2_808_000, s35: 3_468_000 },
  { maxHp: Infinity, s03: 3_201_600, s35: 3_796_800 },
];

// 2001–3000 см³ (ДВС): ≤160 л.с. — льготная ставка
const RECYCLING_2_3L = [
  { maxHp: 160,      s03: 3_400,     s35: 5_200 },
  { maxHp: 190,      s03: 2_306_800, s35: 3_456_000 },
  { maxHp: 220,      s03: 2_364_000, s35: 3_501_600 },
  { maxHp: 250,      s03: 2_402_400, s35: 3_552_000 },
  { maxHp: 280,      s03: 2_520_000, s35: 3_660_000 },
  { maxHp: 310,      s03: 2_620_800, s35: 3_770_400 },
  { maxHp: 340,      s03: 2_726_400, s35: 3_873_600 },
  { maxHp: 370,      s03: 2_834_400, s35: 3_981_600 },
  { maxHp: 400,      s03: 2_949_600, s35: 4_094_400 },
  { maxHp: 430,      s03: 3_067_200, s35: 4_209_600 },
  { maxHp: 460,      s03: 3_189_600, s35: 4_327_200 },
  { maxHp: 500,      s03: 3_316_800, s35: 4_447_200 },
  { maxHp: Infinity, s03: 3_448_800, s35: 4_572_000 },
];

const EV_FUEL_TYPES = ["Электро", "Гибрид", "Плагин-гибрид"];

function pickRecyclingSum(
  table: { maxHp: number; s03: number; s35: number }[],
  hp: number,
  age: number,
): number {
  const row = table.find(r => hp <= r.maxHp) ?? table.at(-1)!;
  return age <= 3 ? row.s03 : row.s35;
}

function calcRecycling(
  cc: number | null,
  hp: number | null,
  engine: string,
  carYear: number | null,
): number | null {
  if (cc === null || carYear === null) return null;
  const age = new Date().getFullYear() - carYear;
  if (age < 0 || age > 5) return null;
  const effectiveHp = hp ?? 160;
  const isEv = EV_FUEL_TYPES.includes(engine);
  if (isEv) return pickRecyclingSum(RECYCLING_EV, effectiveHp, age);
  if (cc > 3000) return null;
  if (cc <= 2000) return pickRecyclingSum(RECYCLING_UNDER_2L, effectiveHp, age);
  return pickRecyclingSum(RECYCLING_2_3L, effectiveHp, age);
}

function isCalculable(car: Car): boolean {
  return calcRecycling(car.engineVolumeCc, car.horsepower, car.engine, car.carYear) !== null;
}

function calcCosts(
  priceWon: number,
  wonRate: number,
  eurRate: number,
  broker: number,
  agent: number,
  engineVolumeCc: number | null,
  horsepower: number | null,
  engine: string,
  carYear: number | null,
  carMarkup: number = 0,
  carMarkupType: "fixed" | "percent" = "fixed",
) {
  const recycling = calcRecycling(engineVolumeCc, horsepower, engine, carYear);
  if (recycling === null) return null;
  const priceRub    = Math.round(priceWon * wonRate);
  const markupRub   = carMarkupType === "percent"
    ? Math.round(priceRub * carMarkup / 100)
    : carMarkup;
  const displayPrice = priceRub + markupRub;
  const duty        = calcDuty(priceRub, eurRate, engineVolumeCc, carYear);
  const clearance   = calcClearance(priceRub);
  const total       = displayPrice + recycling + duty + clearance + broker + agent;

  return { priceRub: displayPrice, recycling, duty, clearance, broker, agent, total };
}

/* ── Card ─────────────────────────────────────────────────────── */

function CarCard({ car, index, wonRate, eurRate, koreaFeeMaWon, cities, fees, onConsult }: {
  car: Car; index: number; wonRate: number; eurRate: number; koreaFeeMaWon: number; cities: City[]; fees: FeesMap; onConsult: () => void;
}) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [selectedCityId, setSelectedCityId] = useState("");
  const total = car.photos.length;
  const effectivePriceWon = car.priceWon + koreaFeeMaWon;
  const segFees = fees[car.category] ?? { broker_fee: 25_000, agent_fee: 180_000 };
  const costs = calcCosts(effectivePriceWon, wonRate, eurRate, segFees.broker_fee, segFees.agent_fee, car.engineVolumeCc, car.horsepower, car.engine, car.carYear, segFees.car_markup ?? 0, segFees.car_markup_type ?? "fixed")!;
  const displayCategory = categoryFromRub(costs.total);
  const accent = categoryColors[displayCategory] ?? "#D4AF37";
  const fmt = (n: number) => `~${n.toLocaleString("ru")} ₽`;
  const selectedCity = cities.find((c) => c.id === selectedCityId) ?? null;

  const go = (dir: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setDirection(dir);
    setPhotoIndex((prev) => (prev + dir + total) % total);
  };

  return (
    <motion.div
      className="group relative"
      style={{ perspective: "1200px", minHeight: "490px" }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.4 }}
      whileHover={{ y: -4 }}
    >
      {/* Flip container */}
      <div
        className="absolute inset-0"
        style={{
          transformStyle: "preserve-3d",
          transition: "transform 0.65s cubic-bezier(0.16,1,0.3,1)",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >

        {/* ── FRONT ── */}
        <div
          className="absolute inset-0 bg-[#0F1629] border border-[rgba(212,175,55,0.08)] overflow-hidden neon-border flex flex-col"
          style={{ backfaceVisibility: "hidden" }}
        >
          {/* Photo carousel */}
          <div className="relative w-full h-60 overflow-hidden shrink-0 bg-[#0d1225]">
            {total > 0 ? (
              <AnimatePresence initial={false} custom={direction}>
                <motion.div
                  key={photoIndex}
                  custom={direction}
                  variants={{
                    enter: (d: number) => ({ x: d > 0 ? "100%" : "-100%", opacity: 0 }),
                    center: { x: 0, opacity: 1 },
                    exit: (d: number) => ({ x: d > 0 ? "-100%" : "100%", opacity: 0 }),
                  }}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute inset-0"
                >
                  <Image
                    src={car.photos[photoIndex]}
                    alt={`${car.brand} ${car.model}`}
                    fill
                    unoptimized
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  />
                </motion.div>
              </AnimatePresence>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[#D4AF37]/10 text-6xl font-display">AUTO</span>
              </div>
            )}

            <div className="absolute inset-0 bg-gradient-to-b from-[#0A0F1E]/10 via-transparent to-[#0F1629]/80 pointer-events-none" />

            {total > 1 && (
              <>
                <button
                  onClick={(e) => go(-1, e)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-[#D4AF37]/30 hover:text-[#D4AF37]"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  onClick={(e) => go(1, e)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-[#D4AF37]/30 hover:text-[#D4AF37]"
                >
                  <ChevronRight size={18} />
                </button>
              </>
            )}

            {total > 1 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 pointer-events-none">
                {car.photos.map((_, i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full transition-all duration-200"
                    style={{ background: i === photoIndex ? accent : "rgba(255,255,255,0.35)" }}
                  />
                ))}
              </div>
            )}

            {total > 1 && (
              <div className="absolute bottom-3 right-3 text-[10px] text-white/60 bg-black/50 px-2 py-0.5 font-display tracking-wider pointer-events-none">
                {photoIndex + 1} / {total}
              </div>
            )}

            <div className="absolute top-3 left-3 text-[10px] text-[#8892A4] border border-[#8892A4]/20 px-2 py-0.5 bg-[#0A0F1E]/70 backdrop-blur-sm font-display tracking-wider">
              Корея
            </div>
            <div
              className="absolute top-3 right-3 text-[10px] px-2 py-0.5 font-display tracking-wider backdrop-blur-sm"
              style={{ color: accent, border: `1px solid ${accent}30`, background: `${accent}12` }}
            >
              {displayCategory}
            </div>
          </div>

          {/* Info */}
          <div className="flex flex-col flex-1 p-6">
            <div className="mb-3">
              <div className="font-display text-lg text-[#F0EDE8] leading-tight line-clamp-1">{car.brand}</div>
              <div className="text-[#8892A4] text-sm mt-0.5 line-clamp-1">{car.model}</div>
              <div className="text-[#8892A4] text-xs mt-1.5 tracking-wide">
                {car.year > 0 ? car.year : "—"} · {car.mileage}
              </div>
            </div>

            <div className="h-px my-3" style={{ background: `linear-gradient(90deg, ${accent}30, transparent)` }} />

            <div className="flex items-center justify-between mb-5">
              <span className="text-[#8892A4] text-xs uppercase tracking-wider">Под ключ в РФ</span>
              <span className="font-bold text-base shimmer-text">
                {car.priceWon > 0 ? `~${costs.total.toLocaleString("ru")} ₽` : "—"}
              </span>
            </div>

            <div className="mt-auto flex gap-2">
              <button
                onClick={() => setFlipped(true)}
                className="flex-1 py-3 text-xs uppercase tracking-widest font-display transition-all duration-200 border"
                style={{ color: "#D4AF37", borderColor: "#D4AF3740", background: "transparent" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#D4AF3715"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
              >
                Расчёт
              </button>
              <button
                onClick={onConsult}
                className="flex-1 py-3 text-xs uppercase tracking-widest font-display transition-all duration-200 border"
                style={{ color: accent, borderColor: `${accent}35`, background: "transparent" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = `${accent}15`; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
              >
                Узнать условия
              </button>
            </div>
          </div>

          <div
            className="absolute bottom-0 left-0 right-0 h-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
          />
        </div>

        {/* ── BACK ── */}
        <div
          className="absolute inset-0 bg-[#0A0F1E] border border-[rgba(212,175,55,0.15)] flex flex-col overflow-hidden"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-5 py-3.5 shrink-0 border-b"
            style={{ borderColor: `${accent}20` }}
          >
            <button
              onClick={() => setFlipped(false)}
              className="flex items-center gap-1 text-[#8892A4] hover:text-[#F0EDE8] text-xs transition-colors font-display tracking-wider"
            >
              <ChevronLeft size={13} />
              Назад
            </button>
            <span className="text-[10px] tracking-[0.3em] uppercase font-display" style={{ color: accent }}>
              Расчёт стоимости
            </span>
          </div>

          {/* Rows */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <div className="text-[9px] text-[#8892A4] uppercase tracking-[0.25em] mb-3 font-display">
              Детализация цены
            </div>

            <div className="flex items-start justify-between py-2.5 border-b border-white/[0.05]">
              <span className="text-[#8892A4] text-xs">Цена автомобиля и расходы в Корее</span>
              <span className="text-[#F0EDE8] text-xs font-display">
                ≈ {costs.priceRub.toLocaleString("ru")} ₽
              </span>
            </div>

            <CostRow label="Утильсбор"             value={fmt(costs.recycling)} accent={accent} />
            <CostRow label="Таможенная пошлина"    value={fmt(costs.duty)}      accent={accent} />
            <CostRow label="Таможенное оформление" value={fmt(costs.clearance)} accent={accent} />
            <CostRow label="Таможенный брокер"     value={fmt(costs.broker)}    accent={accent} />
            <CostRow label="Услуги агента"         value={fmt(costs.agent)}     accent={accent} last />
          </div>

          {/* City selector */}
          <div className="px-5 py-3 shrink-0 border-t" style={{ borderColor: `${accent}20` }}>
            <div className="text-[9px] text-[#8892A4] uppercase tracking-[0.25em] mb-2 font-display">
              Автовоз до города
            </div>
            {cities.length > 0 ? (
              <div className="flex items-center gap-2">
                <select
                  value={selectedCityId}
                  onChange={(e) => setSelectedCityId(e.target.value)}
                  className="flex-1 bg-[#070B17] border border-[rgba(212,175,55,0.2)] text-[#F0EDE8] px-3 py-2 text-xs outline-none focus:border-[#D4AF37] transition-colors appearance-none"
                  style={{ color: selectedCityId ? "#F0EDE8" : "#8892A4" }}
                >
                  <option value="">Выберите город...</option>
                  {cities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — ~{c.price.toLocaleString("ru")} ₽
                    </option>
                  ))}
                </select>
                {selectedCity && (
                  <button
                    onClick={() => setSelectedCityId("")}
                    className="text-[#8892A4] hover:text-[#F0EDE8] transition-colors shrink-0"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ) : (
              <p className="text-[#4a5568] text-[11px]">Города не настроены</p>
            )}
          </div>

          {/* Total */}
          <div className="px-5 py-3.5 shrink-0 border-t" style={{ borderColor: `${accent}20` }}>
            {selectedCity && (
              <div className="flex items-center justify-between text-[11px] mb-1.5 text-[#8892A4]">
                <span>Без автовоза</span>
                <span>~{costs.total.toLocaleString("ru")} ₽</span>
              </div>
            )}
            {selectedCity && (
              <div className="flex items-center justify-between text-[11px] mb-2 text-[#8892A4]">
                <span>Автовоз до {selectedCity.name}</span>
                <span>~{selectedCity.price.toLocaleString("ru")} ₽</span>
              </div>
            )}
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-[#8892A4] text-[10px] uppercase tracking-wider font-display">
                {selectedCity ? "Итого" : "Без автовоза"}
              </span>
              <span className="font-bold text-lg shimmer-text">
                ~{(costs.total + (selectedCity?.price ?? 0)).toLocaleString("ru")} ₽
              </span>
            </div>
            <p className="text-[#4a5568] text-[10px]">
              Расчёт ориентировочный. Уточняйте у менеджера.
            </p>
          </div>
        </div>

      </div>
    </motion.div>
  );
}

/* ── PriceSortButton ─────────────────────────────────────────── */

function PriceSortButton({ value, onChange }: {
  value: "asc" | "desc" | "";
  onChange: (v: "asc" | "desc" | "") => void;
}) {
  const cycle = () => {
    if (value === "") onChange("asc");
    else if (value === "asc") onChange("desc");
    else onChange("");
  };

  const label = value === "asc" ? "Цена ↑" : value === "desc" ? "Цена ↓" : "Цена";
  const active = value !== "";

  return (
    <button
      onClick={cycle}
      className="flex items-center gap-1.5 text-xs px-3 py-2 font-display tracking-wide transition-all duration-200 shrink-0 whitespace-nowrap"
      style={{
        color: active ? "#D4AF37" : "#8892A4",
        border: `1px solid ${active ? "#D4AF3760" : "rgba(212,175,55,0.2)"}`,
        background: active ? "#D4AF3710" : "transparent",
      }}
    >
      <ArrowUpDown size={11} />
      {label}
    </button>
  );
}

/* ── YearRangeFilter ─────────────────────────────────────────── */

function YearRangeFilter({ years, from, to, onFromChange, onToChange }: {
  years: number[];
  from: number | "";
  to: number | "";
  onFromChange: (v: number | "") => void;
  onToChange: (v: number | "") => void;
}) {
  const selectCls = "bg-[#070B17] border border-[rgba(212,175,55,0.2)] text-xs font-display text-[#F0EDE8] px-2 py-2 outline-none focus:border-[#D4AF37] transition-colors appearance-none cursor-pointer";

  return (
    <div className="flex items-center gap-2">
      <select
        value={from}
        onChange={(e) => onFromChange(e.target.value ? Number(e.target.value) : "")}
        className={selectCls}
        style={{ color: from ? "#F0EDE8" : "#8892A4" }}
      >
        <option value="">От года</option>
        {[...years].reverse().map(y => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
      <span className="text-[#8892A4] text-xs">—</span>
      <select
        value={to}
        onChange={(e) => onToChange(e.target.value ? Number(e.target.value) : "")}
        className={selectCls}
        style={{ color: to ? "#F0EDE8" : "#8892A4" }}
      >
        <option value="">До года</option>
        {years.map(y => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </div>
  );
}

/* ── BrandCombobox ───────────────────────────────────────────── */

function BrandCombobox({ brands, value, onChange }: {
  brands: string[];
  value: string;
  onChange: (brand: string) => void;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return brands;
    return brands.filter(b => b.toLowerCase().includes(q));
  }, [brands, query]);

  // sync input when external value changes (e.g. reset)
  useEffect(() => { setQuery(value); }, [value]);

  // close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        // revert input to current selection if user typed but didn't pick
        setQuery(value);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [value]);

  const select = (brand: string) => {
    onChange(brand);
    setQuery(brand);
    setOpen(false);
  };

  const clear = () => {
    onChange("");
    setQuery("");
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className="relative">
      <div
        className="flex items-center border transition-all duration-200"
        style={{
          borderColor: value ? "rgba(240,237,232,0.35)" : "rgba(212,175,55,0.2)",
          background: value ? "rgba(240,237,232,0.04)" : "#070B17",
        }}
      >
        <input
          ref={inputRef}
          value={query}
          placeholder="Марка…"
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          className="flex-1 bg-transparent px-3 py-2 text-xs text-[#F0EDE8] placeholder-[#8892A4] outline-none font-display tracking-wide min-w-0"
        />
        {value ? (
          <button onClick={clear} className="px-2 text-[#8892A4] hover:text-[#F0EDE8] transition-colors shrink-0">
            <X size={12} />
          </button>
        ) : (
          <span className="px-2 text-[#8892A4] pointer-events-none shrink-0">
            <ChevronDown size={12} />
          </span>
        )}
      </div>

      <AnimatePresence>
        {open && suggestions.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 left-0 right-0 top-full mt-1 max-h-52 overflow-y-auto border border-[rgba(212,175,55,0.2)] bg-[#0A0F1E] shadow-xl"
          >
            {suggestions.map((brand) => (
              <li key={brand}>
                <button
                  onMouseDown={(e) => { e.preventDefault(); select(brand); }}
                  className="w-full text-left px-3 py-2 text-xs font-display tracking-wide transition-colors"
                  style={{
                    color: brand === value ? "#D4AF37" : "#F0EDE8",
                    background: brand === value ? "rgba(212,175,55,0.08)" : "transparent",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(212,175,55,0.06)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = brand === value ? "rgba(212,175,55,0.08)" : "transparent"; }}
                >
                  {brand}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

function CostRow({ label, value, accent, last = false }: {
  label: string; value: string; accent: string; last?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between py-2.5"
      style={{ borderBottom: last ? "none" : "1px solid rgba(255,255,255,0.05)" }}
    >
      <span className="text-[#8892A4] text-xs">{label}</span>
      <span className="text-[#F0EDE8] text-xs font-display">{value}</span>
    </div>
  );
}
