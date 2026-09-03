"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, X, Phone, MapPin, Calendar, Gauge, Zap, Fuel, Shield, AlertTriangle, Cog } from "lucide-react";
import { translateBrand, translateModel, translateFuel, translateCity, fixPhotoUrl, parseDriveType } from "../translate";
import ConsultationModal from "@/components/landing/ConsultationModal";

interface ParserCar {
  id: string;
  manufacturer: string | null;
  model: string | null;
  badge: string | null;
  fuel_type: string | null;
  year: number | null;
  manufacture_month: number | null;
  mileage: number | null;
  price: number | null;
  photos: string[] | null;
  engine_volume: number | null;
  horsepower: number | null;
  segment: string | null;
  total_rub: number | null;
  accident_cnt: number | null;
  my_accident_cost: number | null;
  other_accident_cost: number | null;
  owner_change_cnt: number | null;
  flood_damage: boolean;
  accident_fetched: boolean;
  office_city: string | null;
  condition: string[] | null;
  sell_type: string | null;
  country: string | null;
}

interface City { id: string; name: string; price: number; }

const categoryColors: Record<string, string> = {
  Эконом: "#4ade80", Комфорт: "#60a5fa", Бизнес: "#c084fc", Премиум: "#D4AF37",
};

interface ApiCosts {
  price_rub: number | null;
  price_cny?: number | null;
  utilshor_rub: number | null;
  customs_duty_rub: number | null;
  customs_clearance_rub: number | null;
  broker_fee_rub: number;
  agent_fee_rub: number;
  total_rub: number | null;
  exchange_rates?: {
    krw_rub?: number;
    cny_rub_vtb?: number;
    eur_rub?: number;
  };
}

/* ── Component ──────────────────────────────────────────────── */

