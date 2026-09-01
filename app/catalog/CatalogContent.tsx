"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, SlidersHorizontal, X, Phone, ChevronDown, ArrowUpDown, AlertTriangle } from "lucide-react";
import ConsultationModal from "@/components/landing/ConsultationModal";
import { translateBrand, translateModel, translateFuel, fixPhotoUrl, parseDriveType } from "./translate";

/* ── Types ────────────────────────────────────────────────────── */

type Category = "all" | "ekonom" | "komfort" | "biznes" | "premium";

interface City { id: string; name: string; price: number; }

interface ApiCosts {
  price_rub: number;
  utilshor_rub: number | null;
  customs_duty_rub: number | null;
  customs_clearance_rub: number | null;
  broker_fee_rub: number;
  agent_fee_rub: number;
  total_rub: number | null;
}

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
  is_available: boolean;
  condition: string[] | null;
  sell_type: string | null;
  service_copy_car: string | null;
  country: string | null;
}

interface Car {
  id: string;
  brand: string;
  model: string;
  year: number;
  manufactureMonth: number | null;
  priceWon: number;
  category: "Эконом" | "Комфорт" | "Бизнес" | "Премиум";
  categorySlug: "ekonom" | "komfort" | "biznes" | "premium";
  engine: string;
  mileage: string;
  photos: string[];
  engineVolumeCc: number | null;
  horsepower: number | null;
  carYear: number | null;
  totalRub: number | null;
  accidentCnt: number | null;
  myAccidentCost: number | null;
  otherAccidentCost: number | null;
  ownerChangeCnt: number | null;
  floodDamage: boolean;
  accidentFetched: boolean;
  driveType: string | null;
  warnings: string[];
  country: string;
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

function normalizeModel(raw: string): string {
  return raw
    // Strip chassis/body codes in parentheses: (E84), (F48), (4M), (80A) etc.
    .replace(/\s*\([A-Z0-9][A-Z0-9]{1,4}\)$/, "")
    // Strip bare chassis/generation codes (no parentheses): W204, E90, DN8, XA50, 9YA, NX4L
    // Must contain at least one digit to avoid stripping trim names like GT, RS, TDI
    .replace(/\s+[A-Z]{0,3}\d[A-Z0-9]{0,3}$/, "")
    // Strip descriptive body-style suffixes (BMW Gran Coupe, Active Tourer, etc.)
    .replace(/\s+(Gran Coupe|Gran Turismo|Gran Tourer|Sport Turismo|Active Tourer|Sports Wagon|Shooting Brake|Sport Wagon|Sportback|Avant|Estate|Touring|Cabriolet|Convertible|Targa|Roadster|Spider|Spyder|Allroad|Coupe)$/i, "")
    // Korean: strip generation suffix "2세대", "3세대" etc.
    .replace(/\s+\d+세대$/, "")
    // Korean: strip body/variant suffixes
    .replace(/\s+올스페이스$/, "")
    .replace(/\s+페이스리프트$/, "")
    // Korean: strip "New" prefixes (뉴, 더 뉴, 올 뉴, 리얼 뉴)
    .replace(/^(더\s+뉴|올\s+뉴|리얼\s+뉴|더\s+비틀|뉴)\s+/, "")
    // English fallbacks
    .replace(/\s+\d+(?:st|nd|rd|th)\s+[Gg]en.*$/i, "")
    .replace(/\s+Allspace$/i, "")
    .replace(/\s+Facelift$/i, "")
    .trim();
}

function bodyLabel(raw: string, base: string): string {
  const m = raw.match(/\(([^)]+)\)$/);
  if (m) return m[1];
  return raw.replace(base, "").trim() || raw;
}

function parseVolumeFromBadge(badge: string | null): number | null {
  if (!badge) return null;
  const m = badge.match(/(\d+\.\d+)/);
  if (!m) return null;
  const liters = parseFloat(m[1]);
  if (liters < 0.5 || liters > 8) return null;
  return Math.round(liters * 1000);
}

function detectWarnings(p: ParserCar): string[] {
  const w: string[] = [];
  if (p.service_copy_car === "DUPLICATION") w.push("Дубликат в реестре");
  if (p.condition && !p.condition.includes("Record")) w.push("Нет акта осмотра");
  if (p.sell_type && p.sell_type !== "일반") w.push("Нестандартный тип продажи");
  const price = p.price ?? 0;
  const year = p.year ?? 0;
  if (price > 0 && year >= 2023 && price < 800) w.push("Цена подозрительно низкая");
  else if (price > 0 && year >= 2020 && price < 400) w.push("Цена подозрительно низкая");
  else if (price > 0 && year >= 2018 && price < 200) w.push("Цена подозрительно низкая");
  return w;
}

