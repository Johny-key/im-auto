"use client";

import { useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { ChevronRight, SlidersHorizontal, X, Phone } from "lucide-react";
import ConsultationModal from "@/components/landing/ConsultationModal";

/* ── Data ─────────────────────────────────────────────────────── */

type Category = "all" | "ekonom" | "komfort" | "biznes" | "premium";
type Country = "all" | "Корея" | "Япония" | "Китай";

interface Car {
  id: number;
  brand: string;
  model: string;
  year: number;
  price: string;
  priceNum: number;
  country: "Корея" | "Япония" | "Китай";
  category: "Эконом" | "Комфорт" | "Бизнес" | "Премиум";
  categorySlug: "ekonom" | "komfort" | "biznes" | "premium";
  engine: string;
  mileage: string;
  photo: string;
}

const cars: Car[] = [
  // Эконом
  {
    id: 1,
    brand: "Hyundai", model: "Solaris 1.4 AT", year: 2023,
    price: "1 120 000 ₽", priceNum: 1120000,
    country: "Корея", category: "Эконом", categorySlug: "ekonom",
    engine: "1.4 л / 100 л.с.", mileage: "18 000 км",
    photo: "https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=700&q=80&auto=format&fit=crop",
  },
  {
    id: 2,
    brand: "Kia", model: "Rio 1.6 AT", year: 2023,
    price: "1 280 000 ₽", priceNum: 1280000,
    country: "Корея", category: "Эконом", categorySlug: "ekonom",
    engine: "1.6 л / 123 л.с.", mileage: "24 000 км",
    photo: "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=700&q=80&auto=format&fit=crop",
  },
  {
    id: 3,
    brand: "Toyota", model: "Vitz 1.0 CVT", year: 2022,
    price: "980 000 ₽", priceNum: 980000,
    country: "Япония", category: "Эконом", categorySlug: "ekonom",
    engine: "1.0 л / 72 л.с.", mileage: "31 000 км",
    photo: "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=700&q=80&auto=format&fit=crop",
  },
  {
    id: 4,
    brand: "Chery", model: "Tiggo 4 Pro 1.5T", year: 2023,
    price: "1 490 000 ₽", priceNum: 1490000,
    country: "Китай", category: "Эконом", categorySlug: "ekonom",
    engine: "1.5 л / 147 л.с.", mileage: "8 000 км",
    photo: "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=700&q=80&auto=format&fit=crop",
  },
  // Комфорт
  {
    id: 5,
    brand: "Hyundai", model: "Tucson 1.6 T-GDi", year: 2023,
    price: "2 390 000 ₽", priceNum: 2390000,
    country: "Корея", category: "Комфорт", categorySlug: "komfort",
    engine: "1.6 л / 180 л.с.", mileage: "12 000 км",
    photo: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=700&q=80&auto=format&fit=crop",
  },
  {
    id: 6,
    brand: "Kia", model: "Sportage GT Line", year: 2024,
    price: "2 750 000 ₽", priceNum: 2750000,
    country: "Корея", category: "Комфорт", categorySlug: "komfort",
    engine: "2.0 л / 149 л.с.", mileage: "5 000 км",
    photo: "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=700&q=80&auto=format&fit=crop",
  },
  {
    id: 7,
    brand: "Toyota", model: "Camry 2.5 AT", year: 2022,
    price: "2 890 000 ₽", priceNum: 2890000,
    country: "Япония", category: "Комфорт", categorySlug: "komfort",
    engine: "2.5 л / 181 л.с.", mileage: "22 000 км",
    photo: "https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?w=700&q=80&auto=format&fit=crop",
  },
  {
    id: 8,
    brand: "Haval", model: "F7x 2.0T AWD", year: 2023,
    price: "2 200 000 ₽", priceNum: 2200000,
    country: "Китай", category: "Комфорт", categorySlug: "komfort",
    engine: "2.0 л / 190 л.с.", mileage: "11 000 км",
    photo: "https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=700&q=80&auto=format&fit=crop",
  },
  // Бизнес
  {
    id: 9,
    brand: "Genesis", model: "G80 2.5T AWD", year: 2023,
    price: "4 650 000 ₽", priceNum: 4650000,
    country: "Корея", category: "Бизнес", categorySlug: "biznes",
    engine: "2.5 л / 300 л.с.", mileage: "9 000 км",
    photo: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=700&q=80&auto=format&fit=crop",
  },
  {
    id: 10,
    brand: "Lexus", model: "ES 250 AWD", year: 2022,
    price: "4 200 000 ₽", priceNum: 4200000,
    country: "Япония", category: "Бизнес", categorySlug: "biznes",
    engine: "2.5 л / 200 л.с.", mileage: "16 000 км",
    photo: "https://images.unsplash.com/photo-1549399542-7e8f2e928464?w=700&q=80&auto=format&fit=crop",
  },
  {
    id: 11,
    brand: "Hyundai", model: "Grandeur 3.3 AT", year: 2023,
    price: "3 850 000 ₽", priceNum: 3850000,
    country: "Корея", category: "Бизнес", categorySlug: "biznes",
    engine: "3.3 л / 290 л.с.", mileage: "7 000 км",
    photo: "https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=700&q=80&auto=format&fit=crop",
  },
  {
    id: 12,
    brand: "Zeekr", model: "001 AWD", year: 2024,
    price: "4 990 000 ₽", priceNum: 4990000,
    country: "Китай", category: "Бизнес", categorySlug: "biznes",
    engine: "электро / 544 л.с.", mileage: "3 000 км",
    photo: "https://images.unsplash.com/photo-1563720223185-11003d516935?w=700&q=80&auto=format&fit=crop",
  },
  // Премиум
  {
    id: 13,
    brand: "Genesis", model: "GV80 3.5T AWD", year: 2023,
    price: "5 850 000 ₽", priceNum: 5850000,
    country: "Корея", category: "Премиум", categorySlug: "premium",
    engine: "3.5 л / 380 л.с.", mileage: "6 000 км",
    photo: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=700&q=80&auto=format&fit=crop",
  },
  {
    id: 14,
    brand: "Toyota", model: "Land Cruiser 300", year: 2022,
    price: "8 200 000 ₽", priceNum: 8200000,
    country: "Япония", category: "Премиум", categorySlug: "premium",
    engine: "3.5 л / 415 л.с.", mileage: "14 000 км",
    photo: "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=700&q=80&auto=format&fit=crop",
  },
  {
    id: 15,
    brand: "Lexus", model: "LX 600 AWD", year: 2023,
    price: "9 400 000 ₽", priceNum: 9400000,
    country: "Япония", category: "Премиум", categorySlug: "premium",
    engine: "3.5 л / 415 л.с.", mileage: "8 000 км",
    photo: "https://images.unsplash.com/photo-1533106418989-88406c7cc8ca?w=700&q=80&auto=format&fit=crop",
  },
  {
    id: 16,
    brand: "Li Auto", model: "L9 Pro 6-seat", year: 2024,
    price: "7 200 000 ₽", priceNum: 7200000,
    country: "Китай", category: "Премиум", categorySlug: "premium",
    engine: "гибрид / 449 л.с.", mileage: "2 000 км",
    photo: "https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=700&q=80&auto=format&fit=crop",
  },
];

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
  const [activeCountry, setActiveCountry] = useState<Country>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filtered = useMemo(() => {
    return cars.filter((c) => {
      const catOk = activeCategory === "all" || c.categorySlug === activeCategory;
      const cntOk = activeCountry === "all" || c.country === activeCountry;
      return catOk && cntOk;
    });
  }, [activeCategory, activeCountry]);

  const categories: Category[] = ["all", "ekonom", "komfort", "biznes", "premium"];
  const countries: Country[] = ["all", "Корея", "Япония", "Китай"];

  return (
    <>
      {/* ── Hero banner ── */}
      <section className="pt-28 pb-14 relative overflow-hidden">
        <div className="absolute inset-0 racing-stripe-bg opacity-40 pointer-events-none" />
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-[#D4AF37]/[0.04] blur-[100px] pointer-events-none" />

        <div className="max-w-6xl mx-auto px-6 relative z-10">
          {/* Breadcrumb */}
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
            <p className="text-[#8892A4] text-sm max-w-xs leading-relaxed">
              {filtered.length} {filtered.length === 1 ? "автомобиль" : filtered.length < 5 ? "автомобиля" : "автомобилей"} в наличии и под заказ
            </p>
          </div>
        </div>
      </section>

      {/* ── Filters ── */}
      <section className="sticky top-[72px] z-30 bg-[#0A0F1E]/95 backdrop-blur-md border-b border-[rgba(212,175,55,0.1)]">
        <div className="max-w-6xl mx-auto px-6">
          {/* Desktop filters */}
          <div className="hidden md:flex items-center gap-0 py-3 overflow-x-auto">
            {/* Category pills */}
            <div className="flex gap-2 shrink-0 mr-6">
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

            {/* Divider */}
            <div className="w-px h-6 bg-[#D4AF37]/15 mr-6 shrink-0" />

            {/* Country pills */}
            <div className="flex gap-2 shrink-0">
              {countries.map((cnt) => {
                const isActive = activeCountry === cnt;
                return (
                  <button
                    key={cnt}
                    onClick={() => setActiveCountry(cnt)}
                    className="text-xs px-4 py-2 uppercase tracking-widest font-display transition-all duration-200 whitespace-nowrap"
                    style={{
                      color: isActive ? "#D4AF37" : "#8892A4",
                      border: `1px solid ${isActive ? "rgba(212,175,55,0.4)" : "rgba(212,175,55,0.08)"}`,
                      background: isActive ? "rgba(212,175,55,0.08)" : "transparent",
                    }}
                  >
                    {cnt === "all" ? "Все страны" : cnt}
                  </button>
                );
              })}
            </div>

            {/* Reset */}
            {(activeCategory !== "all" || activeCountry !== "all") && (
              <button
                onClick={() => { setActiveCategory("all"); setActiveCountry("all"); }}
                className="ml-auto shrink-0 flex items-center gap-1.5 text-[#8892A4] hover:text-[#F0EDE8] text-xs transition-colors"
              >
                <X size={12} />
                Сбросить
              </button>
            )}
          </div>

          {/* Mobile filter toggle */}
          <div className="flex md:hidden items-center justify-between py-3">
            <span className="text-[#8892A4] text-sm">
              {filtered.length} авто
            </span>
            <button
              onClick={() => setFiltersOpen(!filtersOpen)}
              className="flex items-center gap-2 text-[#D4AF37] text-sm border border-[#D4AF37]/30 px-4 py-2"
            >
              <SlidersHorizontal size={14} />
              Фильтры
              {(activeCategory !== "all" || activeCountry !== "all") && (
                <span className="w-2 h-2 rounded-full bg-[#D4AF37]" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile filter drawer */}
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
                          onClick={() => setActiveCategory(cat)}
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
                <div>
                  <div className="text-xs text-[#8892A4] uppercase tracking-wider mb-2">Страна</div>
                  <div className="flex flex-wrap gap-2">
                    {countries.map((cnt) => {
                      const isActive = activeCountry === cnt;
                      return (
                        <button
                          key={cnt}
                          onClick={() => setActiveCountry(cnt)}
                          className="text-xs px-3 py-1.5 font-display transition-all"
                          style={{
                            color: isActive ? "#D4AF37" : "#8892A4",
                            border: `1px solid ${isActive ? "rgba(212,175,55,0.4)" : "rgba(212,175,55,0.08)"}`,
                            background: isActive ? "rgba(212,175,55,0.08)" : "transparent",
                          }}
                        >
                          {cnt === "all" ? "Все" : cnt}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {(activeCategory !== "all" || activeCountry !== "all") && (
                  <button
                    onClick={() => { setActiveCategory("all"); setActiveCountry("all"); setFiltersOpen(false); }}
                    className="text-xs text-[#8892A4] flex items-center gap-1"
                  >
                    <X size={12} /> Сбросить фильтры
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
                  onClick={() => { setActiveCategory("all"); setActiveCountry("all"); }}
                  className="text-[#D4AF37] border border-[#D4AF37]/30 px-6 py-2 text-sm hover:bg-[#D4AF37]/10 transition-colors"
                >
                  Сбросить фильтры
                </button>
              </motion.div>
            ) : (
              <motion.div
                key={`${activeCategory}-${activeCountry}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
              >
                {filtered.map((car, i) => (
                  <CarCard key={car.id} car={car} index={i} onConsult={() => setModalOpen(true)} />
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* CTA banner */}
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

/* ── Card ─────────────────────────────────────────────────────── */

function CarCard({ car, index, onConsult }: { car: Car; index: number; onConsult: () => void }) {
  const accent = categoryColors[car.category] ?? "#D4AF37";

  return (
    <motion.div
      className="group relative bg-[#0F1629] border border-[rgba(212,175,55,0.08)] overflow-hidden neon-border flex flex-col"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.4 }}
      whileHover={{ y: -4 }}
    >
      {/* Photo */}
      <div className="relative w-full h-44 overflow-hidden shrink-0">
        <Image
          src={car.photo}
          alt={`${car.brand} ${car.model}`}
          fill
          className="object-cover transition-transform duration-700 group-hover:scale-105"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0A0F1E]/10 via-transparent to-[#0F1629]/80" />

        {/* Racing stripe on hover */}
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          style={{
            backgroundImage: "repeating-linear-gradient(-60deg, transparent, transparent 20px, rgba(212,175,55,0.04) 20px, rgba(212,175,55,0.04) 21px)",
          }}
        />

        {/* Badges */}
        <div className="absolute top-3 left-3 text-[10px] text-[#8892A4] border border-[#8892A4]/20 px-2 py-0.5 bg-[#0A0F1E]/70 backdrop-blur-sm font-display tracking-wider">
          {car.country}
        </div>
        <div
          className="absolute top-3 right-3 text-[10px] px-2 py-0.5 font-display tracking-wider backdrop-blur-sm"
          style={{ color: accent, border: `1px solid ${accent}30`, background: `${accent}12` }}
        >
          {car.category}
        </div>
      </div>

      {/* Info */}
      <div className="flex flex-col flex-1 p-5">
        <div className="mb-2">
          <div className="font-display text-lg text-[#F0EDE8] leading-tight">
            {car.brand}{" "}
            <span className="text-[#8892A4] text-sm font-normal">{car.model}</span>
          </div>
          <div className="text-[#8892A4] text-xs mt-1 tracking-wide">{car.year} · {car.engine} · {car.mileage}</div>
        </div>

        <div className="h-px my-3" style={{ background: `linear-gradient(90deg, ${accent}30, transparent)` }} />

        <div className="flex items-center justify-between mb-4">
          <span className="text-[#8892A4] text-[10px] uppercase tracking-wider">Итоговая цена</span>
          <span className="font-bold text-sm shimmer-text">{car.price}</span>
        </div>

        <button
          onClick={onConsult}
          className="mt-auto w-full py-2.5 text-xs uppercase tracking-widest font-display transition-all duration-200 border"
          style={{
            color: accent,
            borderColor: `${accent}35`,
            background: "transparent",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = `${accent}15`;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
          }}
        >
          Узнать условия
        </button>
      </div>

      {/* Bottom accent line on hover */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
      />
    </motion.div>
  );
}