export default function CarDetailClient({ car }: { car: ParserCar }) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const [failedPhotos, setFailedPhotos] = useState<Set<string>>(new Set());
  const [encarPhotos, setEncarPhotos] = useState<string[] | null>(null);
  const [cities, setCities] = useState<City[]>([]);
  const [selectedCityId, setSelectedCityId] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [wonRate, setWonRate] = useState(650);
  const [usdRate, setUsdRate] = useState(90);
  const [apiCosts, setApiCosts] = useState<ApiCosts | null | undefined>(undefined);

  useEffect(() => {
    fetch("/api/catalog/cities")
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setCities(d); })
      .catch(() => {});

    fetch(`/api/catalog/cars/${car.id}/photos`)
      .then(r => r.json())
      .then(d => { if (d.photos?.length > 0) setEncarPhotos(d.photos); })
      .catch(() => {});

    fetch("/api/admin/rate")
      .then(r => r.json())
      .then(d => {
        if (d.wonRate) setWonRate(d.wonRate);
        if (d.usdRate) setUsdRate(d.usdRate);
      })
      .catch(() => {});

    fetch(`/api/catalog/cars/${car.id}/cost`)
      .then(r => r.json())
      .then(d => setApiCosts(d.total_rub !== undefined ? d : null))
      .catch(() => setApiCosts(null));
  }, [car.id]);

  const allPhotos = useMemo(() => {
    const base = encarPhotos ?? (car.photos ?? []).map(fixPhotoUrl).filter(Boolean);
    return base.filter(p => !failedPhotos.has(p));
  }, [car.photos, encarPhotos, failedPhotos]);

  const brand = translateBrand(car.manufacturer ?? "");
  const model = translateModel([car.model, car.badge].filter(Boolean).join(" "));
  const fuel = translateFuel(car.fuel_type);
  const segment = car.segment ?? "Комфорт";
  const accent = categoryColors[segment] ?? "#D4AF37";

  const yearStr = car.year
    ? (car.manufacture_month ? `${String(car.manufacture_month).padStart(2, "0")}/${car.year}` : String(car.year))
    : null;
  const mileageStr = car.mileage ? `${car.mileage.toLocaleString("ru")} км` : null;
  const selectedCity = cities.find(c => c.id === selectedCityId) ?? null;
  const fmt = (n: number) => `~${n.toLocaleString("ru")} ₽`;

  const isChina = car.country === "china";

  const costs = typeof apiCosts === "object" && apiCosts !== null && apiCosts.total_rub !== null
    ? apiCosts : null;
  const displayTotal = costs?.total_rub ?? car.total_rub ?? 0;
  const isLgotny = !isChina && apiCosts !== null && apiCosts !== undefined &&
    (apiCosts.utilshor_rub === 3_400 || apiCosts.utilshor_rub === 5_200);

  // USD repair cost
  const totalRepairCostWon = (car.my_accident_cost ?? 0) + (car.other_accident_cost ?? 0);
  const wonRub = wonRate / 10_000;
  const totalRepairCostUsd = totalRepairCostWon > 0 && usdRate > 0
    ? Math.round((totalRepairCostWon * wonRub) / usdRate)
    : 0;
  const totalRepairCostStr = totalRepairCostUsd > 0 ? `~$${totalRepairCostUsd.toLocaleString("en")}` : null;

  const go = (dir: number) =>
    setPhotoIndex(prev => (prev + dir + allPhotos.length) % allPhotos.length);

  type Spec = { label: string; value: string; icon: React.ReactNode; color?: string };

  const rawSpecs: (Spec | null)[] = [
    { label: "Год выпуска",   value: yearStr ?? "",    icon: <Calendar size={14} /> },
    { label: "Пробег",        value: mileageStr ?? "", icon: <Gauge size={14} /> },
    { label: "Двигатель",     value: (car.engine_volume && car.engine_volume > 100) ? `${(car.engine_volume / 1000).toFixed(1)} л` : "", icon: <Fuel size={14} /> },
    { label: "Мощность",      value: car.horsepower ? `${car.horsepower} л.с.` : "", icon: <Zap size={14} /> },
    { label: "Тип топлива",   value: fuel || "", icon: <Fuel size={14} /> },
    parseDriveType(car.badge, car.manufacturer) ? { label: "Привод", value: parseDriveType(car.badge, car.manufacturer)!, icon: <Cog size={14} /> } : null,
    { label: "Город продажи", value: translateCity(car.office_city), icon: <MapPin size={14} /> },
    car.accident_fetched ? {
      label: "ДТП",
      value: car.flood_damage ? "Затопление" : car.accident_cnt === 0 ? "Без ДТП" : `${car.accident_cnt} ДТП`,
      icon: car.accident_cnt === 0 && !car.flood_damage ? <Shield size={14} /> : <AlertTriangle size={14} />,
      color: car.flood_damage || (car.accident_cnt ?? 0) > 0 ? "#ef4444" : "#16a34a",
    } : null,
    car.accident_fetched && (car.accident_cnt ?? 0) > 0 && totalRepairCostStr ? {
      label: "Ремонт по ДТП",
      value: totalRepairCostStr,
      icon: <AlertTriangle size={14} />,
      color: "#ef4444",
    } : null,
    car.accident_fetched && (car.owner_change_cnt ?? 0) > 0 ? {
      label: "Владельцев",
      value: String(car.owner_change_cnt),
      icon: <Shield size={14} />,
    } : null,
  ];

  const specs: Spec[] = rawSpecs.filter((r): r is Spec => r !== null && r.value !== "");

  return (
    <>
      <div className="pt-24 pb-20 bg-[#F5F7FC] min-h-screen">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">

          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-[#6B7A96] text-sm mb-6">
            <Link href="/" className="hover:text-[#C9A227] transition-colors">Главная</Link>
            <ChevronRight size={14} />
            <Link href="/catalog" className="hover:text-[#C9A227] transition-colors">Каталог</Link>
            <ChevronRight size={14} />
            <span className="text-[#0D1729] truncate">{brand} {model}</span>
          </nav>

          {/* Title */}
          <div className="flex items-start gap-3 flex-wrap mb-5">
            <div className="flex-1 min-w-0">
              <h1 className="font-display text-3xl sm:text-4xl text-[#0D1729] leading-tight">
                {brand} <span className="text-[#6B7A96] font-normal">{model}</span>
              </h1>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 mt-1">
              <span className="text-[11px] px-3 py-1.5 font-display tracking-wider"
                style={{ color: accent, border: `1px solid ${accent}40`, background: `${accent}10` }}>
                {segment}
              </span>
              {isLgotny && (
                <span className="text-[11px] px-3 py-1.5 font-display tracking-wider text-green-600 border border-green-400/40 bg-green-50">
                  Льготный утильсбор
                </span>
              )}
            </div>
          </div>

          {/* ── Gallery ── */}
          <div className="mb-4">
            <div className="relative rounded-2xl overflow-hidden bg-[#1A1A2E]" style={{ aspectRatio: "16/9" }}>
              {allPhotos.length > 0 ? (
                <>
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={photoIndex}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="absolute inset-0"
                    >
                      <Image
                        src={allPhotos[photoIndex]} alt={`${brand} ${model}`}
                        fill unoptimized className="object-contain"
                        onError={() => setFailedPhotos(prev => { const n = new Set(prev); n.add(allPhotos[photoIndex]); return n; })}
                      />
                    </motion.div>
                  </AnimatePresence>

                  {allPhotos.length > 1 && (
                    <>
                      <button onClick={() => go(-1)} className="absolute left-3 top-1/2 -translate-y-1/2 p-2.5 bg-black/50 text-white hover:bg-[#D4AF37]/60 transition-colors rounded-lg z-10">
                        <ChevronLeft size={22} />
                      </button>
                      <button onClick={() => go(1)} className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 bg-black/50 text-white hover:bg-[#D4AF37]/60 transition-colors rounded-lg z-10">
                        <ChevronRight size={22} />
                      </button>
                      <div className="absolute bottom-4 right-4 text-xs text-white/70 bg-black/60 px-3 py-1 rounded font-display z-10">
                        {photoIndex + 1} / {allPhotos.length}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[#D4AF37]/15 text-8xl font-display">AUTO</span>
                </div>
              )}
            </div>

            {/* Thumbnails */}
            {allPhotos.length > 1 && (
              <div className="flex gap-2 mt-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                {allPhotos.slice(0, 20).map((photo, i) => (
                  <button
                    key={i} onClick={() => setPhotoIndex(i)}
                    className="shrink-0 w-16 h-11 rounded-lg overflow-hidden border-2 transition-all duration-150"
                    style={{ borderColor: i === photoIndex ? accent : "transparent", opacity: i === photoIndex ? 1 : 0.55 }}
                  >
                    <Image src={photo} alt="" width={64} height={44} unoptimized className="object-cover w-full h-full" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Specs ── */}
          <div className="mb-4 bg-white border border-[#DDE5F2] rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[#DDE5F2] bg-[#F8FAFD]">
              <span className="text-[10px] font-display text-[#6B7A96] uppercase tracking-[0.2em]">Характеристики и история</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 divide-x divide-y divide-[#EEF1F8]">
              {specs.map(({ label, value, icon, color }, i) => (
                <div
                  key={label}
                  className="flex items-center gap-3 px-5 py-4"
                  style={specs.length % 3 !== 0 && i === specs.length - 1 ? { gridColumn: "span 2" } : undefined}
                >
                  <span style={{ color: color ?? accent }} className="shrink-0">{icon}</span>
                  <div className="min-w-0">
                    <div className="text-[10px] text-[#8892A4] uppercase tracking-wide mb-0.5">{label}</div>
                    <div className="text-[13px] font-display truncate" style={{ color: color ?? "#0D1729" }}>{value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Cost ── */}
          <div className="bg-white border border-[#DDE5F2] rounded-xl overflow-hidden mb-4">
            <div className="px-5 py-3 border-b border-[#DDE5F2] bg-[#F8FAFD]">
              <span className="text-[10px] font-display text-[#6B7A96] uppercase tracking-[0.2em]">
                {isChina ? "Стоимость под ключ из Китая" : "Стоимость под ключ в РФ"}
              </span>
            </div>

            {apiCosts === undefined ? (
              <div className="px-5 py-8 flex justify-center">
                <div className="w-5 h-5 border-2 border-[#DDE5F2] border-t-[#C9A227] rounded-full animate-spin" />
              </div>
            ) : costs ? (
              <>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[#EEF1F8]">
                  {([
                    {
                      label: isChina ? "Цена в Китае" : "Цена в Корее",
                      value: costs.price_rub !== null ? fmt(costs.price_rub) : "—",
                      sub: isChina
                        ? (costs.price_cny ? `¥${Math.round(costs.price_cny).toLocaleString("ru")} CNY` : null)
                        : (car.price ? `${car.price.toLocaleString("ru")} 万원` : null),
                    },
                    { label: "Утильсбор",             value: costs.utilshor_rub !== null ? fmt(costs.utilshor_rub) : "—", sub: null },
                    { label: "Таможенная пошлина",    value: costs.customs_duty_rub !== null ? fmt(costs.customs_duty_rub) : "—", sub: null },
                    { label: "Таможенное оформление", value: costs.customs_clearance_rub !== null ? fmt(costs.customs_clearance_rub) : "—", sub: null },
                    { label: "Таможенный брокер",     value: fmt(costs.broker_fee_rub), sub: null },
                    { label: "Услуги агента",         value: fmt(costs.agent_fee_rub), sub: null },
                  ] as { label: string; value: string; sub: string | null }[]).map(({ label, value, sub }) => (
                    <div key={label} className="px-5 py-4">
                      <div className="text-[10px] text-[#8892A4] uppercase tracking-wide mb-1">{label}</div>
                      <div className="text-[14px] font-display text-[#0D1729]">{value}</div>
                      {sub && <div className="text-[11px] text-[#8892A4] mt-0.5">{sub}</div>}
                    </div>
                  ))}
                </div>

                {/* City selector + total */}
                <div className="border-t-2 border-[#DDE5F2] px-5 py-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    {!isChina && cities.length > 0 && (
                      <div className="flex items-center gap-2 flex-1">
                        <span className="text-[11px] text-[#8892A4] shrink-0 uppercase tracking-wide">+ Автовоз</span>
                        <div className="flex items-center gap-2 flex-1">
                          <select
                            value={selectedCityId}
                            onChange={e => setSelectedCityId(e.target.value)}
                            className="flex-1 bg-[#F5F7FC] border border-[#DDE5F2] text-[#0D1729] px-3 py-2 text-xs outline-none focus:border-[#C9A227] transition-colors rounded"
                          >
                            <option value="">До Владивостока</option>
                            {cities.map(c => <option key={c.id} value={c.id}>{c.name} — ~{c.price.toLocaleString("ru")} ₽</option>)}
                          </select>
                          {selectedCityId && (
                            <button onClick={() => setSelectedCityId("")} className="text-[#6B7A96] hover:text-[#0D1729] transition-colors shrink-0">
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="text-right">
                      <div className="text-[10px] text-[#8892A4] uppercase tracking-wide mb-0.5">
                        {!isChina && selectedCity ? `Итого до ${selectedCity.name}` : "Под ключ в РФ"}
                      </div>
                      <div className="font-bold text-2xl shimmer-text">
                        ~{((displayTotal) + (!isChina ? (selectedCity?.price ?? 0) : 0)).toLocaleString("ru")} ₽
                      </div>
                    </div>
                  </div>
                  {isChina && (
                    <p className="text-[#8892A4] text-[10px] mt-2">Включает доставку из Китая до Владивостока. Уточняйте у менеджера.</p>
                  )}
                  {!isChina && (
                    <p className="text-[#B0BAC9] text-[10px] mt-2">Расчёт ориентировочный. Уточняйте у менеджера.</p>
                  )}
                </div>
              </>
            ) : (
              <div className="px-5 py-5">
                <p className="text-sm font-medium text-amber-600 mb-1">Для точного расчёта стоимости обратитесь к менеджеру</p>
                <p className="text-[11px] text-[#8892A4]">Некоторые технические данные автомобиля недоступны — менеджер рассчитает стоимость под ключ вручную.</p>
              </div>
            )}
          </div>

          {/* ── CTA ── */}
          <button
            onClick={() => setModalOpen(true)}
            className="w-full py-4 font-display text-sm uppercase tracking-widest text-[#0A0F1E] hover:bg-[#D4AF37] transition-colors flex items-center justify-center gap-2 rounded-xl font-bold"
            style={{ background: "#C9A227", boxShadow: "0 4px 20px rgba(201,162,39,0.35)" }}
          >
            <Phone size={16} />
            Получить консультацию
          </button>
          <p className="text-center text-[11px] text-[#8892A4] mt-3">Свяжемся в течение 15 минут</p>

        </div>
      </div>

      <ConsultationModal open={modalOpen} onClose={() => setModalOpen(false)} carName={`${brand} ${model} ${car.year ?? ""}`.trim()} carUrl={`https://im-import.ru/catalog/${car.id}`} />
    </>
  );
}