function mapCar(p: ParserCar): Car {
  const dbSegment = p.segment as Car["category"] | null;
  const category = dbSegment ?? categoryFromWon(p.price ?? 0);
  const rawModel = [p.model, p.badge].filter(Boolean).join(" ");
  const engineVolumeCc = p.engine_volume ?? parseVolumeFromBadge(p.badge);
  return {
    id: p.id,
    brand: translateBrand(p.manufacturer ?? ""),
    model: translateModel(rawModel),
    year: p.year ?? 0,
    manufactureMonth: p.manufacture_month ?? null,
    priceWon: (p.price && p.price > 0 && ![9997, 9998, 9999, 99999].includes(p.price)) ? p.price : 0,
    category,
    categorySlug: slugMap[category],
    engine: translateFuel(p.fuel_type),
    mileage: p.mileage ? `${p.mileage.toLocaleString("ru")} км` : "—",
    photos: (p.photos ?? []).map(fixPhotoUrl).filter(Boolean),
    engineVolumeCc,
    horsepower: p.horsepower ?? null,
    carYear: p.year,
    totalRub: p.total_rub ?? null,
    accidentCnt: p.accident_fetched ? (p.accident_cnt ?? 0) : null,
    myAccidentCost: p.accident_fetched ? (p.my_accident_cost ?? 0) : null,
    otherAccidentCost: p.accident_fetched ? (p.other_accident_cost ?? 0) : null,
    ownerChangeCnt: p.owner_change_cnt ?? null,
    floodDamage: p.flood_damage ?? false,
    accidentFetched: p.accident_fetched ?? false,
    driveType: parseDriveType(p.badge, p.manufacturer),
    warnings: detectWarnings(p),
    country: p.country || "korea",
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

const CATEGORY_SEGMENT: Record<string, string | null> = {
  all:     null,
  ekonom:  "Эконом",
  komfort: "Комфорт",
  biznes:  "Бизнес",
  premium: "Премиум",
};

const LIMIT = 30;

export default function CatalogContent({
  defaultCountry,
  embedded,
}: {
  defaultCountry?: "all" | "korea" | "china";
  embedded?: boolean;
} = {}) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [country, setCountry] = useState<"all" | "korea" | "china">(
    (searchParams.get("country") ?? defaultCountry ?? "all") as "all" | "korea" | "china"
  );
  const [activeCategory, setActiveCategory] = useState<Category>(
    (searchParams.get("cat") ?? "all") as Category
  );
  const [selectedBrands, setSelectedBrands] = useState<string[]>(
    searchParams.getAll("brand")
  );
  const [selectedModels, setSelectedModels] = useState<string[]>(
    searchParams.getAll("model_filter")
  );
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelGroups, setModelGroups]         = useState<Record<string, string[]>>({});
  const [yearFrom, setYearFrom] = useState<number | "">(
    searchParams.get("yf") ? Number(searchParams.get("yf")) : ""
  );
  const [yearTo, setYearTo] = useState<number | "">(
    searchParams.get("yt") ? Number(searchParams.get("yt")) : ""
  );
  const [priceSort, setPriceSort] = useState<"asc" | "desc" | "">(
    (searchParams.get("sort") ?? "") as "asc" | "desc" | ""
  );
  const [ecoFee, setEcoFee] = useState(searchParams.get("eco") === "1");
  const [fuelCategories, setFuelCategories] = useState<string[]>(
    searchParams.getAll("fuel")
  );
  const [volumeFrom, setVolumeFrom] = useState<number | "">(
    searchParams.get("vf") ? Number(searchParams.get("vf")) : ""
  );
  const [volumeTo, setVolumeTo] = useState<number | "">(
    searchParams.get("vt") ? Number(searchParams.get("vt")) : ""
  );
  const [mileageFrom, setMileageFrom] = useState<number | "">(
    searchParams.get("mf") ? Number(searchParams.get("mf")) : ""
  );
  const [mileageTo, setMileageTo] = useState<number | "">(
    searchParams.get("mt") ? Number(searchParams.get("mt")) : ""
  );
  const [hpFrom, setHpFrom] = useState<number | "">(
    searchParams.get("hf") ? Number(searchParams.get("hf")) : ""
  );
  const [hpTo, setHpTo] = useState<number | "">(
    searchParams.get("ht") ? Number(searchParams.get("ht")) : ""
  );
  // Price filter in plain RUB. Old URLs stored millions (e.g. "2" = 2M) — auto-upgrade small values.
  const _readPriceParam = (key: string) => {
    const raw = searchParams.get(key);
    if (!raw) return "" as const;
    const n = Number(raw);
    return isNaN(n) ? ("" as const) : (n < 1000 ? n * 1_000_000 : n);
  };
  const [priceRubFrom, setPriceRubFrom] = useState<number | "">(_readPriceParam("prf"));
  const [priceRubTo,   setPriceRubTo]   = useState<number | "">(_readPriceParam("prt"));
  const [selectedBodies, setSelectedBodies] = useState<string[]>(
    searchParams.getAll("body")
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  // Push bottom bar above keyboard on mobile
  useEffect(() => {
    if (!filtersOpen) { setKeyboardOffset(0); return; }
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardOffset(offset);
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();
    return () => { vv.removeEventListener("resize", update); vv.removeEventListener("scroll", update); };
  }, [filtersOpen]);

  // Pending (draft) filter state — only applied when user clicks "Применить"
  const [pendingCategory, setPendingCategory] = useState<Category>(
    (searchParams.get("cat") ?? "all") as Category
  );
  const [pendingBrands, setPendingBrands] = useState<string[]>(searchParams.getAll("brand"));
  const [pendingModels, setPendingModels] = useState<string[]>(searchParams.getAll("model_filter"));
  const [pendingYearFrom, setPendingYearFrom] = useState<number | "">(
    searchParams.get("yf") ? Number(searchParams.get("yf")) : ""
  );
  const [pendingYearTo, setPendingYearTo] = useState<number | "">(
    searchParams.get("yt") ? Number(searchParams.get("yt")) : ""
  );
  const [pendingPriceSort, setPendingPriceSort] = useState<"asc" | "desc" | "">(
    (searchParams.get("sort") ?? "") as "asc" | "desc" | ""
  );
  const [pendingEcoFee, setPendingEcoFee] = useState(searchParams.get("eco") === "1");
  const [pendingFuelCategories, setPendingFuelCategories] = useState<string[]>(searchParams.getAll("fuel"));
  const [pendingVolumeFrom, setPendingVolumeFrom] = useState<number | "">(
    searchParams.get("vf") ? Number(searchParams.get("vf")) : ""
  );
  const [pendingVolumeTo, setPendingVolumeTo] = useState<number | "">(
    searchParams.get("vt") ? Number(searchParams.get("vt")) : ""
  );
  const [pendingMileageFrom, setPendingMileageFrom] = useState<number | "">(
    searchParams.get("mf") ? Number(searchParams.get("mf")) : ""
  );
  const [pendingMileageTo, setPendingMileageTo] = useState<number | "">(
    searchParams.get("mt") ? Number(searchParams.get("mt")) : ""
  );
  const [pendingHpFrom, setPendingHpFrom] = useState<number | "">(
    searchParams.get("hf") ? Number(searchParams.get("hf")) : ""
  );
  const [pendingHpTo, setPendingHpTo] = useState<number | "">(
    searchParams.get("ht") ? Number(searchParams.get("ht")) : ""
  );
  const [pendingPriceRubFrom, setPendingPriceRubFrom] = useState<number | "">(_readPriceParam("prf"));
  const [pendingPriceRubTo,   setPendingPriceRubTo]   = useState<number | "">(_readPriceParam("prt"));
  const [pendingBodies, setPendingBodies] = useState<string[]>(
    searchParams.getAll("body")
  );

  // Bodies available for the pending model selection
  const availableBodies = useMemo(() => {
    const all: string[] = [];
    for (const m of pendingModels) {
      const variants = modelGroups[m] ?? [];
      if (variants.length > 1) all.push(...variants);
    }
    return all;
  }, [pendingModels, modelGroups]);

  const [cars, setCars] = useState<Car[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  const [cities, setCities] = useState<City[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [yearMin, setYearMin] = useState(2000);
  const [yearMax, setYearMax] = useState(new Date().getFullYear());

  // Sync filters → URL so they survive navigation back from car detail
  useEffect(() => {
    const p = new URLSearchParams();
    if (country !== "all") p.set("country", country);
    if (activeCategory !== "all") p.set("cat", activeCategory);
    for (const b of selectedBrands) p.append("brand", b);
    for (const m of selectedModels) p.append("model_filter", m); // normalized names in URL
    if (yearFrom !== "") p.set("yf", String(yearFrom));
    if (yearTo !== "") p.set("yt", String(yearTo));
    if (priceSort) p.set("sort", priceSort);
    if (ecoFee) p.set("eco", "1");
    for (const fc of fuelCategories) p.append("fuel", fc);
    if (volumeFrom !== "") p.set("vf", String(volumeFrom));
    if (volumeTo !== "") p.set("vt", String(volumeTo));
    if (mileageFrom !== "") p.set("mf", String(mileageFrom));
    if (mileageTo !== "") p.set("mt", String(mileageTo));
    if (hpFrom !== "") p.set("hf", String(hpFrom));
    if (hpTo !== "") p.set("ht", String(hpTo));
    if (priceRubFrom !== "") p.set("prf", String(priceRubFrom));
    if (priceRubTo !== "") p.set("prt", String(priceRubTo));
    for (const b of selectedBodies) p.append("body", b);
    const qs = p.toString();
    router.replace(qs ? `/catalog?${qs}` : "/catalog", { scroll: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country, activeCategory, selectedBrands, selectedModels, yearFrom, yearTo, priceSort, ecoFee, fuelCategories, volumeFrom, volumeTo, mileageFrom, mileageTo, hpFrom, hpTo, priceRubFrom, priceRubTo, selectedBodies]);

  const buildParams = (off: number) => {
    const p = new URLSearchParams();
    p.set("limit", String(LIMIT));
    p.set("offset", String(off));
    if (country !== "all") p.set("country", country);
    if (priceSort) p.set("sort_by", priceSort === "asc" ? "price_asc" : "price_desc");
    for (const b of selectedBrands) p.append("manufacturer", b);
    if (selectedBodies.length > 0) {
      for (const raw of selectedBodies) p.append("models", raw);
    } else {
      for (const m of selectedModels)
        for (const raw of (modelGroups[m] ?? [m])) p.append("models", raw);
    }
    if (ecoFee) p.set("eco_fee", "true");
    for (const fc of fuelCategories) p.append("fuel_category", fc);
    if (yearFrom !== "") p.set("year_from", String(yearFrom));
    if (yearTo !== "") p.set("year_to", String(yearTo));
    if (volumeFrom !== "") p.set("volume_from", String(volumeFrom));
    if (volumeTo !== "") p.set("volume_to", String(volumeTo));
    if (mileageFrom !== "") p.set("mileage_from", String(mileageFrom));
    if (mileageTo !== "") p.set("mileage_max", String(mileageTo));
    if (hpFrom !== "") p.set("hp_from", String(hpFrom));
    if (hpTo !== "") p.set("hp_to", String(hpTo));
    if (priceRubFrom !== "") p.set("total_rub_from", String(priceRubFrom));
    if (priceRubTo !== "") p.set("total_rub_to", String(priceRubTo));
    const seg = CATEGORY_SEGMENT[activeCategory];
    if (seg) p.set("segment", seg);
    return p.toString();
  };

  // Fetch first page whenever filters change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setOffset(0);

    fetch(`/api/catalog/cars?${buildParams(0)}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        if (!d.items) { setError(true); setLoading(false); return; }
        setCars(d.items.map(mapCar));
        setTotal(d.total ?? 0);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) { setError(true); setLoading(false); } });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country, activeCategory, selectedBrands, selectedModels, selectedBodies, ecoFee, fuelCategories, yearFrom, yearTo, priceSort, volumeFrom, volumeTo, mileageFrom, mileageTo, hpFrom, hpTo, priceRubFrom, priceRubTo]);

  // Sync applied → pending when filter panel opens
  useEffect(() => {
    if (filtersOpen) {
      setPendingCategory(activeCategory);
      setPendingBrands(selectedBrands);
      setPendingModels(selectedModels);
      setPendingYearFrom(yearFrom);
      setPendingYearTo(yearTo);
      setPendingPriceSort(priceSort);
      setPendingEcoFee(ecoFee);
      setPendingFuelCategories(fuelCategories);
      setPendingVolumeFrom(volumeFrom);
      setPendingVolumeTo(volumeTo);
      setPendingMileageFrom(mileageFrom);
      setPendingMileageTo(mileageTo);
      setPendingHpFrom(hpFrom);
      setPendingHpTo(hpTo);
      setPendingPriceRubFrom(priceRubFrom);
      setPendingPriceRubTo(priceRubTo);
      setPendingBodies(selectedBodies);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersOpen]);

  // Fetch available models for filter panel (based on pendingBrands)
  useEffect(() => {
    if (pendingBrands.length === 0) {
      setAvailableModels([]);
      setModelGroups({});
      setPendingModels([]);
      setSelectedModels([]);
      setPendingBodies([]);
      setSelectedBodies([]);
      return;
    }
    const params = new URLSearchParams();
    for (const b of pendingBrands) params.append("manufacturer", b);
    fetch(`/api/catalog/models?${params}`)
      .then(r => r.json())
      .then(d => {
        if (d.models) {
          const raw = d.models as string[];
          const groups: Record<string, string[]> = {};
          for (const m of raw) {
            const key = normalizeModel(m);
            if (!groups[key]) groups[key] = [];
            groups[key].push(m);
          }
          setModelGroups(groups);
          const normalized = Object.keys(groups).sort();
          setAvailableModels(normalized);
          setPendingModels(prev => prev.filter(m => normalized.includes(m)));
          setSelectedModels(prev => prev.filter(m => normalized.includes(m)));
          setPendingBodies([]);
          setSelectedBodies([]);
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingBrands]);

  // Load cities, brands, year range once
  useEffect(() => {
    fetch("/api/catalog/cities").then(r => r.json())
      .then(d => { if (Array.isArray(d)) setCities(d); }).catch(() => {});

    fetch("/api/catalog/filters").then(r => r.json()).then(d => {
      if (d.manufacturers) {
        setBrands((d.manufacturers as string[]).filter(Boolean)
          .sort((a: string, b: string) => translateBrand(a).localeCompare(translateBrand(b), "ru")));
      }
      if (d.year_min) setYearMin(d.year_min);
      if (d.year_max) setYearMax(d.year_max);
    }).catch(() => {});
  }, []);

  const loadMore = async () => {
    const nextOffset = offset + LIMIT;
    setLoadingMore(true);
    try {
      const d = await fetch(`/api/catalog/cars?${buildParams(nextOffset)}`).then(r => r.json());
      if (d.items) {
        setCars(prev => {
          const seen = new Set(prev.map(c => c.id));
          return [...prev, ...d.items.map(mapCar).filter((c: Car) => !seen.has(c.id))];
        });
        setOffset(nextOffset);
      }
    } finally {
      setLoadingMore(false);
    }
  };

  const hasMore = cars.length < total;
  const visible = cars;

  // Years list derived from yearMin/yearMax
  const availableYears = useMemo(() => {
    const years: number[] = [];
    for (let y = yearMax; y >= yearMin; y--) years.push(y);
    return years;
  }, [yearMin, yearMax]);

  const hasActiveFilters = activeCategory !== "all" || selectedBrands.length > 0 || selectedModels.length > 0 || selectedBodies.length > 0 || ecoFee || fuelCategories.length > 0 || yearFrom !== "" || yearTo !== "" || priceSort !== "" || volumeFrom !== "" || volumeTo !== "" || mileageFrom !== "" || mileageTo !== "" || hpFrom !== "" || hpTo !== "" || priceRubFrom !== "" || priceRubTo !== "";

  const hasPendingFilters = pendingCategory !== "all" || pendingBrands.length > 0 || pendingModels.length > 0 || pendingBodies.length > 0 || pendingEcoFee || pendingFuelCategories.length > 0 || pendingYearFrom !== "" || pendingYearTo !== "" || pendingPriceSort !== "" || pendingVolumeFrom !== "" || pendingVolumeTo !== "" || pendingMileageFrom !== "" || pendingMileageTo !== "" || pendingHpFrom !== "" || pendingHpTo !== "" || pendingPriceRubFrom !== "" || pendingPriceRubTo !== "";

  const applyFilters = () => {
    setActiveCategory(pendingCategory);
    setSelectedBrands(pendingBrands);
    setSelectedModels(pendingModels);
    setYearFrom(pendingYearFrom);
    setYearTo(pendingYearTo);
    setPriceSort(pendingPriceSort);
    setEcoFee(pendingEcoFee);
    setFuelCategories(pendingFuelCategories);
    setVolumeFrom(pendingVolumeFrom);
    setVolumeTo(pendingVolumeTo);
    setMileageFrom(pendingMileageFrom);
    setMileageTo(pendingMileageTo);
    setHpFrom(pendingHpFrom);
    setHpTo(pendingHpTo);
    setPriceRubFrom(pendingPriceRubFrom);
    setPriceRubTo(pendingPriceRubTo);
    setSelectedBodies(pendingBodies);
    setFiltersOpen(false);
  };

  const resetFilters = () => {
    setCountry("all");
    setActiveCategory("all"); setSelectedBrands([]); setSelectedModels([]); setSelectedBodies([]); setEcoFee(false); setFuelCategories([]); setYearFrom(""); setYearTo(""); setPriceSort(""); setVolumeFrom(""); setVolumeTo(""); setMileageFrom(""); setMileageTo(""); setHpFrom(""); setHpTo(""); setPriceRubFrom(""); setPriceRubTo("");
    setPendingCategory("all"); setPendingBrands([]); setPendingModels([]); setPendingBodies([]); setPendingEcoFee(false); setPendingFuelCategories([]); setPendingYearFrom(""); setPendingYearTo(""); setPendingPriceSort(""); setPendingVolumeFrom(""); setPendingVolumeTo(""); setPendingMileageFrom(""); setPendingMileageTo(""); setPendingHpFrom(""); setPendingHpTo(""); setPendingPriceRubFrom(""); setPendingPriceRubTo("");
  };

  const categories: Category[] = ["all", "ekonom", "komfort", "biznes", "premium"];

  return (
    <>
      {/* ── Hero banner ── */}
      <section className="pt-8 pb-8 relative overflow-hidden">
        <div className="absolute inset-0 racing-stripe-bg opacity-40 pointer-events-none" />
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-[#D4AF37]/[0.04] blur-[100px] pointer-events-none" />

        <div className="w-full max-w-6xl mx-auto px-4 md:px-6 relative z-10">
          <div className="flex items-center gap-2 text-[#6B7A96] text-sm mb-6">
            <a href="/" className="hover:text-[#D4AF37] transition-colors">Главная</a>
            <ChevronRight size={14} />
            <span className="text-[#0D1729]">Каталог</span>
          </div>

          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="h-px w-8 bg-[#D4AF37]" />
                <span className="text-[#D4AF37] text-xs tracking-[0.3em] uppercase font-display">Каталог</span>
              </div>
              <h1 className="font-display text-5xl md:text-6xl shimmer-text">
                АВТО ИЗ-ЗА РУБЕЖА
              </h1>
            </div>
            {!loading && !error && (
              <p className="text-[#6B7A96] text-sm max-w-xs leading-relaxed">
                {total}{" "}
                {total === 1 ? "автомобиль" : total % 10 >= 2 && total % 10 <= 4 && (total % 100 < 10 || total % 100 >= 20) ? "автомобиля" : "автомобилей"} в наличии
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ── Top bar: logo + country + sort ── */}
      <section className={`${embedded ? "relative" : "sticky top-0 z-30"} bg-white shadow-sm border-b border-[#DDE5F2]`}>
        <div className="max-w-[1400px] mx-auto px-4">
          <div className="flex items-center gap-2 py-2.5">
            <a href="/" className="shrink-0 mr-1 hidden md:block">
              <img src="/logo.svg" alt="IM-AUTO" className="h-7 w-auto" />
            </a>
            {/* Country tabs */}
            <div className="flex items-center gap-1">
              {(["all", "korea", "china"] as const).map((c) => {
                const labels = { all: "Все", korea: "🇰🇷 Корея", china: "🇨🇳 Китай" };
                const labelsShort = { all: "Все", korea: "🇰🇷", china: "🇨🇳" };
                return (
                  <button key={c} onClick={() => setCountry(c)}
                    className={`px-3 py-1.5 text-sm font-medium transition-colors rounded-lg ${country === c ? "bg-[#1B3260] text-white" : "text-[#6B7A96] hover:text-[#0D1729]"}`}>
                    <span className="hidden md:inline">{labels[c]}</span>
                    <span className="md:hidden">{labelsShort[c]}</span>
                  </button>
                );
              })}
            </div>
            <div className="ml-auto flex items-center gap-3">
              {/* Total count */}
              {!loading && !error && (
                <span className="hidden md:inline text-[#6B7A96] text-sm">
                  {total.toLocaleString("ru")} авто
                </span>
              )}
              {/* Sort */}
              <PriceSortButton value={priceSort} onChange={setPriceSort} />
              {/* Mobile filter button */}
              <button
                onClick={() => setFiltersOpen(true)}
                className="flex md:hidden items-center gap-2 text-[#D4AF37] text-sm border border-[#D4AF37]/30 px-4 py-2 rounded-lg"
              >
                <SlidersHorizontal size={14} />
                Фильтры
                {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-[#D4AF37]" />}
              </button>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {filtersOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="md:hidden fixed inset-0 z-50 flex flex-col bg-white"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#DDE5F2] shrink-0">
                <span className="text-base font-semibold text-[#0D1729]">Фильтры</span>
                <button
                  onClick={() => setFiltersOpen(false)}
                  className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#F5F7FC] text-[#6B7A96] transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Scrollable content — shrinks when keyboard opens */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5" style={{ scrollbarWidth: "none" }}>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-[#6B7A96] uppercase tracking-wider mb-2">Ценовой сегмент</div>
                    <CategoryDropdown value={pendingCategory} onChange={setPendingCategory} />
                  </div>
                  <div>
                    <div className="text-xs text-[#6B7A96] uppercase tracking-wider mb-2">Сортировка</div>
                    <PriceSortButton value={pendingPriceSort} onChange={setPendingPriceSort} />
                  </div>
                </div>

                <div>
                  <div className="text-xs text-[#6B7A96] uppercase tracking-wider mb-2">Утильсбор</div>
                  <EcoFeeToggle value={pendingEcoFee} onChange={setPendingEcoFee} />
                </div>

                {brands.length > 0 && (
                  <div>
                    <div className="text-xs text-[#6B7A96] uppercase tracking-wider mb-2">Марка</div>
                    <BrandMultiSelect brands={brands} values={pendingBrands} onChange={setPendingBrands} fullWidth />
                  </div>
                )}

                {pendingBrands.length > 0 && availableModels.length > 0 && (
                  <div>
                    <div className="text-xs text-[#6B7A96] uppercase tracking-wider mb-2">Модель</div>
                    <ModelMultiSelect models={availableModels} values={pendingModels} onChange={(v) => { setPendingModels(v); setPendingBodies([]); }} fullWidth />
                  </div>
                )}

                {/* Кузов + Топливо — две колонки */}
                <div className="grid grid-cols-2 gap-3">
                  {availableBodies.length > 0 && (
                    <div>
                      <div className="text-xs text-[#6B7A96] uppercase tracking-wider mb-2">Кузов</div>
                      <BodyMultiSelect bodies={availableBodies} modelGroups={modelGroups} models={pendingModels} values={pendingBodies} onChange={setPendingBodies} fullWidth />
                    </div>
                  )}
                  <div>
                    <div className="text-xs text-[#6B7A96] uppercase tracking-wider mb-2">Топливо</div>
                    <FuelCategoryFilter values={pendingFuelCategories} onChange={setPendingFuelCategories} fullWidth />
                  </div>
                </div>

                {availableYears.length > 0 && (
                  <div>
                    <div className="text-xs text-[#6B7A96] uppercase tracking-wider mb-2">Год выпуска</div>
                    <YearRangeFilter years={availableYears} from={pendingYearFrom} to={pendingYearTo} onFromChange={setPendingYearFrom} onToChange={setPendingYearTo} fullWidth />
                  </div>
                )}

                {/* Объём + Мощность — две колонки */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-[#6B7A96] uppercase tracking-wider mb-2">Объём (л)</div>
                    <VolumeRangeFilter from={pendingVolumeFrom} to={pendingVolumeTo} onFromChange={setPendingVolumeFrom} onToChange={setPendingVolumeTo} fullWidth />
                  </div>
                  <div>
                    <div className="text-xs text-[#6B7A96] uppercase tracking-wider mb-2">Мощность (л.с.)</div>
                    <HpRangeFilter from={pendingHpFrom} to={pendingHpTo} onFromChange={setPendingHpFrom} onToChange={setPendingHpTo} fullWidth />
                  </div>
                </div>

                <div>
                  <div className="text-xs text-[#6B7A96] uppercase tracking-wider mb-2">Пробег (км)</div>
                  <MileageRangeFilter from={pendingMileageFrom} to={pendingMileageTo} onFromChange={setPendingMileageFrom} onToChange={setPendingMileageTo} fullWidth />
                </div>

                <div>
                  <div className="text-xs text-[#6B7A96] uppercase tracking-wider mb-2">Цена под ключ (₽)</div>
                  <PriceRangeFilter from={pendingPriceRubFrom} to={pendingPriceRubTo} onFromChange={setPendingPriceRubFrom} onToChange={setPendingPriceRubTo} fullWidth />
                </div>

              </div>

              {/* Fixed bottom bar — rises above keyboard */}
              <div
                className="shrink-0 px-5 py-4 border-t border-[#DDE5F2] flex items-center gap-3 bg-white transition-[padding]"
                style={{ paddingBottom: `calc(1rem + ${keyboardOffset}px)` }}
              >
                <button
                  onClick={applyFilters}
                  className="flex-1 bg-[#1B3260] hover:bg-[#0F1E3F] text-white text-sm font-semibold py-3.5 rounded-xl transition-colors"
                >
                  Применить
                </button>
                {hasPendingFilters && (
                  <button
                    onClick={() => { resetFilters(); setFiltersOpen(false); }}
                    className="flex items-center gap-1.5 text-[#6B7A96] hover:text-[#0D1729] text-xs transition-colors shrink-0 py-3.5 px-3"
                  >
                    <X size={12} />
                    Сбросить
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* ── Main content: sidebar + grid ── */}
      <div className="w-full max-w-[1400px] mx-auto px-4 md:px-6 py-6 flex gap-6 items-start">

        {/* ── Desktop sidebar ── */}
        <aside className="hidden md:block w-[240px] shrink-0">
          <div className="sticky top-[56px] bg-white border border-[#DDE5F2] rounded-xl p-4 space-y-5 overflow-y-auto max-h-[calc(100vh-72px)]" style={{ scrollbarWidth: "none" }}>

            <div>
              <div className="text-[10px] text-[#A0AAB8] uppercase tracking-widest mb-2">Ценовой сегмент</div>
              <CategoryDropdown value={activeCategory} onChange={setActiveCategory} fullWidth />
            </div>

            {brands.length > 0 && (
              <div>
                <div className="text-[10px] text-[#A0AAB8] uppercase tracking-widest mb-2">Марка</div>
                <BrandMultiSelect brands={brands} values={selectedBrands} onChange={(v) => { setSelectedBrands(v); setPendingBrands(v); }} fullWidth />
              </div>
            )}

            {selectedBrands.length > 0 && availableModels.length > 0 && (
              <div>
                <div className="text-[10px] text-[#A0AAB8] uppercase tracking-widest mb-2">Модель</div>
                <ModelMultiSelect models={availableModels} values={selectedModels} onChange={(v) => { setSelectedModels(v); setPendingModels(v); setSelectedBodies([]); setPendingBodies([]); }} fullWidth />
              </div>
            )}

            {availableBodies.length > 0 && (
              <div>
                <div className="text-[10px] text-[#A0AAB8] uppercase tracking-widest mb-2">Кузов</div>
                <BodyMultiSelect bodies={availableBodies} modelGroups={modelGroups} models={selectedModels} values={selectedBodies} onChange={setSelectedBodies} fullWidth />
              </div>
            )}

            {availableYears.length > 0 && (
              <div>
                <div className="text-[10px] text-[#A0AAB8] uppercase tracking-widest mb-2">Год выпуска</div>
                <YearRangeFilter years={availableYears} from={yearFrom} to={yearTo} onFromChange={setYearFrom} onToChange={setYearTo} fullWidth />
              </div>
            )}

            <div>
              <div className="text-[10px] text-[#A0AAB8] uppercase tracking-widest mb-2">Топливо</div>
              <FuelCategoryFilter values={fuelCategories} onChange={setFuelCategories} fullWidth />
            </div>

            <div>
              <div className="text-[10px] text-[#A0AAB8] uppercase tracking-widest mb-2">Объём (л)</div>
              <VolumeRangeFilter from={volumeFrom} to={volumeTo} onFromChange={setVolumeFrom} onToChange={setVolumeTo} fullWidth />
            </div>

            <div>
              <div className="text-[10px] text-[#A0AAB8] uppercase tracking-widest mb-2">Мощность (л.с.)</div>
              <HpRangeFilter from={hpFrom} to={hpTo} onFromChange={setHpFrom} onToChange={setHpTo} fullWidth />
            </div>

            <div>
              <div className="text-[10px] text-[#A0AAB8] uppercase tracking-widest mb-2">Пробег (км)</div>
              <MileageRangeFilter from={mileageFrom} to={mileageTo} onFromChange={setMileageFrom} onToChange={setMileageTo} fullWidth />
            </div>

            <div>
              <div className="text-[10px] text-[#A0AAB8] uppercase tracking-widest mb-2">Цена под ключ (₽)</div>
              <PriceRangeFilter from={priceRubFrom} to={priceRubTo} onFromChange={setPriceRubFrom} onToChange={setPriceRubTo} fullWidth />
            </div>

            <div>
              <div className="text-[10px] text-[#A0AAB8] uppercase tracking-widest mb-2">Утильсбор</div>
              <EcoFeeToggle value={ecoFee} onChange={setEcoFee} />
            </div>

            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="w-full flex items-center justify-center gap-1.5 text-[#A0AAB8] hover:text-[#6B7A96] text-xs transition-colors py-2 border border-[#DDE5F2] rounded-lg"
              >
                <X size={11} />
                Сбросить фильтры
              </button>
            )}
          </div>
        </aside>

        {/* ── Cards main ── */}
        <main className="flex-1 min-w-0">

          {loading && <SkeletonGrid />}

          {error && !loading && (
            <div className="text-center py-24">
              <div className="text-[#D4AF37]/20 text-8xl font-display mb-4">!</div>
              <p className="text-[#6B7A96]">Не удалось загрузить каталог. Попробуйте позже.</p>
            </div>
          )}

          {!loading && !error && (
            <AnimatePresence mode="wait">
              {visible.length === 0 ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center py-24"
                >
                  <div className="text-[#D4AF37]/20 text-8xl font-display mb-4">∅</div>
                  <p className="text-[#6B7A96] mb-6">Ничего не найдено по выбранным фильтрам</p>
                  <button
                    onClick={resetFilters}
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
                  className="grid grid-cols-1 lg:grid-cols-2 gap-6"
                >
                  {visible.map((car, i) => (
                    <CarCard key={car.id} car={car} index={i} cities={cities} onConsult={() => setModalOpen(true)} />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          )}

          {/* Show more */}
          {!loading && !error && hasMore && (
            <div className="flex justify-center mt-10">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="flex items-center gap-2 border border-[#D4AF37]/40 text-[#D4AF37] px-8 py-3 text-sm font-display uppercase tracking-widest hover:bg-[#D4AF37]/10 transition-all duration-200 disabled:opacity-50"
              >
                {loadingMore
                  ? <><span className="w-4 h-4 border border-[#D4AF37]/40 border-t-[#D4AF37] rounded-full animate-spin" /> Загружаем...</>
                  : `Показать ещё (${total - cars.length} осталось)`
                }
              </button>
            </div>
          )}

          {/* CTA */}
          <motion.div
            className="mt-16 relative overflow-hidden border border-[#DDE5F2] bg-white p-10 text-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="absolute inset-0 racing-stripe-bg opacity-50 pointer-events-none" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-32 bg-[#D4AF37]/[0.04] blur-[60px] pointer-events-none" />
            <div className="relative z-10">
              <div className="text-xs text-[#D4AF37] tracking-[0.3em] uppercase font-display mb-3">Не нашли подходящий?</div>
              <h2 className="font-display text-3xl md:text-4xl text-[#0D1729] mb-4">
                ПОДБЕРЁМ <span className="shimmer-text">ПОД ВАС</span>
              </h2>
              <p className="text-[#6B7A96] mb-8 max-w-md mx-auto text-sm leading-relaxed">
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
        </main>
      </div>

      <ConsultationModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}

/* ── Skeleton ─────────────────────────────────────────────────── */

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="bg-white border border-[#DDE5F2] overflow-hidden animate-pulse">
          <div className="aspect-video bg-[#EBF0FA]" />
          <div className="p-5 space-y-3">
            <div className="h-4 bg-[#EBF0FA] rounded w-3/4" />
            <div className="h-3 bg-[#EBF0FA] rounded w-1/2" />
            <div className="h-px bg-[#EBF0FA]" />
            <div className="h-4 bg-[#EBF0FA] rounded w-1/3 ml-auto" />
            <div className="h-9 bg-[#EBF0FA] rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── SpecChip ────────────────────────────────────────────────── */

// (Cost calculation removed — handled by parser API /api/catalog/cars/[id]/cost)

function SpecChip({ value }: { value: string }) {
  return (
    <span
      className="shrink-0 inline-flex items-center justify-center text-[12px] px-2 py-1.5 border font-display tracking-wide whitespace-nowrap"
      style={{ background: "#F5F7FC", borderColor: "#DDE5F2", color: "#6B7A96", borderRadius: "4px" }}
    >
      {value}
    </span>
  );
}

/* ── Card ─────────────────────────────────────────────────────── */

function CarCard({ car, index, cities, onConsult }: {
  car: Car; index: number; cities: City[]; onConsult: () => void;
}) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const [showCosts, setShowCosts] = useState(false);
  const [selectedCityId, setSelectedCityId] = useState("");
  const [failedPhotos, setFailedPhotos] = useState<Set<string>>(new Set());
  const [apiCosts, setApiCosts] = useState<ApiCosts | null | "loading">(null);
  const [costsLoaded, setCostsLoaded] = useState(false);

  const photos = useMemo(() => car.photos.filter(p => !failedPhotos.has(p)), [car.photos, failedPhotos]);
  const photoTotal = photos.length;

  const displayTotal = car.totalRub ?? 0;
  const displayCategory = car.category;
  const accent = categoryColors[displayCategory] ?? "#D4AF37";
  const isLgotny = typeof apiCosts === "object" && apiCosts !== null &&
    (apiCosts.utilshor_rub === 3_400 || apiCosts.utilshor_rub === 5_200);
  const fmt = (n: number) => `~${n.toLocaleString("ru")} ₽`;
  const selectedCity = cities.find(c => c.id === selectedCityId) ?? null;

  const yearStr = car.year > 0
    ? (car.manufactureMonth ? `${String(car.manufactureMonth).padStart(2, "0")}/${car.year}` : String(car.year))
    : null;

  const fetchCosts = async () => {
    if (costsLoaded) return;
    setApiCosts("loading");
    try {
      const r = await fetch(`/api/catalog/cars/${car.id}/cost`);
      const d = await r.json();
      setApiCosts(d.total_rub !== undefined ? d : null);
    } catch {
      setApiCosts(null);
    }
    setCostsLoaded(true);
  };

  const handleToggleCosts = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!costsLoaded) await fetchCosts();
    setShowCosts(v => !v);
  };

  const go = (dir: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDirection(dir);
    setPhotoIndex(prev => (prev + dir + photoTotal) % photoTotal);
  };

  const handlePhotoError = (url: string) => {
    setFailedPhotos(prev => { const n = new Set(prev); n.add(url); return n; });
    setPhotoIndex(prev => Math.max(0, prev >= photoTotal - 1 ? prev - 1 : prev));
  };

  const noCalc = car.priceWon > 0 && car.totalRub === null;

  return (
    <motion.div
      className="group relative bg-white border border-[#DDE5F2] overflow-hidden flex flex-col"
      style={{ borderRadius: "16px", boxShadow: "0 2px 16px rgba(13,23,41,0.07)" }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.4 }}
      whileHover={{ y: -4, boxShadow: "0 12px 36px rgba(13,23,41,0.14)" }}
    >
      {/* ── Photo ── */}
      <Link href={`/catalog/${car.id}`} className="block shrink-0">
        <div className="relative w-full aspect-[16/9] overflow-hidden bg-[#F5F7FC]">
          {photoTotal > 0 ? (
            <AnimatePresence initial={false} custom={direction}>
              <motion.div
                key={photoIndex} custom={direction}
                variants={{
                  enter: (d: number) => ({ x: d > 0 ? "100%" : "-100%", opacity: 0 }),
                  center: { x: 0, opacity: 1 },
                  exit:  (d: number) => ({ x: d > 0 ? "-100%" : "100%", opacity: 0 }),
                }}
                initial="enter" animate="center" exit="exit"
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-0"
              >
                <Image
                  src={photos[photoIndex]} alt={`${car.brand} ${car.model}`}
                  fill unoptimized className="object-cover object-[center_20%]"
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  onError={() => handlePhotoError(photos[photoIndex])}
                />
              </motion.div>
            </AnimatePresence>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[#D4AF37]/10 text-6xl font-display">AUTO</span>
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/40 pointer-events-none" />

          {photoTotal > 1 && (
            <>
              <button onClick={e => go(-1, e)} className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:text-[#D4AF37]">
                <ChevronLeft size={18} />
              </button>
              <button onClick={e => go(1, e)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:text-[#D4AF37]">
                <ChevronRight size={18} />
              </button>
            </>
          )}

          {photoTotal > 1 && (
            <div className="absolute bottom-3 left-3 text-[10px] text-white/60 bg-black/50 px-2 py-0.5 font-display pointer-events-none">
              {photoIndex + 1} / {photoTotal}
            </div>
          )}

          {car.warnings.length > 0 && (
            <div className="absolute bottom-3 right-3 flex items-center gap-1 text-[10px] text-orange-400 border border-orange-400/40 px-2 py-0.5 bg-[#F5F7FC]/80 backdrop-blur-sm font-display pointer-events-none max-w-[60%]">
              <AlertTriangle size={10} className="shrink-0" />
              <span className="truncate">{car.warnings[0]}</span>
            </div>
          )}
          {isLgotny && car.warnings.length === 0 && (
            <div className="absolute bottom-3 right-3 text-[10px] text-green-400 border border-green-400/40 px-2 py-0.5 bg-[#F5F7FC]/80 backdrop-blur-sm font-display pointer-events-none">
              Льготный утильсбор
            </div>
          )}

          <div className="absolute top-3 left-3 text-[10px] text-[#6B7A96] border border-[#8892A4]/20 px-2 py-0.5 bg-[#F5F7FC]/70 backdrop-blur-sm font-display tracking-wider pointer-events-none">
            {car.country === "china" ? "🇨🇳 Китай" : "🇰🇷 Корея"}
          </div>
          <div className="absolute top-3 right-3 text-[10px] px-2 py-0.5 font-display tracking-wider backdrop-blur-sm pointer-events-none"
            style={{ color: accent, border: `1px solid ${accent}30`, background: `${accent}12` }}>
            {displayCategory}
          </div>
        </div>
      </Link>

      {/* ── Body ── */}
      <div className="flex flex-col flex-1 p-4">

        {/* Title row */}
        <Link href={`/catalog/${car.id}`} className="block mb-2 group/t">
          <div className="font-display text-[15px] text-[#0D1729] leading-tight group-hover/t:text-[#C9A227] transition-colors truncate">
            {car.brand}
          </div>
          <div className="text-[#6B7A96] text-[13px] mt-0.5 truncate">{car.model}</div>
        </Link>

        {/* Specs row */}
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          {yearStr           && <SpecChip value={yearStr} />}
          {car.mileage !== "—" && <SpecChip value={car.mileage} />}
          {(car.engineVolumeCc && car.engineVolumeCc > 100) && <SpecChip value={`${(car.engineVolumeCc / 1000).toFixed(1)} л`} />}
          {car.horsepower    && <SpecChip value={`${car.horsepower} л.с.`} />}
          {car.engine        && <SpecChip value={car.engine} />}
          {car.driveType     && <SpecChip value={car.driveType} />}
        </div>

        {/* Price */}
        <div className="flex items-baseline justify-between py-2.5 border-t border-b border-[#EEF1F8] mb-3">
          <span className="text-[#8892A4] text-[11px] uppercase tracking-wider">Под ключ в РФ</span>
          <span className="font-bold text-[16px] shimmer-text">
            {car.priceWon > 0 && displayTotal > 0 ? `~${displayTotal.toLocaleString("ru")} ₽` : "—"}
          </span>
        </div>

        {/* Contact-manager badge when total_rub is null */}
        {noCalc && (
          <div className="mb-2 px-2.5 py-2 bg-amber-50 border border-amber-200/70 text-[10px] text-amber-700 flex items-start gap-1.5">
            <span className="shrink-0">✦</span>
            <span>Для точного расчёта обратитесь к менеджеру</span>
          </div>
        )}

        {/* Expandable cost breakdown (lazy-loaded from API) */}
        <AnimatePresence>
          {showCosts && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              {apiCosts === "loading" ? (
                <div className="flex justify-center py-4">
                  <div className="w-4 h-4 border-2 border-[#DDE5F2] border-t-[#C9A227] rounded-full animate-spin" />
                </div>
              ) : apiCosts && apiCosts.total_rub !== null ? (
                <div className="mb-3 space-y-1.5">
                  {([
                    ["Авто + расходы в Корее", fmt(apiCosts.price_rub)],
                    ["Утильсбор",             apiCosts.utilshor_rub !== null ? fmt(apiCosts.utilshor_rub) : "—"],
                    ["Таможенная пошлина",    apiCosts.customs_duty_rub !== null ? fmt(apiCosts.customs_duty_rub) : "—"],
                    ["Таможенное оформление", apiCosts.customs_clearance_rub !== null ? fmt(apiCosts.customs_clearance_rub) : "—"],
                    ["Брокер + агент",        fmt(apiCosts.broker_fee_rub + apiCosts.agent_fee_rub)],
                  ] as [string, string][]).map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between text-[11px]">
                      <span className="text-[#8892A4]">{label}</span>
                      <span className="text-[#0D1729] font-display">{value}</span>
                    </div>
                  ))}

                  {cities.length > 0 && (
                    <div className="pt-2">
                      <div className="flex items-center gap-2">
                        <select
                          value={selectedCityId}
                          onChange={e => setSelectedCityId(e.target.value)}
                          className="flex-1 bg-[#F5F7FC] border border-[#DDE5F2] text-[#0D1729] px-2 py-1.5 text-[11px] outline-none focus:border-[#C9A227]"
                        >
                          <option value="">+ Автовоз до города</option>
                          {cities.map(c => <option key={c.id} value={c.id}>{c.name} — ~{c.price.toLocaleString("ru")} ₽</option>)}
                        </select>
                        {selectedCityId && <button onClick={() => setSelectedCityId("")} className="text-[#8892A4] hover:text-[#0D1729] shrink-0"><X size={13} /></button>}
                      </div>
                    </div>
                  )}

                  {selectedCity && apiCosts.total_rub !== null && (
                    <div className="flex items-baseline justify-between pt-2 border-t border-[#EEF1F8]">
                      <span className="text-[#8892A4] text-[10px]">Итого с автовозом</span>
                      <span className="font-bold text-[13px] shimmer-text">
                        ~{(apiCosts.total_rub + selectedCity.price).toLocaleString("ru")} ₽
                      </span>
                    </div>
                  )}
                  <p className="text-[#B0BAC9] text-[10px]">Расчёт ориентировочный</p>
                </div>
              ) : (
                <div className="mb-3 px-2.5 py-2 bg-amber-50 border border-amber-200/70 text-[10px] text-amber-700 flex items-start gap-1.5">
                  <span className="shrink-0">✦</span>
                  <span>Для точного расчёта обратитесь к менеджеру</span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Buttons */}
        <div className="mt-auto flex gap-2">
          {car.priceWon > 0 && (
            <button
              onClick={handleToggleCosts}
              className="flex-1 py-2 text-[11px] uppercase tracking-widest font-display transition-all duration-200 border"
              style={{
                color: showCosts ? "#0A0F1E" : "#D4AF37",
                borderColor: "#D4AF3740",
                background: showCosts ? "#D4AF37" : "transparent",
              }}
            >
              {showCosts ? "Скрыть" : "Расчёт"}
            </button>
          )}
          <Link
            href={`/catalog/${car.id}`}
            className="flex-1 py-2 text-[11px] uppercase tracking-widest font-display transition-all duration-200 border text-center flex items-center justify-center gap-1 hover:opacity-80"
            style={{ color: accent, borderColor: `${accent}40`, background: "transparent" }}
          >
            Подробнее <ChevronRight size={11} />
          </Link>
        </div>
      </div>

      <div
        className="absolute bottom-0 left-0 right-0 h-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
      />
    </motion.div>
  );
}

/* ── CategoryDropdown ────────────────────────────────────────── */

const SEGMENT_OPTIONS: { value: Category; label: string; accent: string; range: string }[] = [
  { value: "ekonom",  label: "Эконом",   accent: "#4ade80", range: "до 1.5M ₽"  },
  { value: "komfort", label: "Комфорт",  accent: "#60a5fa", range: "1.5–3M ₽"   },
  { value: "biznes",  label: "Бизнес",   accent: "#c084fc", range: "3–6M ₽"     },
  { value: "premium", label: "Премиум",  accent: "#D4AF37", range: "от 6M ₽"    },
];

function CategoryDropdown({ value, onChange, fullWidth = false }: {
  value: Category;
  onChange: (v: Category) => void;
  fullWidth?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [localValue, setLocalValue] = useState<Category>(value);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Sync local ← applied when dropdown opens
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) setLocalValue(value); }, [open]);

  const handleOpen = () => {
    if (!open && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 6, left: rect.left });
    }
    setOpen(o => !o);
  };

  const active = value !== "all";
  const selected = SEGMENT_OPTIONS.find(o => o.value === value);
  const label = selected ? selected.label : "Сегмент";

  const handleApply = () => { onChange(localValue); setOpen(false); };

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        onClick={handleOpen}
        className={`flex items-center gap-2 border rounded-full transition-all duration-200 px-3 py-1.5 text-xs font-semibold text-left ${fullWidth ? "w-full" : "min-w-[9rem]"}`}
        style={{
          borderColor: active && selected ? selected.accent + "80" : "#E2E8F0",
          background:  active && selected ? selected.accent + "18" : "#F5F7FC",
          color:       active && selected ? selected.accent : "#6B7A96",
        }}
      >
        <span className="flex-1 truncate">{label}</span>
        {active && (
          <span
            onMouseDown={e => { e.stopPropagation(); onChange("all"); }}
            className="shrink-0 hover:opacity-70 cursor-pointer"
            style={{ color: selected?.accent ?? "#6B7A96" }}
          >
            <X size={11} />
          </span>
        )}
        <ChevronDown size={11} className="shrink-0 text-[#A0AAB8]" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
      </button>

      <AnimatePresence>
        {open && dropdownPos && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className="fixed z-50 w-56 bg-white rounded-xl border border-[#DDE5F2] shadow-lg overflow-hidden"
            style={{ top: dropdownPos.top, left: dropdownPos.left }}
          >
            <ul className="py-1">
              {SEGMENT_OPTIONS.map(opt => {
                const checked = localValue === opt.value;
                return (
                  <li key={opt.value}>
                    <button
                      onMouseDown={e => { e.preventDefault(); setLocalValue(checked ? "all" : opt.value); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors text-left hover:bg-[#F8FAFC]"
                      style={{
                        color:      checked ? opt.accent : "#374151",
                        background: checked ? opt.accent + "12" : "transparent",
                        fontWeight: checked ? 600 : 400,
                      }}
                    >
                      <span
                        className="shrink-0 w-[35px] h-[35px] rounded-md border-2 flex items-center justify-center transition-colors"
                        style={{ borderColor: checked ? opt.accent : "#CBD5E1", background: checked ? opt.accent : "transparent" }}
                      >
                        {checked && <span className="text-white text-[16px] font-bold leading-none">✓</span>}
                      </span>
                      <span className="flex-1">{opt.label}</span>
                      <span className="text-[10px] text-[#A0AAB8]">{opt.range}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="px-3 pb-3 pt-2 border-t border-[#F1F5F9] flex items-center gap-2">
              {localValue !== "all" && (
                <button onMouseDown={e => { e.preventDefault(); setLocalValue("all"); }} className="text-xs text-[#A0AAB8] hover:text-[#6B7A96] transition-colors py-1 px-2 shrink-0">Сбросить</button>
              )}
              <button onMouseDown={e => { e.preventDefault(); handleApply(); }} className="flex-1 bg-[#1B3260] hover:bg-[#0F1E3F] text-white text-sm font-semibold py-3 rounded-xl transition-colors">Применить</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── FuelCategoryFilter ──────────────────────────────────────── */

const FUEL_OPTIONS = [
  { value: "gasoline", label: "Бензин"    },
  { value: "diesel",   label: "Дизель"    },
  { value: "hybrid",   label: "Гибрид"   },
  { value: "electric", label: "Электро"  },
  { value: "gas",      label: "Газ (LPG)" },
];

function FuelCategoryFilter({ values, onChange, fullWidth = false }: {
  values: string[];
  onChange: (v: string[]) => void;
  fullWidth?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [localValues, setLocalValues] = useState<string[]>(values);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (fullWidth) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [fullWidth]);

  // Sync local ← applied when dropdown opens
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) setLocalValues(values); }, [open]);

  const handleOpen = () => {
    if (!fullWidth && !open && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 6, left: rect.left });
    }
    setOpen(o => !o);
  };

  const toggle = (v: string) =>
    setLocalValues(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);

  const hasValue = values.length > 0;
  const hasLocal = localValues.length > 0;
  const label = hasValue
    ? values.length === 1
      ? FUEL_OPTIONS.find(o => o.value === values[0])?.label ?? "Топливо"
      : `${values.length} типа`
    : "Тип топлива";

  const itemsList = (
    <ul className="py-1">
      {FUEL_OPTIONS.map(opt => {
        const checked = localValues.includes(opt.value);
        return (
          <li key={opt.value}>
            <button
              onMouseDown={e => { e.preventDefault(); toggle(opt.value); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors text-left hover:bg-[#F8FAFC] rounded-lg"
              style={{
                color:      checked ? "#92400e" : "#374151",
                background: checked ? "#fffbeb" : "transparent",
                fontWeight: checked ? 600 : 400,
              }}
            >
              <span
                className="shrink-0 w-[35px] h-[35px] rounded-md border-2 flex items-center justify-center transition-colors"
                style={{
                  borderColor: checked ? "#C9A227" : "#CBD5E1",
                  background:  checked ? "#C9A227" : "transparent",
                }}
              >
                {checked && <span className="text-white text-[16px] font-bold leading-none">✓</span>}
              </span>
              {opt.label}
            </button>
          </li>
        );
      })}
    </ul>
  );

  const footer = (
    <div className="px-3 pb-3 pt-2 border-t border-[#F1F5F9] flex items-center gap-2">
      {hasLocal && <button onMouseDown={e => { e.preventDefault(); setLocalValues([]); }} className="text-xs text-[#A0AAB8] hover:text-[#6B7A96] transition-colors py-1 px-2 shrink-0">Сбросить</button>}
      <button onMouseDown={e => { e.preventDefault(); onChange(localValues); setOpen(false); }} className="flex-1 bg-[#1B3260] hover:bg-[#0F1E3F] text-white text-sm font-semibold py-3 rounded-xl transition-colors">Применить</button>
    </div>
  );

  if (fullWidth) {
    return (
      <div>
        <button
          onClick={handleOpen}
          className="w-full flex items-center justify-between border rounded-xl px-4 py-3.5 text-sm font-semibold text-left transition-all duration-200"
          style={{
            borderColor: hasValue ? "#C9A227" : "#E2E8F0",
            background:  hasValue ? "#fffbeb" : "#F5F7FC",
            color:       hasValue ? "#92400e" : "#374151",
          }}
        >
          <span className="flex-1 truncate">{label}</span>
          {hasValue && (
            <span onMouseDown={e => { e.stopPropagation(); onChange([]); }} className="shrink-0 text-[#C9A227] hover:text-[#92400e] cursor-pointer mr-2">
              <X size={14} />
            </span>
          )}
          <ChevronDown size={16} className="shrink-0 text-[#A0AAB8]" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
        </button>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <div className="mt-1 bg-white rounded-xl border border-[#DDE5F2] overflow-hidden">
                {itemsList}{footer}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        onClick={handleOpen}
        className="flex items-center gap-2 border rounded-full transition-all duration-200 px-3 py-1.5 text-xs font-semibold min-w-[9rem] text-left"
        style={{
          borderColor: hasValue ? "#C9A227" : "#E2E8F0",
          background:  hasValue ? "#fffbeb" : "#F5F7FC",
          color:       hasValue ? "#92400e" : "#6B7A96",
        }}
      >
        <span className="flex-1 truncate">{label}</span>
        {hasValue && (
          <span onMouseDown={e => { e.stopPropagation(); onChange([]); }} className="shrink-0 text-[#C9A227] hover:text-[#92400e] cursor-pointer">
            <X size={11} />
          </span>
        )}
        <ChevronDown size={11} className="shrink-0 text-[#A0AAB8]" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
      </button>
      <AnimatePresence>
        {open && dropdownPos && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className="fixed z-50 w-52 bg-white rounded-xl border border-[#DDE5F2] shadow-lg overflow-hidden"
            style={{ top: dropdownPos.top, left: dropdownPos.left }}
          >
            {itemsList}{footer}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── EcoFeeToggle ────────────────────────────────────────────── */

function EcoFeeToggle({ value, onChange }: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-semibold transition-all duration-200 shrink-0 whitespace-nowrap border"
      style={{
        color: value ? "#16A34A" : "#6B7A96",
        borderColor: value ? "#86efac" : "#E2E8F0",
        background: value ? "#f0fdf4" : "#F5F7FC",
      }}
    >
      <span
        className="shrink-0 w-3.5 h-3.5 rounded-sm border flex items-center justify-center transition-colors"
        style={{
          borderColor: value ? "#16A34A" : "#CBD5E1",
          background: value ? "#16A34A" : "transparent",
        }}
      >
        {value && <span className="text-white text-[8px] font-bold leading-none">✓</span>}
      </span>
      Льготный утильсбор
    </button>
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
      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-semibold transition-all duration-200 shrink-0 whitespace-nowrap border"
      style={{
        color: active ? "#92400e" : "#6B7A96",
        borderColor: active ? "#fcd34d" : "#E2E8F0",
        background: active ? "#fffbeb" : "#F5F7FC",
      }}
    >
      <ArrowUpDown size={11} />
      {label}
    </button>
  );
}

/* ── YearRangeFilter ─────────────────────────────────────────── */

function YearRangeFilter({ years, from, to, onFromChange, onToChange, fullWidth }: {
  years: number[];
  from: number | "";
  to: number | "";
  onFromChange: (v: number | "") => void;
  onToChange: (v: number | "") => void;
  fullWidth?: boolean;
}) {
  const minYear = years.length ? Math.min(...years) : 1990;
  const maxYear = years.length ? Math.max(...years) : new Date().getFullYear();

  const [fromRaw, setFromRaw] = useState(from !== "" ? String(from) : "");
  const [toRaw, setToRaw]     = useState(to   !== "" ? String(to)   : "");
  const [fromErr, setFromErr] = useState(false);
  const [toErr,   setToErr]   = useState(false);

  // Sync if parent resets to ""
  useEffect(() => { if (from === "") { setFromRaw(""); setFromErr(false); } }, [from]);
  useEffect(() => { if (to   === "") { setToRaw("");   setToErr(false);   } }, [to]);

  const validate = (raw: string, other: number | "", isFrom: boolean): number | "" | null => {
    if (raw === "") return "";
    const n = Number(raw);
    if (!Number.isInteger(n) || raw.length !== 4) return null;
    if (n < minYear || n > maxYear) return null;
    if (isFrom && other !== "" && n > other) return null;
    if (!isFrom && other !== "" && n < other) return null;
    return n;
  };

  const commitFrom = () => {
    const v = validate(fromRaw, to, true);
    if (v === null) { setFromErr(true); }
    else { setFromErr(false); onFromChange(v); }
  };

  const commitTo = () => {
    const v = validate(toRaw, from, false);
    if (v === null) { setToErr(true); }
    else { setToErr(false); onToChange(v); }
  };

  if (fullWidth) {
    const inCls = (err: boolean, hasVal: boolean) =>
      `w-full text-sm text-center font-medium px-3 py-3 rounded-xl outline-none transition-colors border ` +
      (err
        ? "border-red-400 bg-red-50 text-red-600"
        : hasVal
          ? "border-[#C9A227]/60 bg-[#FFFBEB] text-[#0D1729]"
          : "border-[#DDE5F2] bg-[#F5F7FC] text-[#0D1729] placeholder-[#A0AAB8]");
    return (
      <div className="grid grid-cols-2 gap-3">
        <input type="text" inputMode="numeric" maxLength={4} placeholder="От года"
          value={fromRaw} className={inCls(fromErr, from !== "")}
          onChange={e => { setFromRaw(e.target.value.replace(/\D/g, "")); setFromErr(false); }}
          onBlur={commitFrom} onKeyDown={e => e.key === "Enter" && commitFrom()} />
        <input type="text" inputMode="numeric" maxLength={4} placeholder="До года"
          value={toRaw} className={inCls(toErr, to !== "")}
          onChange={e => { setToRaw(e.target.value.replace(/\D/g, "")); setToErr(false); }}
          onBlur={commitTo} onKeyDown={e => e.key === "Enter" && commitTo()} />
      </div>
    );
  }

  const inputCls = (err: boolean, hasVal: boolean) =>
    `w-[70px] text-xs text-center font-semibold px-2 py-1.5 rounded-full outline-none transition-colors border ` +
    (err
      ? "border-red-400 bg-red-50 text-red-600 focus:border-red-500"
      : hasVal
        ? "border-[#C9A227]/60 bg-[#FFFBEB] text-[#0D1729] focus:border-[#C9A227]"
        : "border-[#E2E8F0] bg-[#F5F7FC] text-[#0D1729] placeholder-[#A0AAB8] focus:border-[#C9A227] focus:bg-white");

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <input
        type="text"
        inputMode="numeric"
        maxLength={4}
        placeholder="От года"
        value={fromRaw}
        className={inputCls(fromErr, from !== "")}
        onChange={e => { setFromRaw(e.target.value.replace(/\D/g, "")); setFromErr(false); }}
        onBlur={commitFrom}
        onKeyDown={e => e.key === "Enter" && commitFrom()}
      />
      <span className="text-[#CBD5E1] text-xs">—</span>
      <input
        type="text"
        inputMode="numeric"
        maxLength={4}
        placeholder="До года"
        value={toRaw}
        className={inputCls(toErr, to !== "")}
        onChange={e => { setToRaw(e.target.value.replace(/\D/g, "")); setToErr(false); }}
        onBlur={commitTo}
        onKeyDown={e => e.key === "Enter" && commitTo()}
      />
    </div>
  );
}

/* ── BodyMultiSelect ─────────────────────────────────────────── */

function BodyMultiSelect({ bodies, modelGroups, models, values, onChange, fullWidth = false }: {
  bodies: string[];
  modelGroups: Record<string, string[]>;
  models: string[];
  values: string[];
  onChange: (v: string[]) => void;
  fullWidth?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [localValues, setLocalValues] = useState<string[]>(values);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Sync local ← applied when dropdown opens
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) setLocalValues(values); }, [open]);

  const toggle = (raw: string) =>
    setLocalValues(prev => prev.includes(raw) ? prev.filter(r => r !== raw) : [...prev, raw]);

  const handleOpen = () => {
    if (!fullWidth && !open && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 6, left: rect.left });
    }
    setOpen(o => !o);
  };

  const hasValue = values.length > 0;
  const hasLocal = localValues.length > 0;
  const label = hasValue
    ? values.length === 1
      ? bodyLabel(values[0], models[0] ?? "")
      : `${values.length} кузова`
    : "Кузов / поколение";

  const grouped: { base: string; raws: string[] }[] = models
    .map(m => ({ base: m, raws: modelGroups[m]?.filter(r => bodies.includes(r)) ?? [] }))
    .filter(g => g.raws.length > 0);

  const itemsList = (
    <ul className="max-h-64 overflow-y-auto py-1">
      {grouped.map(({ base, raws }) => (
        <li key={base}>
          {grouped.length > 1 && <div className="px-3 pt-2 pb-0.5 text-[10px] text-[#A0AAB8] uppercase tracking-wider">{base}</div>}
          {raws.map(raw => {
            const checked = localValues.includes(raw);
            return (
              <button key={raw} onMouseDown={e => { e.preventDefault(); toggle(raw); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors text-left hover:bg-[#F8FAFC]"
                style={{ color: checked ? "#92400e" : "#374151", background: checked ? "#fffbeb" : "transparent", fontWeight: checked ? 600 : 400 }}
              >
                <span className="shrink-0 w-[35px] h-[35px] rounded-md border-2 flex items-center justify-center transition-colors"
                  style={{ borderColor: checked ? "#C9A227" : "#CBD5E1", background: checked ? "#C9A227" : "transparent" }}>
                  {checked && <span className="text-white text-[16px] font-bold leading-none">✓</span>}
                </span>
                {bodyLabel(raw, base)}
              </button>
            );
          })}
        </li>
      ))}
    </ul>
  );

  if (fullWidth) {
    return (
      <div>
        <button onClick={handleOpen}
          className="w-full flex items-center justify-between border rounded-xl px-4 py-3.5 text-sm font-semibold text-left transition-all duration-200"
          style={{ borderColor: hasValue ? "#C9A227" : "#E2E8F0", background: hasValue ? "#fffbeb" : "#F5F7FC", color: hasValue ? "#92400e" : "#374151" }}
        >
          <span className="flex-1 truncate">{label}</span>
          {hasValue && <span onMouseDown={e => { e.stopPropagation(); onChange([]); }} className="shrink-0 text-[#C9A227] hover:text-[#92400e] cursor-pointer mr-2"><X size={14} /></span>}
          <ChevronDown size={16} className="shrink-0 text-[#A0AAB8]" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
        </button>
        <AnimatePresence>
          {open && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
              <div className="mt-1 bg-white rounded-xl border border-[#DDE5F2] overflow-hidden">
                {itemsList}
                <div className="px-3 pb-3 pt-2 border-t border-[#F1F5F9] flex items-center gap-2">
                  {hasLocal && <button onMouseDown={e => { e.preventDefault(); setLocalValues([]); }} className="text-xs text-[#A0AAB8] hover:text-[#6B7A96] transition-colors py-1 px-2 shrink-0">Сбросить</button>}
                  <button onMouseDown={e => { e.preventDefault(); onChange(localValues); setOpen(false); }} className="flex-1 bg-[#1B3260] hover:bg-[#0F1E3F] text-white text-sm font-semibold py-3 rounded-xl transition-colors">Применить</button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button onClick={handleOpen}
        className="flex items-center gap-2 border rounded-full transition-all duration-200 px-3 py-1.5 text-xs font-semibold min-w-[8rem] text-left"
        style={{ borderColor: hasValue ? "#C9A227" : "#E2E8F0", background: hasValue ? "#fffbeb" : "#F5F7FC", color: hasValue ? "#92400e" : "#6B7A96" }}
      >
        <span className="flex-1 truncate">{label}</span>
        {hasValue && <span onMouseDown={e => { e.stopPropagation(); onChange([]); }} className="shrink-0 text-[#C9A227] hover:text-[#92400e] cursor-pointer"><X size={11} /></span>}
        <ChevronDown size={11} className="shrink-0 text-[#A0AAB8]" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
      </button>
      <AnimatePresence>
        {open && dropdownPos && (
          <motion.div initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={{ duration: 0.12 }}
            className="fixed z-50 w-52 bg-white rounded-xl border border-[#DDE5F2] shadow-lg overflow-hidden"
            style={{ top: dropdownPos.top, left: dropdownPos.left }}
          >
            {itemsList}
            <div className="px-3 pb-3 pt-2 border-t border-[#F1F5F9] flex items-center gap-2">
              {hasLocal && <button onMouseDown={e => { e.preventDefault(); setLocalValues([]); }} className="text-xs text-[#A0AAB8] hover:text-[#6B7A96] transition-colors py-1 px-2 shrink-0">Сбросить</button>}
              <button onMouseDown={e => { e.preventDefault(); onChange(localValues); setOpen(false); }} className="flex-1 bg-[#1B3260] hover:bg-[#0F1E3F] text-white text-sm font-semibold py-3 rounded-xl transition-colors">Применить</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── VolumeRangeFilter ───────────────────────────────────────── */

function VolumeRangeFilter({ from, to, onFromChange, onToChange, fullWidth }: {
  from: number | "";
  to: number | "";
  onFromChange: (v: number | "") => void;
  onToChange: (v: number | "") => void;
  fullWidth?: boolean;
}) {
  const [fromRaw, setFromRaw] = useState(from !== "" ? String(from / 1000) : "");
  const [toRaw, setToRaw]     = useState(to   !== "" ? String(to   / 1000) : "");
  const [fromErr, setFromErr] = useState(false);
  const [toErr,   setToErr]   = useState(false);

  useEffect(() => { if (from === "") { setFromRaw(""); setFromErr(false); } }, [from]);
  useEffect(() => { if (to   === "") { setToRaw("");   setToErr(false);   } }, [to]);

  const parse = (raw: string): number | null => {
    if (raw === "") return 0;
    const n = parseFloat(raw.replace(",", "."));
    if (isNaN(n) || n < 0.5 || n > 10) return null;
    return Math.round(n * 1000);
  };

  const commitFrom = () => {
    if (fromRaw === "") { setFromErr(false); onFromChange(""); return; }
    const cc = parse(fromRaw);
    if (cc === null) { setFromErr(true); return; }
    if (to !== "" && cc > to) { setFromErr(true); return; }
    setFromErr(false);
    onFromChange(cc);
  };

  const commitTo = () => {
    if (toRaw === "") { setToErr(false); onToChange(""); return; }
    const cc = parse(toRaw);
    if (cc === null) { setToErr(true); return; }
    if (from !== "" && cc < from) { setToErr(true); return; }
    setToErr(false);
    onToChange(cc);
  };

  const baseCls = (err: boolean, hasVal: boolean, wide: boolean) =>
    `${wide ? "w-full" : "w-[70px]"} text-${wide ? "sm" : "xs"} text-center font-${wide ? "medium" : "semibold"} px-2 py-${wide ? "3" : "1.5"} rounded-${wide ? "xl" : "full"} outline-none transition-colors border ` +
    (err
      ? "border-red-400 bg-red-50 text-red-600"
      : hasVal
        ? "border-[#C9A227]/60 bg-[#FFFBEB] text-[#0D1729]"
        : `border-[${wide ? "#DDE5F2" : "#E2E8F0"}] bg-[#F5F7FC] text-[#0D1729] placeholder-[#A0AAB8]`);

  if (fullWidth) {
    return (
      <div className="grid grid-cols-2 gap-3">
        <input type="text" inputMode="decimal" maxLength={4} placeholder="От л"
          value={fromRaw} className={baseCls(fromErr, from !== "", true)}
          onChange={e => { setFromRaw(e.target.value); setFromErr(false); }}
          onBlur={commitFrom} onKeyDown={e => e.key === "Enter" && commitFrom()} />
        <input type="text" inputMode="decimal" maxLength={4} placeholder="До л"
          value={toRaw} className={baseCls(toErr, to !== "", true)}
          onChange={e => { setToRaw(e.target.value); setToErr(false); }}
          onBlur={commitTo} onKeyDown={e => e.key === "Enter" && commitTo()} />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <input
        type="text"
        inputMode="decimal"
        maxLength={4}
        placeholder="От л"
        value={fromRaw}
        className={baseCls(fromErr, from !== "", false)}
        onChange={e => { setFromRaw(e.target.value); setFromErr(false); }}
        onBlur={commitFrom}
        onKeyDown={e => e.key === "Enter" && commitFrom()}
      />
      <span className="text-[#CBD5E1] text-xs">—</span>
      <input
        type="text"
        inputMode="decimal"
        maxLength={4}
        placeholder="До л"
        value={toRaw}
        className={baseCls(toErr, to !== "", false)}
        onChange={e => { setToRaw(e.target.value); setToErr(false); }}
        onBlur={commitTo}
        onKeyDown={e => e.key === "Enter" && commitTo()}
      />
    </div>
  );
}

/* ── MileageRangeFilter ──────────────────────────────────────── */

function MileageRangeFilter({ from, to, onFromChange, onToChange, fullWidth }: {
  from: number | "";
  to: number | "";
  onFromChange: (v: number | "") => void;
  onToChange: (v: number | "") => void;
  fullWidth?: boolean;
}) {
  const [fromRaw, setFromRaw] = useState(from !== "" ? String(from) : "");
  const [toRaw, setToRaw]     = useState(to   !== "" ? String(to)   : "");
  const [fromErr, setFromErr] = useState(false);
  const [toErr,   setToErr]   = useState(false);

  useEffect(() => { if (from === "") { setFromRaw(""); setFromErr(false); } }, [from]);
  useEffect(() => { if (to   === "") { setToRaw("");   setToErr(false);   } }, [to]);

  const parse = (raw: string): number | null => {
    if (raw === "") return 0;
    const n = parseInt(raw.replace(/\s/g, ""), 10);
    if (isNaN(n) || n < 0 || n > 1000000) return null;
    return n;
  };

  const commitFrom = () => {
    if (fromRaw === "") { setFromErr(false); onFromChange(""); return; }
    const v = parse(fromRaw);
    if (v === null) { setFromErr(true); return; }
    if (to !== "" && v > to) { setFromErr(true); return; }
    setFromErr(false); onFromChange(v);
  };

  const commitTo = () => {
    if (toRaw === "") { setToErr(false); onToChange(""); return; }
    const v = parse(toRaw);
    if (v === null) { setToErr(true); return; }
    if (from !== "" && v < from) { setToErr(true); return; }
    setToErr(false); onToChange(v);
  };

  const baseCls = (err: boolean, hasVal: boolean, wide: boolean) =>
    `${wide ? "w-full" : "w-[80px]"} text-${wide ? "sm" : "xs"} text-center font-${wide ? "medium" : "semibold"} px-2 py-${wide ? "3" : "1.5"} rounded-${wide ? "xl" : "full"} outline-none transition-colors border ` +
    (err
      ? "border-red-400 bg-red-50 text-red-600"
      : hasVal
        ? "border-[#C9A227]/60 bg-[#FFFBEB] text-[#0D1729]"
        : `border-[${wide ? "#DDE5F2" : "#E2E8F0"}] bg-[#F5F7FC] text-[#0D1729] placeholder-[#A0AAB8]`);

  if (fullWidth) {
    return (
      <div className="grid grid-cols-2 gap-3">
        <input type="text" inputMode="numeric" placeholder="Мин км"
          value={fromRaw} className={baseCls(fromErr, from !== "", true)}
          onChange={e => { setFromRaw(e.target.value.replace(/\D/g, "")); setFromErr(false); }}
          onBlur={commitFrom} onKeyDown={e => e.key === "Enter" && commitFrom()} />
        <input type="text" inputMode="numeric" placeholder="Макс км"
          value={toRaw} className={baseCls(toErr, to !== "", true)}
          onChange={e => { setToRaw(e.target.value.replace(/\D/g, "")); setToErr(false); }}
          onBlur={commitTo} onKeyDown={e => e.key === "Enter" && commitTo()} />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <input type="text" inputMode="numeric" placeholder="От км"
        value={fromRaw} className={baseCls(fromErr, from !== "", false)}
        onChange={e => { setFromRaw(e.target.value.replace(/\D/g, "")); setFromErr(false); }}
        onBlur={commitFrom} onKeyDown={e => e.key === "Enter" && commitFrom()} />
      <span className="text-[#CBD5E1] text-xs">—</span>
      <input type="text" inputMode="numeric" placeholder="До км"
        value={toRaw} className={baseCls(toErr, to !== "", false)}
        onChange={e => { setToRaw(e.target.value.replace(/\D/g, "")); setToErr(false); }}
        onBlur={commitTo} onKeyDown={e => e.key === "Enter" && commitTo()} />
    </div>
  );
}

/* ── HpRangeFilter ───────────────────────────────────────────── */

function HpRangeFilter({ from, to, onFromChange, onToChange, fullWidth }: {
  from: number | "";
  to: number | "";
  onFromChange: (v: number | "") => void;
  onToChange: (v: number | "") => void;
  fullWidth?: boolean;
}) {
  const [fromRaw, setFromRaw] = useState(from !== "" ? String(from) : "");
  const [toRaw, setToRaw]     = useState(to   !== "" ? String(to)   : "");
  const [fromErr, setFromErr] = useState(false);
  const [toErr,   setToErr]   = useState(false);

  useEffect(() => { if (from === "") { setFromRaw(""); setFromErr(false); } }, [from]);
  useEffect(() => { if (to   === "") { setToRaw("");   setToErr(false);   } }, [to]);

  const parse = (raw: string): number | null => {
    if (raw === "") return 0;
    const n = parseInt(raw, 10);
    if (isNaN(n) || n < 1 || n > 2000) return null;
    return n;
  };

  const commitFrom = () => {
    if (fromRaw === "") { setFromErr(false); onFromChange(""); return; }
    const v = parse(fromRaw);
    if (v === null) { setFromErr(true); return; }
    if (to !== "" && v > to) { setFromErr(true); return; }
    setFromErr(false); onFromChange(v);
  };

  const commitTo = () => {
    if (toRaw === "") { setToErr(false); onToChange(""); return; }
    const v = parse(toRaw);
    if (v === null) { setToErr(true); return; }
    if (from !== "" && v < from) { setToErr(true); return; }
    setToErr(false); onToChange(v);
  };

  const baseCls = (err: boolean, hasVal: boolean, wide: boolean) =>
    `${wide ? "w-full" : "w-[70px]"} text-${wide ? "sm" : "xs"} text-center font-${wide ? "medium" : "semibold"} px-2 py-${wide ? "3" : "1.5"} rounded-${wide ? "xl" : "full"} outline-none transition-colors border ` +
    (err
      ? "border-red-400 bg-red-50 text-red-600"
      : hasVal
        ? "border-[#C9A227]/60 bg-[#FFFBEB] text-[#0D1729]"
        : `border-[${wide ? "#DDE5F2" : "#E2E8F0"}] bg-[#F5F7FC] text-[#0D1729] placeholder-[#A0AAB8]`);

  if (fullWidth) {
    return (
      <div className="grid grid-cols-2 gap-3">
        <input type="text" inputMode="numeric" placeholder="От л.с."
          value={fromRaw} className={baseCls(fromErr, from !== "", true)}
          onChange={e => { setFromRaw(e.target.value.replace(/\D/g, "")); setFromErr(false); }}
          onBlur={commitFrom} onKeyDown={e => e.key === "Enter" && commitFrom()} />
        <input type="text" inputMode="numeric" placeholder="До л.с."
          value={toRaw} className={baseCls(toErr, to !== "", true)}
          onChange={e => { setToRaw(e.target.value.replace(/\D/g, "")); setToErr(false); }}
          onBlur={commitTo} onKeyDown={e => e.key === "Enter" && commitTo()} />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <input type="text" inputMode="numeric" placeholder="От л.с."
        value={fromRaw} className={baseCls(fromErr, from !== "", false)}
        onChange={e => { setFromRaw(e.target.value.replace(/\D/g, "")); setFromErr(false); }}
        onBlur={commitFrom} onKeyDown={e => e.key === "Enter" && commitFrom()} />
      <span className="text-[#CBD5E1] text-xs">—</span>
      <input type="text" inputMode="numeric" placeholder="До л.с."
        value={toRaw} className={baseCls(toErr, to !== "", false)}
        onChange={e => { setToRaw(e.target.value.replace(/\D/g, "")); setToErr(false); }}
        onBlur={commitTo} onKeyDown={e => e.key === "Enter" && commitTo()} />
    </div>
  );
}

/* ── PriceRangeFilter ────────────────────────────────────────── */
// Values are in plain RUB (e.g. 2000000 = 2 000 000 ₽)

function formatRub(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function parseRub(raw: string): number | null {
  // Accept "2000000", "2 000 000", "2 000 000", "2,000,000"
  const cleaned = raw.replace(/[\s ,]/g, "");
  if (cleaned === "") return 0;
  const n = parseInt(cleaned, 10);
  if (isNaN(n) || n < 0) return null;
  return n;
}

function PriceRangeFilter({ from, to, onFromChange, onToChange, fullWidth }: {
  from: number | "";
  to: number | "";
  onFromChange: (v: number | "") => void;
  onToChange: (v: number | "") => void;
  fullWidth?: boolean;
}) {
  const [fromRaw, setFromRaw] = useState(from !== "" ? formatRub(Number(from)) : "");
  const [toRaw, setToRaw]     = useState(to   !== "" ? formatRub(Number(to))   : "");
  const [fromErr, setFromErr] = useState(false);
  const [toErr,   setToErr]   = useState(false);

  useEffect(() => { if (from === "") { setFromRaw(""); setFromErr(false); } else { setFromRaw(formatRub(Number(from))); } }, [from]);
  useEffect(() => { if (to   === "") { setToRaw("");   setToErr(false);   } else { setToRaw(formatRub(Number(to)));   } }, [to]);

  const commitFrom = () => {
    if (fromRaw === "") { setFromErr(false); onFromChange(""); return; }
    const v = parseRub(fromRaw);
    if (v === null || v < 100_000 || v > 50_000_000_000) { setFromErr(true); return; }
    if (to !== "" && v > Number(to)) { setFromErr(true); return; }
    setFromErr(false);
    setFromRaw(formatRub(v));
    onFromChange(v);
  };

  const commitTo = () => {
    if (toRaw === "") { setToErr(false); onToChange(""); return; }
    const v = parseRub(toRaw);
    if (v === null || v < 100_000 || v > 50_000_000_000) { setToErr(true); return; }
    if (from !== "" && v < Number(from)) { setToErr(true); return; }
    setToErr(false);
    setToRaw(formatRub(v));
    onToChange(v);
  };

  const baseCls = (err: boolean, hasVal: boolean, wide: boolean) =>
    `${wide ? "w-full" : "w-[96px]"} text-${wide ? "sm" : "xs"} text-center font-${wide ? "medium" : "semibold"} px-2 py-${wide ? "3" : "1.5"} rounded-${wide ? "xl" : "full"} outline-none transition-colors border ` +
    (err
      ? "border-red-400 bg-red-50 text-red-600"
      : hasVal
        ? "border-[#C9A227]/60 bg-[#FFFBEB] text-[#0D1729]"
        : `border-[${wide ? "#DDE5F2" : "#E2E8F0"}] bg-[#F5F7FC] text-[#0D1729] placeholder-[#A0AAB8]`);

  if (fullWidth) {
    return (
      <div className="grid grid-cols-2 gap-3">
        <input type="text" inputMode="numeric" placeholder="От ₽"
          value={fromRaw} className={baseCls(fromErr, from !== "", true)}
          onChange={e => { setFromRaw(e.target.value.replace(/[^\d\s]/g, "")); setFromErr(false); }}
          onBlur={commitFrom} onKeyDown={e => e.key === "Enter" && commitFrom()} />
        <input type="text" inputMode="numeric" placeholder="До ₽"
          value={toRaw} className={baseCls(toErr, to !== "", true)}
          onChange={e => { setToRaw(e.target.value.replace(/[^\d\s]/g, "")); setToErr(false); }}
          onBlur={commitTo} onKeyDown={e => e.key === "Enter" && commitTo()} />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <input type="text" inputMode="numeric" placeholder="От ₽"
        value={fromRaw} className={baseCls(fromErr, from !== "", false)}
        onChange={e => { setFromRaw(e.target.value.replace(/[^\d\s]/g, "")); setFromErr(false); }}
        onBlur={commitFrom} onKeyDown={e => e.key === "Enter" && commitFrom()} />
      <span className="text-[#CBD5E1] text-xs">—</span>
      <input type="text" inputMode="numeric" placeholder="До ₽"
        value={toRaw} className={baseCls(toErr, to !== "", false)}
        onChange={e => { setToRaw(e.target.value.replace(/[^\d\s]/g, "")); setToErr(false); }}
        onBlur={commitTo} onKeyDown={e => e.key === "Enter" && commitTo()} />
      <span className="text-[#94A3B8] text-[10px] shrink-0">₽</span>
    </div>
  );
}

/* ── BrandMultiSelect ────────────────────────────────────────── */

function BrandMultiSelect({ brands, values, onChange, fullWidth = false }: {
  brands: string[];
  values: string[];
  onChange: (brands: string[]) => void;
  fullWidth?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [localValues, setLocalValues] = useState<string[]>(values);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return brands;
    return brands.filter(b =>
      translateBrand(b).toLowerCase().includes(q) || b.toLowerCase().includes(q)
    );
  }, [brands, query]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Sync local ← applied when dropdown opens
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) setLocalValues(values); }, [open]);

  const toggle = (brand: string) => {
    setLocalValues(prev => prev.includes(brand) ? prev.filter(b => b !== brand) : [...prev, brand]);
  };

  const handleOpen = () => {
    if (!fullWidth && !open && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 6, left: rect.left });
    }
    setOpen(o => !o);
    if (!open) setTimeout(() => inputRef.current?.focus(), 50);
  };

  const hasValue = values.length > 0;
  const hasLocal = localValues.length > 0;
  const label = values.length === 0 ? "Марка" : values.length === 1 ? translateBrand(values[0]) : `${values.length} марки`;

  const searchBox = (
    <div className="p-2 border-b border-[#F1F5F9]">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Поиск марки…"
        className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-2.5 py-1.5 text-xs text-[#0D1729] placeholder-[#A0AAB8] outline-none focus:border-[#C9A227] focus:bg-white transition-colors"
      />
    </div>
  );
  const itemsList = (
    <ul className="max-h-52 overflow-y-auto py-1">
      {filtered.length === 0 && <li className="px-3 py-3 text-xs text-[#A0AAB8] text-center">Не найдено</li>}
      {filtered.map((brand) => {
        const checked = localValues.includes(brand);
        return (
          <li key={brand}>
            <button
              onMouseDown={(e) => { e.preventDefault(); toggle(brand); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors text-left hover:bg-[#F8FAFC] rounded-lg"
              style={{ color: checked ? "#92400e" : "#374151", background: checked ? "#fffbeb" : "transparent", fontWeight: checked ? 600 : 400 }}
            >
              <span className="shrink-0 w-[35px] h-[35px] rounded-md border-2 flex items-center justify-center transition-colors"
                style={{ borderColor: checked ? "#C9A227" : "#CBD5E1", background: checked ? "#C9A227" : "transparent" }}>
                {checked && <span className="text-white text-[16px] font-bold leading-none">✓</span>}
              </span>
              {translateBrand(brand)}
            </button>
          </li>
        );
      })}
    </ul>
  );
  const footer = (
    <div className="px-3 pb-3 pt-2 border-t border-[#F1F5F9] flex items-center gap-2">
      {hasLocal && <button onMouseDown={(e) => { e.preventDefault(); setLocalValues([]); }} className="text-xs text-[#A0AAB8] hover:text-[#6B7A96] transition-colors py-1 px-2 shrink-0">Сбросить</button>}
      <button onMouseDown={(e) => { e.preventDefault(); onChange(localValues); setOpen(false); setQuery(""); }} className="flex-1 bg-[#1B3260] hover:bg-[#0F1E3F] text-white text-sm font-semibold py-3 rounded-xl transition-colors">Применить</button>
    </div>
  );

  if (fullWidth) {
    return (
      <div>
        <button
          onClick={handleOpen}
          className="w-full flex items-center justify-between border rounded-xl px-4 py-3.5 text-sm font-semibold text-left transition-all duration-200"
          style={{ borderColor: hasValue ? "#C9A227" : "#E2E8F0", background: hasValue ? "#fffbeb" : "#F5F7FC", color: hasValue ? "#92400e" : "#374151" }}
        >
          <span className="flex-1 truncate">{label}</span>
          {hasValue && <span onMouseDown={(e) => { e.stopPropagation(); onChange([]); }} className="shrink-0 text-[#C9A227] hover:text-[#92400e] cursor-pointer mr-2"><X size={14} /></span>}
          <ChevronDown size={16} className="shrink-0 text-[#A0AAB8]" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
        </button>
        <AnimatePresence>
          {open && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
              <div className="mt-1 bg-white rounded-xl border border-[#DDE5F2] overflow-hidden">
                {searchBox}{itemsList}{footer}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        onClick={handleOpen}
        className="flex items-center gap-2 border rounded-full transition-all duration-200 px-3 py-1.5 text-xs font-semibold min-w-[9rem] text-left"
        style={{ borderColor: hasValue ? "#C9A227" : "#E2E8F0", background: hasValue ? "#fffbeb" : "#F5F7FC", color: hasValue ? "#92400e" : "#6B7A96" }}
      >
        <span className="flex-1 truncate">{label}</span>
        {hasValue && <span onMouseDown={(e) => { e.stopPropagation(); onChange([]); }} className="shrink-0 text-[#C9A227] hover:text-[#92400e] cursor-pointer"><X size={11} /></span>}
        <ChevronDown size={11} className="shrink-0 text-[#A0AAB8]" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
      </button>
      <AnimatePresence>
        {open && dropdownPos && (
          <motion.div initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={{ duration: 0.12 }}
            className="fixed z-50 w-56 bg-white rounded-xl border border-[#DDE5F2] shadow-lg overflow-hidden"
            style={{ top: dropdownPos.top, left: dropdownPos.left }}
          >
            {searchBox}{itemsList}{footer}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── ModelMultiSelect ────────────────────────────────────────── */

function ModelMultiSelect({ models, values, onChange, fullWidth = false }: {
  models: string[];
  values: string[];
  onChange: (models: string[]) => void;
  fullWidth?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [localValues, setLocalValues] = useState<string[]>(values);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter(m =>
      translateModel(m).toLowerCase().includes(q) || m.toLowerCase().includes(q)
    );
  }, [models, query]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Sync local ← applied when dropdown opens
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) setLocalValues(values); }, [open]);

  const toggle = (model: string) => {
    setLocalValues(prev => prev.includes(model) ? prev.filter(m => m !== model) : [...prev, model]);
  };

  const handleOpen = () => {
    if (!fullWidth && !open && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 6, left: rect.left });
    }
    setOpen(o => !o);
    if (!open) setTimeout(() => inputRef.current?.focus(), 50);
  };

  const label = values.length === 0 ? "Модель" : values.length === 1 ? translateModel(values[0]) : `${values.length} модели`;
  const hasValue = values.length > 0;
  const hasLocal = localValues.length > 0;

  const searchBox = (
    <div className="p-2 border-b border-[#F1F5F9]">
      <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск модели…"
        className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-2.5 py-1.5 text-xs text-[#0D1729] placeholder-[#A0AAB8] outline-none focus:border-[#C9A227] focus:bg-white transition-colors" />
    </div>
  );
  const itemsList = (
    <ul className="max-h-52 overflow-y-auto py-1">
      {filtered.length === 0 && <li className="px-3 py-3 text-xs text-[#A0AAB8] text-center">Не найдено</li>}
      {filtered.map((model) => {
        const checked = localValues.includes(model);
        return (
          <li key={model}>
            <button onMouseDown={(e) => { e.preventDefault(); toggle(model); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors text-left hover:bg-[#F8FAFC]"
              style={{ color: checked ? "#92400e" : "#374151", background: checked ? "#fffbeb" : "transparent", fontWeight: checked ? 600 : 400 }}
            >
              <span className="shrink-0 w-[35px] h-[35px] rounded-md border-2 flex items-center justify-center transition-colors"
                style={{ borderColor: checked ? "#C9A227" : "#CBD5E1", background: checked ? "#C9A227" : "transparent" }}>
                {checked && <span className="text-white text-[16px] font-bold leading-none">✓</span>}
              </span>
              {translateModel(model)}
            </button>
          </li>
        );
      })}
    </ul>
  );
  const footer = (
    <div className="px-3 pb-3 pt-2 border-t border-[#F1F5F9] flex items-center gap-2">
      {hasLocal && <button onMouseDown={(e) => { e.preventDefault(); setLocalValues([]); }} className="text-xs text-[#A0AAB8] hover:text-[#6B7A96] transition-colors py-1 px-2 shrink-0">Сбросить</button>}
      <button onMouseDown={(e) => { e.preventDefault(); onChange(localValues); setOpen(false); setQuery(""); }} className="flex-1 bg-[#1B3260] hover:bg-[#0F1E3F] text-white text-sm font-semibold py-3 rounded-xl transition-colors">Применить</button>
    </div>
  );

  if (fullWidth) {
    return (
      <div>
        <button onClick={handleOpen}
          className="w-full flex items-center justify-between border rounded-xl px-4 py-3.5 text-sm font-semibold text-left transition-all duration-200"
          style={{ borderColor: hasValue ? "#C9A227" : "#E2E8F0", background: hasValue ? "#fffbeb" : "#F5F7FC", color: hasValue ? "#92400e" : "#374151" }}
        >
          <span className="flex-1 truncate">{label}</span>
          {hasValue && <span onMouseDown={(e) => { e.stopPropagation(); onChange([]); }} className="shrink-0 text-[#C9A227] hover:text-[#92400e] cursor-pointer mr-2"><X size={14} /></span>}
          <ChevronDown size={16} className="shrink-0 text-[#A0AAB8]" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
        </button>
        <AnimatePresence>
          {open && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
              <div className="mt-1 bg-white rounded-xl border border-[#DDE5F2] overflow-hidden">
                {searchBox}{itemsList}{footer}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button onClick={handleOpen}
        className="flex items-center gap-2 border rounded-full transition-all duration-200 px-3 py-1.5 text-xs font-semibold min-w-[9rem] text-left"
        style={{ borderColor: hasValue ? "#C9A227" : "#E2E8F0", background: hasValue ? "#fffbeb" : "#F5F7FC", color: hasValue ? "#92400e" : "#6B7A96" }}
      >
        <span className="flex-1 truncate">{label}</span>
        {hasValue && <span onMouseDown={(e) => { e.stopPropagation(); onChange([]); }} className="shrink-0 text-[#C9A227] hover:text-[#92400e] cursor-pointer"><X size={11} /></span>}
        <ChevronDown size={11} className="shrink-0 text-[#A0AAB8]" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
      </button>
      <AnimatePresence>
        {open && dropdownPos && (
          <motion.div initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={{ duration: 0.12 }}
            className="fixed z-50 w-56 bg-white rounded-xl border border-[#DDE5F2] shadow-lg overflow-hidden"
            style={{ top: dropdownPos.top, left: dropdownPos.left }}
          >
            {searchBox}{itemsList}{footer}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

