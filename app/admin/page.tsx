"use client";

import { useState, useRef, useCallback } from "react";
import { Plus, Upload, Trash2, Eye, LogOut, X, Check, Car, KeyRound, Settings2, TrendingUp, RefreshCw, MapPin, Pencil } from "lucide-react";

type Work = {
  brand: string;
  model: string;
  year: number;
  mileage: string;
  price: string;
  country: string;
  category: string;
  specs: string;
  photos: string[];
};

const COUNTRIES = ["Корея", "Китай", "Япония", "Европа", "США"];

const SEGMENTS = ["Эконом", "Комфорт", "Бизнес", "Премиум"] as const;
type Segment = typeof SEGMENTS[number];

type SegmentFees = { broker_fee: number; agent_fee: number; car_markup: number; car_markup_type: "fixed" | "percent" };
type FeesMap = Record<Segment, SegmentFees>;

const DEFAULT_FEES: FeesMap = {
  Эконом:  { broker_fee: 0, agent_fee: 0, car_markup: 0, car_markup_type: "fixed" },
  Комфорт: { broker_fee: 0, agent_fee: 0, car_markup: 0, car_markup_type: "fixed" },
  Бизнес:  { broker_fee: 0, agent_fee: 0, car_markup: 0, car_markup_type: "fixed" },
  Премиум: { broker_fee: 0, agent_fee: 0, car_markup: 0, car_markup_type: "fixed" },
};

const SEG_COLORS: Record<Segment, string> = {
  Эконом:  "#4ade80",
  Комфорт: "#60a5fa",
  Бизнес:  "#c084fc",
  Премиум: "#D4AF37",
};

function categoryFromPrice(priceStr: string): string {
  const num = parseInt(priceStr.replace(/\D/g, ""), 10);
  if (!num) return "Комфорт";
  if (num < 1_500_000) return "Эконом";
  if (num < 3_000_000) return "Комфорт";
  if (num < 6_000_000) return "Бизнес";
  return "Премиум";
}

const emptyForm = {
  brand: "",
  model: "",
  year: new Date().getFullYear(),
  mileage: "",
  price: "",
  country: "Корея",
  specs: "",
};

const inputClass =
  "w-full bg-[#070B17] border border-[rgba(212,175,55,0.18)] text-[#F0EDE8] px-4 py-2.5 outline-none focus:border-[#D4AF37] transition-colors text-sm placeholder:text-[#4a5568]";

const labelClass = "text-[#8892A4] text-[11px] uppercase tracking-widest mb-1.5 block";

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [tab, setTab] = useState<"cars" | "fees" | "rate" | "cities" | "password">("cars");

  const [fees, setFees] = useState<FeesMap>(DEFAULT_FEES);
  const [koreaFeeWon, setKoreaFeeWon] = useState(2500000);
  const [koreaFeeInput, setKoreaFeeInput] = useState("2500000");
  const [feesLoaded, setFeesLoaded] = useState(false);
  const [feesSaving, setFeesSaving] = useState(false);

  const [works, setWorks] = useState<Work[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Rate state ─────────────────────────────────────────────
  const [rateData, setRateData] = useState<{
    wonRate: number; updatedAt: string | null; source: string;
  } | null>(null);
  const [rateInput, setRateInput] = useState("");
  const [rateSaving, setRateSaving] = useState(false);
  const [rateRefreshing, setRateRefreshing] = useState(false);

  // ── Cities state ───────────────────────────────────────────
  type City = { id: string; name: string; price: number };
  const [cities, setCities] = useState<City[]>([]);
  const [cityForm, setCityForm] = useState({ name: "", price: "" });
  const [cityAdding, setCityAdding] = useState(false);
  const [editingCityId, setEditingCityId] = useState<string | null>(null);
  const [editCityForm, setEditCityForm] = useState({ name: "", price: "" });
  const [cityUpdating, setCityUpdating] = useState(false);
  const [cityDeleting, setCityDeleting] = useState<string | null>(null);

  const [markupInputs, setMarkupInputs] = useState<Record<Segment, string>>({
    Эконом: "", Комфорт: "", Бизнес: "", Премиум: "",
  });

  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);

  function showToast(text: string, ok: boolean) {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function handleAuth() {
    setAuthLoading(true);
    setAuthError("");
    try {
      const res = await fetch("/api/admin/works", {
        headers: { Authorization: `Bearer ${password}` },
      });
      if (res.ok) {
        setWorks(await res.json());
        setAuthed(true);
        const feesRes = await fetch("/api/admin/fees", {
          headers: { Authorization: `Bearer ${password}` },
        });
        if (feesRes.ok) {
          const raw = await feesRes.json();
          setFees((prev) => {
            const merged = { ...prev };
            for (const seg of SEGMENTS) {
              merged[seg] = { ...prev[seg], ...(raw[seg] ?? {}) };
            }
            return merged;
          });
          const initMarkups: Record<Segment, string> = { Эконом: "", Комфорт: "", Бизнес: "", Премиум: "" };
          for (const seg of SEGMENTS) {
            const v = raw[seg]?.car_markup ?? 0;
            initMarkups[seg] = v === 0 ? "" : String(v);
          }
          setMarkupInputs(initMarkups);
          const kfw = raw.korea_fee_won ?? 2500000;
          setKoreaFeeWon(kfw);
          setKoreaFeeInput(String(kfw));
          setFeesLoaded(true);
        }
        const rateRes = await fetch("/api/admin/rate");
        if (rateRes.ok) {
          const rd = await rateRes.json();
          setRateData(rd);
          setRateInput(String(rd.wonRate));
        }
        const citiesRes = await fetch("/api/admin/cities", {
          headers: { Authorization: `Bearer ${password}` },
        });
        if (citiesRes.ok) setCities(await citiesRes.json());
      } else {
        setAuthError("Неверный пароль");
      }
    } finally {
      setAuthLoading(false);
    }
  }

  function addFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    setPhotos(arr);
    setPreviews(arr.map((f) => URL.createObjectURL(f)));
  }

  function removePhoto(i: number) {
    setPhotos((p) => p.filter((_, j) => j !== i));
    setPreviews((p) => p.filter((_, j) => j !== i));
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }, []);

  async function handleSubmit() {
    if (!form.brand.trim() || !form.model.trim()) {
      showToast("Укажите марку и модель", false);
      return;
    }
    if (photos.length === 0) {
      showToast("Добавьте хотя бы одно фото", false);
      return;
    }

    setSubmitting(true);

    const slug = `${form.brand}-${form.model}`
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");

    const fd = new FormData();
    fd.append("slug", slug);
    photos.forEach((p) => fd.append("photos", p));

    const uploadRes = await fetch("/api/admin/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${password}` },
      body: fd,
    });

    if (!uploadRes.ok) {
      showToast("Ошибка загрузки фото", false);
      setSubmitting(false);
      return;
    }

    const { paths } = await uploadRes.json();

    const work: Work = {
      ...form,
      year: Number(form.year),
      category: categoryFromPrice(form.price),
      photos: paths,
    };

    const saveRes = await fetch("/api/admin/works", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${password}`,
      },
      body: JSON.stringify(work),
    });

    if (saveRes.ok) {
      setWorks([work, ...works]);
      setForm(emptyForm);
      setPhotos([]);
      setPreviews([]);
      showToast("Автомобиль добавлен!", true);
    } else {
      showToast("Ошибка сохранения", false);
    }

    setSubmitting(false);
  }

  async function handleFeesSave() {
    setFeesSaving(true);
    const res = await fetch("/api/admin/fees", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${password}`,
      },
      body: JSON.stringify({ segments: fees, korea_fee_won: koreaFeeWon }),
    });
    setFeesSaving(false);
    if (res.ok) {
      showToast("Наценки сохранены", true);
    } else {
      showToast("Ошибка сохранения наценок", false);
    }
  }

  function updateFee(seg: Segment, field: "broker_fee" | "agent_fee" | "car_markup", raw: string) {
    const val = parseInt(raw.replace(/\D/g, ""), 10) || 0;
    setFees((f) => ({ ...f, [seg]: { ...f[seg], [field]: val } }));
  }

  function setMarkupType(seg: Segment, type: "fixed" | "percent") {
    setFees((f) => ({ ...f, [seg]: { ...f[seg], car_markup_type: type } }));
  }

  async function handlePasswordChange() {
    if (oldPw !== password) {
      showToast("Старый пароль неверный", false);
      return;
    }
    if (newPw.length < 4) {
      showToast("Минимум 4 символа", false);
      return;
    }
    if (newPw !== confirmPw) {
      showToast("Пароли не совпадают", false);
      return;
    }
    setPwLoading(true);
    const res = await fetch("/api/admin/password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${password}`,
      },
      body: JSON.stringify({ newPassword: newPw }),
    });
    setPwLoading(false);
    if (res.ok) {
      setPassword(newPw);
      setOldPw("");
      setNewPw("");
      setConfirmPw("");
      showToast("Пароль изменён", true);
    } else {
      const data = await res.json();
      showToast(data.error ?? "Ошибка", false);
    }
  }

  async function handleCityAdd() {
    const name  = cityForm.name.trim();
    const price = parseInt(cityForm.price.replace(/\D/g, ""), 10);
    if (!name || !price) { showToast("Укажите название и стоимость", false); return; }
    setCityAdding(true);
    const res = await fetch("/api/admin/cities", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${password}` },
      body: JSON.stringify({ name, price }),
    });
    setCityAdding(false);
    if (res.ok) {
      const city = await res.json();
      setCities((c) => [...c, city]);
      setCityForm({ name: "", price: "" });
      showToast("Город добавлен", true);
    } else {
      showToast("Ошибка добавления", false);
    }
  }

  async function handleCityUpdate(id: string) {
    const name  = editCityForm.name.trim();
    const price = parseInt(editCityForm.price.replace(/\D/g, ""), 10);
    if (!name || !price) { showToast("Укажите название и стоимость", false); return; }
    setCityUpdating(true);
    const res = await fetch(`/api/admin/cities/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${password}` },
      body: JSON.stringify({ name, price }),
    });
    setCityUpdating(false);
    if (res.ok) {
      const updated = await res.json();
      setCities((c) => c.map((x) => (x.id === id ? updated : x)));
      setEditingCityId(null);
      showToast("Сохранено", true);
    } else {
      showToast("Ошибка сохранения", false);
    }
  }

  async function handleCityDelete(id: string) {
    setCityDeleting(id);
    const res = await fetch(`/api/admin/cities/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${password}` },
    });
    setCityDeleting(null);
    if (res.ok) {
      setCities((c) => c.filter((x) => x.id !== id));
      showToast("Город удалён", true);
    } else {
      showToast("Ошибка удаления", false);
    }
  }

  async function handleRateSave() {
    const val = parseFloat(rateInput.replace(",", "."));
    if (!val || val <= 0) { showToast("Введите корректный курс", false); return; }
    setRateSaving(true);
    const res = await fetch("/api/admin/rate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${password}` },
      body: JSON.stringify({ wonRate: val }),
    });
    setRateSaving(false);
    if (res.ok) {
      setRateData(await res.json());
      showToast("Курс сохранён", true);
    } else {
      showToast("Ошибка сохранения", false);
    }
  }

  async function handleRateRefresh() {
    setRateRefreshing(true);
    const res = await fetch("/api/admin/rate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${password}` },
      body: JSON.stringify({ action: "refresh" }),
    });
    setRateRefreshing(false);
    if (res.ok) {
      const rd = await res.json();
      setRateData(rd);
      setRateInput(String(rd.wonRate));
      showToast(`Курс обновлён: 1 万₩ = ${rd.wonRate} ₽`, true);
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(err.error ?? "Ошибка получения курса", false);
    }
  }

  async function handleDelete(index: number) {
    const res = await fetch(`/api/admin/works/${index}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${password}` },
    });
    if (res.ok) {
      setWorks((w) => w.filter((_, i) => i !== index));
      showToast("Удалено", true);
    }
  }

  // ── Auth gate ──────────────────────────────────────────────
  if (!authed) {
    return (
      <div className="min-h-screen bg-[#070B17] flex items-center justify-center px-4">
        <div className="bg-[#0F1629] border border-[rgba(212,175,55,0.15)] p-10 w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="text-[#D4AF37] text-xs tracking-[0.3em] mb-1">IM AUTO</div>
            <div className="font-display text-2xl text-[#F0EDE8] tracking-widest">ADMIN</div>
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAuth()}
            placeholder="Пароль"
            className={inputClass + " mb-3"}
            autoFocus
          />
          {authError && (
            <div className="text-red-400 text-xs mb-3 text-center">{authError}</div>
          )}
          <button
            onClick={handleAuth}
            disabled={authLoading}
            className="w-full bg-[#D4AF37] text-[#070B17] font-bold py-3 tracking-[0.2em] text-sm hover:bg-[#c9a032] transition-colors disabled:opacity-50"
          >
            {authLoading ? "..." : "ВОЙТИ"}
          </button>
        </div>
      </div>
    );
  }

  // ── Admin UI ───────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#070B17] text-[#F0EDE8]">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 text-sm font-medium shadow-lg ${
            toast.ok
              ? "bg-[#0F1629] border border-[#D4AF37]/40 text-[#D4AF37]"
              : "bg-[#1a0808] border border-red-500/40 text-red-400"
          }`}
        >
          {toast.ok ? <Check size={14} /> : <X size={14} />}
          {toast.text}
        </div>
      )}

      {/* Header */}
      <div className="border-b border-[rgba(212,175,55,0.1)] bg-[#0F1629]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <span className="text-[#D4AF37] text-xs tracking-[0.3em]">IM AUTO</span>
              <span className="text-[rgba(212,175,55,0.3)]">·</span>
              <span className="text-[#8892A4] text-xs tracking-widest">ПАНЕЛЬ УПРАВЛЕНИЯ</span>
            </div>
            <div className="flex items-center gap-4">
              <a
                href="/"
                target="_blank"
                className="flex items-center gap-1.5 text-[#8892A4] hover:text-[#F0EDE8] text-xs tracking-wider transition-colors"
              >
                <Eye size={13} /> Сайт
              </a>
              <button
                onClick={() => { setAuthed(false); setPassword(""); }}
                className="flex items-center gap-1.5 text-[#8892A4] hover:text-red-400 text-xs tracking-wider transition-colors"
              >
                <LogOut size={13} /> Выйти
              </button>
            </div>
          </div>
          {/* Tabs */}
          <div className="flex gap-1 -mb-px">
            {(["cars", "fees", "rate", "cities", "password"] as const).map((t) => {
              const labels = { cars: "Автомобили", fees: "Наценки", rate: "Курс ₩", cities: "Города", password: "Пароль" };
              const icons  = { cars: <Car size={13} />, fees: <Settings2 size={13} />, rate: <TrendingUp size={13} />, cities: <MapPin size={13} />, password: <KeyRound size={13} /> };
              const active = tab === t;
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex items-center gap-1.5 px-5 py-2.5 text-xs tracking-wider border-b-2 transition-colors ${
                    active
                      ? "border-[#D4AF37] text-[#D4AF37]"
                      : "border-transparent text-[#8892A4] hover:text-[#F0EDE8]"
                  }`}
                >
                  {icons[t]} {labels[t]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-10">

        {/* ── Fees tab ─────────────────────────────────────── */}
        {tab === "fees" && (
          <div className="max-w-2xl">
            <div className="bg-[#0F1629] border border-[rgba(212,175,55,0.12)] p-8">
              <h2 className="flex items-center gap-2 font-display text-base tracking-[0.2em] text-[#D4AF37] mb-2">
                <Settings2 size={16} /> НАЦЕНКИ ПО СЕГМЕНТАМ
              </h2>
              <p className="text-[#4a5568] text-xs mb-8">
                Таможенный брокер и агентское вознаграждение добавляются к итоговой стоимости автомобиля.
              </p>

              {!feesLoaded ? (
                <div className="text-[#4a5568] text-sm py-8 text-center">
                  Нет соединения с парсером. Проверьте PARSER_API_URL в env.
                </div>
              ) : (
                <div className="space-y-5">

                  {/* Global Korea fee */}
                  <div className="border border-[rgba(212,175,55,0.15)] p-5 bg-[#070B17]">
                    <div className="text-[10px] text-[#D4AF37] tracking-[0.25em] uppercase mb-3">Глобальная наценка (все категории)</div>
                    <label className={labelClass}>Корейские расходы, ₩</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={koreaFeeInput}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, "");
                        setKoreaFeeInput(v);
                        setKoreaFeeWon(parseInt(v) || 0);
                      }}
                      placeholder="2500000"
                      className={inputClass}
                    />
                    <p className="text-[#4a5568] text-[11px] mt-2">
                      Прибавляется к цене каждого автомобиля до расчёта стоимости под ключ.
                    </p>
                  </div>

                  {SEGMENTS.map((seg) => {
                    const color = SEG_COLORS[seg];
                    return (
                      <div
                        key={seg}
                        className="border border-[rgba(212,175,55,0.08)] p-5"
                        style={{ borderLeftColor: color, borderLeftWidth: 2 }}
                      >
                        <div className="flex items-center gap-2 mb-4">
                          <span
                            className="text-[10px] px-2 py-0.5 tracking-wider"
                            style={{ color, background: `${color}15`, border: `1px solid ${color}30` }}
                          >
                            {seg.toUpperCase()}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className={labelClass}>Таможенный брокер, ₽</label>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={fees[seg].broker_fee === 0 ? "" : fees[seg].broker_fee.toLocaleString("ru")}
                              onChange={(e) => updateFee(seg, "broker_fee", e.target.value)}
                              placeholder="0"
                              className={inputClass}
                            />
                          </div>
                          <div>
                            <label className={labelClass}>Услуга агента, ₽</label>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={fees[seg].agent_fee === 0 ? "" : fees[seg].agent_fee.toLocaleString("ru")}
                              onChange={(e) => updateFee(seg, "agent_fee", e.target.value)}
                              placeholder="0"
                              className={inputClass}
                            />
                          </div>
                        </div>
                        <div className="mt-4 pt-4 border-t border-[rgba(212,175,55,0.08)]">
                          <label className={labelClass}>Скрытая наценка к цене авто</label>
                          <div className="flex gap-0">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={markupInputs[seg]}
                              onChange={(e) => {
                                let v = e.target.value.replace(/\./g, ",").replace(/[^\d,]/g, "");
                                // Only one comma
                                const ci = v.indexOf(",");
                                if (ci !== -1) v = v.slice(0, ci + 1) + v.slice(ci + 1).replace(/,/g, "");
                                // Auto-prepend 0 before leading comma
                                if (v.startsWith(",")) v = "0" + v;
                                setMarkupInputs((m) => ({ ...m, [seg]: v }));
                                const val = parseFloat(v.replace(",", ".")) || 0;
                                setFees((f) => ({ ...f, [seg]: { ...f[seg], car_markup: val } }));
                              }}
                              onBlur={() => {
                                let v = markupInputs[seg];
                                // "05" → "5", but "0,5" stays "0,5"
                                v = v.replace(/^0+([1-9])/, "$1");
                                // "00,5" → "0,5"
                                v = v.replace(/^0+,/, "0,");
                                // "5," → "5"
                                v = v.replace(/,$/, "");
                                setMarkupInputs((m) => ({ ...m, [seg]: v }));
                              }}
                              placeholder="0"
                              className={inputClass + " flex-1"}
                              style={{ borderRight: "none" }}
                            />
                            {(["fixed", "percent"] as const).map((t) => (
                              <button
                                key={t}
                                onClick={() => setMarkupType(seg, t)}
                                className="px-4 text-xs font-display border transition-all shrink-0"
                                style={{
                                  background: fees[seg].car_markup_type === t ? "#D4AF37" : "#070B17",
                                  color: fees[seg].car_markup_type === t ? "#070B17" : "#8892A4",
                                  borderColor: fees[seg].car_markup_type === t ? "#D4AF37" : "rgba(212,175,55,0.18)",
                                }}
                              >
                                {t === "fixed" ? "₽" : "%"}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {feesLoaded && (
                <button
                  onClick={handleFeesSave}
                  disabled={feesSaving}
                  className="mt-8 bg-[#D4AF37] text-[#070B17] font-bold px-8 py-3 tracking-[0.15em] text-sm hover:bg-[#c9a032] transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  <Check size={15} />
                  {feesSaving ? "СОХРАНЯЕТСЯ..." : "СОХРАНИТЬ НАЦЕНКИ"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Cities tab ───────────────────────────────────── */}
        {tab === "cities" && (
          <div className="max-w-xl">
            <div className="bg-[#0F1629] border border-[rgba(212,175,55,0.12)] p-8">
              <h2 className="flex items-center gap-2 font-display text-base tracking-[0.2em] text-[#D4AF37] mb-2">
                <MapPin size={16} /> ГОРОДА И АВТОВОЗ
              </h2>
              <p className="text-[#4a5568] text-xs mb-8">
                Стоимость доставки автомобиля автовозом до города. Клиент выбирает город на карточке товара.
              </p>

              {/* Add form */}
              <div className="border border-[rgba(212,175,55,0.1)] p-5 mb-6">
                <div className="text-[9px] text-[#8892A4] uppercase tracking-[0.25em] mb-4 font-display">
                  Добавить город
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className={labelClass}>Название города</label>
                    <input
                      value={cityForm.name}
                      onChange={(e) => setCityForm((f) => ({ ...f, name: e.target.value }))}
                      onKeyDown={(e) => e.key === "Enter" && handleCityAdd()}
                      placeholder="Москва"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Стоимость автовоза, ₽</label>
                    <input
                      value={cityForm.price}
                      onChange={(e) => setCityForm((f) => ({ ...f, price: e.target.value }))}
                      onKeyDown={(e) => e.key === "Enter" && handleCityAdd()}
                      inputMode="numeric"
                      placeholder="150 000"
                      className={inputClass}
                    />
                  </div>
                </div>
                <button
                  onClick={handleCityAdd}
                  disabled={cityAdding}
                  className="flex items-center gap-2 bg-[#D4AF37] text-[#070B17] font-bold px-6 py-2.5 tracking-[0.15em] text-xs hover:bg-[#c9a032] transition-colors disabled:opacity-50"
                >
                  <Plus size={13} />
                  {cityAdding ? "ДОБАВЛЯЕТСЯ..." : "ДОБАВИТЬ"}
                </button>
              </div>

              {/* Cities list */}
              {cities.length === 0 ? (
                <div className="text-[#4a5568] text-sm text-center py-10 border border-dashed border-[rgba(212,175,55,0.08)]">
                  Города не добавлены
                </div>
              ) : (
                <div className="space-y-2">
                  {cities.map((city) =>
                    editingCityId === city.id ? (
                      <div
                        key={city.id}
                        className="border border-[#D4AF37]/30 p-4 bg-[#D4AF37]/5"
                      >
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div>
                            <label className={labelClass}>Название</label>
                            <input
                              value={editCityForm.name}
                              onChange={(e) => setEditCityForm((f) => ({ ...f, name: e.target.value }))}
                              className={inputClass}
                            />
                          </div>
                          <div>
                            <label className={labelClass}>Стоимость, ₽</label>
                            <input
                              value={editCityForm.price}
                              onChange={(e) => setEditCityForm((f) => ({ ...f, price: e.target.value }))}
                              inputMode="numeric"
                              className={inputClass}
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleCityUpdate(city.id)}
                            disabled={cityUpdating}
                            className="flex items-center gap-1.5 bg-[#D4AF37] text-[#070B17] font-bold px-4 py-2 text-xs tracking-wider hover:bg-[#c9a032] transition-colors disabled:opacity-50"
                          >
                            <Check size={12} /> {cityUpdating ? "..." : "Сохранить"}
                          </button>
                          <button
                            onClick={() => setEditingCityId(null)}
                            className="flex items-center gap-1.5 border border-[rgba(212,175,55,0.2)] text-[#8892A4] px-4 py-2 text-xs hover:text-[#F0EDE8] transition-colors"
                          >
                            <X size={12} /> Отмена
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        key={city.id}
                        className="flex items-center justify-between border border-[rgba(212,175,55,0.08)] px-4 py-3 group"
                      >
                        <div className="flex items-center gap-3">
                          <MapPin size={13} className="text-[#D4AF37]/50 shrink-0" />
                          <span className="text-[#F0EDE8] text-sm">{city.name}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-[#D4AF37] text-sm font-display">
                            ~{city.price.toLocaleString("ru")} ₽
                          </span>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => {
                                setEditingCityId(city.id);
                                setEditCityForm({ name: city.name, price: String(city.price) });
                              }}
                              className="p-1.5 text-[#8892A4] hover:text-[#D4AF37] transition-colors"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              onClick={() => handleCityDelete(city.id)}
                              disabled={cityDeleting === city.id}
                              className="p-1.5 text-[#8892A4] hover:text-red-400 transition-colors disabled:opacity-40"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Rate tab ─────────────────────────────────────── */}
        {tab === "rate" && (
          <div className="max-w-md">
            <div className="bg-[#0F1629] border border-[rgba(212,175,55,0.12)] p-8">
              <h2 className="flex items-center gap-2 font-display text-base tracking-[0.2em] text-[#D4AF37] mb-2">
                <TrendingUp size={16} /> КУРС КОРЕЙСКОЙ ВОНЫ
              </h2>
              <p className="text-[#4a5568] text-xs mb-8">
                Используется для расчёта стоимости на карточках каталога. Автообновление — ежедневно в 08:00 МСК с сайта ЦБ РФ.
              </p>

              {/* Current rate display */}
              {rateData && (
                <div className="border border-[rgba(212,175,55,0.15)] bg-[#070B17] p-5 mb-6">
                  <div className="text-[9px] text-[#8892A4] uppercase tracking-[0.25em] mb-2">Текущий курс</div>
                  <div className="flex items-baseline gap-2 mb-3">
                    <span className="font-display text-3xl text-[#D4AF37]">{rateData.wonRate}</span>
                    <span className="text-[#8892A4] text-sm">₽ за 1 万₩</span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span
                      className="px-2 py-0.5 tracking-wider"
                      style={{
                        color: rateData.source === "cbr" ? "#4ade80" : rateData.source === "manual" ? "#60a5fa" : "#8892A4",
                        background: rateData.source === "cbr" ? "#4ade8015" : rateData.source === "manual" ? "#60a5fa15" : "#8892A415",
                        border: `1px solid ${rateData.source === "cbr" ? "#4ade8030" : rateData.source === "manual" ? "#60a5fa30" : "#8892A430"}`,
                      }}
                    >
                      {rateData.source === "cbr" ? "ЦБ РФ" : rateData.source === "manual" ? "вручную" : "по умолчанию"}
                    </span>
                    {rateData.updatedAt && (
                      <span className="text-[#4a5568]">
                        {new Date(rateData.updatedAt).toLocaleString("ru", {
                          day: "2-digit", month: "2-digit", year: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Manual input */}
              <div className="mb-4">
                <label className={labelClass}>Установить вручную (₽ за 1 万₩)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={rateInput}
                  onChange={(e) => setRateInput(e.target.value)}
                  placeholder="650"
                  className={inputClass}
                />
                <p className="text-[#4a5568] text-[10px] mt-1.5">
                  Например: 650 означает 1 万₩ (10 000 ₩) = 650 ₽
                </p>
              </div>

              <div className="flex gap-3 flex-wrap">
                <button
                  onClick={handleRateSave}
                  disabled={rateSaving}
                  className="flex items-center gap-2 bg-[#D4AF37] text-[#070B17] font-bold px-6 py-2.5 tracking-[0.15em] text-xs hover:bg-[#c9a032] transition-colors disabled:opacity-50"
                >
                  <Check size={13} />
                  {rateSaving ? "СОХРАНЯЕТСЯ..." : "СОХРАНИТЬ"}
                </button>
                <button
                  onClick={handleRateRefresh}
                  disabled={rateRefreshing}
                  className="flex items-center gap-2 border border-[rgba(212,175,55,0.3)] text-[#D4AF37] px-6 py-2.5 tracking-[0.15em] text-xs hover:bg-[#D4AF37]/10 transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={13} className={rateRefreshing ? "animate-spin" : ""} />
                  {rateRefreshing ? "ЗАПРОС..." : "ОБНОВИТЬ С ЦБ РФ"}
                </button>
              </div>

              <div className="mt-6 border-t border-[rgba(212,175,55,0.08)] pt-5">
                <div className="text-[9px] text-[#8892A4] uppercase tracking-[0.25em] mb-2">Автообновление</div>
                <p className="text-[#4a5568] text-xs leading-relaxed">
                  Каждый день в 08:00 МСК скрипт автоматически запрашивает курс КРВ/RUB у ЦБ РФ и обновляет данные.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Password tab ─────────────────────────────────── */}
        {tab === "password" && (
          <div className="max-w-sm">
            <div className="bg-[#0F1629] border border-[rgba(212,175,55,0.12)] p-8">
              <h2 className="flex items-center gap-2 font-display text-base tracking-[0.2em] text-[#D4AF37] mb-7">
                <KeyRound size={16} /> СМЕНИТЬ ПАРОЛЬ
              </h2>
              <div className="space-y-4 mb-6">
                <div>
                  <label className={labelClass}>Старый пароль</label>
                  <input
                    type="password"
                    value={oldPw}
                    onChange={(e) => setOldPw(e.target.value)}
                    placeholder="Текущий пароль"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Новый пароль</label>
                  <input
                    type="password"
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    placeholder="Минимум 4 символа"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Подтверждение</label>
                  <input
                    type="password"
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handlePasswordChange()}
                    placeholder="Повторите пароль"
                    className={inputClass}
                  />
                </div>
              </div>
              <button
                onClick={handlePasswordChange}
                disabled={pwLoading}
                className="w-full bg-[#D4AF37] text-[#070B17] font-bold py-3 tracking-[0.15em] text-sm hover:bg-[#c9a032] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Check size={15} />
                {pwLoading ? "СОХРАНЯЕТСЯ..." : "СОХРАНИТЬ"}
              </button>
            </div>
          </div>
        )}

        {/* ── Cars tab ─────────────────────────────────────── */}
        {tab === "cars" && <>
        {/* Add form */}
        <div className="bg-[#0F1629] border border-[rgba(212,175,55,0.12)] p-8 mb-10">
          <h2 className="flex items-center gap-2 font-display text-base tracking-[0.2em] text-[#D4AF37] mb-7">
            <Plus size={16} /> ДОБАВИТЬ АВТОМОБИЛЬ
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
            <div>
              <label className={labelClass}>Марка</label>
              <input
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                placeholder="Mercedes-Benz"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Модель</label>
              <input
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                placeholder="GLE 450 Coupe AMG"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Год выпуска</label>
              <input
                type="number"
                min={2000}
                max={2030}
                value={form.year}
                onChange={(e) => setForm({ ...form, year: parseInt(e.target.value) })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Пробег</label>
              <input
                value={form.mileage}
                onChange={(e) => setForm({ ...form, mileage: e.target.value })}
                placeholder="17 483 км"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Итоговая цена</label>
              <input
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                placeholder="7 480 000 ₽"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Страна</label>
              <select
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
                className={inputClass}
              >
                {COUNTRIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Категория (авто)</label>
              <div className="flex items-center h-[42px] px-4 border border-[rgba(212,175,55,0.18)] bg-[#070B17]">
                {(() => {
                  const cat = categoryFromPrice(form.price);
                  const colors: Record<string, string> = {
                    Эконом: "#4ade80",
                    Комфорт: "#60a5fa",
                    Бизнес: "#c084fc",
                    Премиум: "#D4AF37",
                  };
                  const c = colors[cat];
                  return (
                    <span
                      className="text-xs px-2.5 py-1 tracking-wider"
                      style={{ color: c, background: `${c}18`, border: `1px solid ${c}35` }}
                    >
                      {cat}
                    </span>
                  );
                })()}
                <span className="text-[#4a5568] text-xs ml-3">определяется по цене</span>
              </div>
            </div>
            <div>
              <label className={labelClass}>Характеристики</label>
              <input
                value={form.specs}
                onChange={(e) => setForm({ ...form, specs: e.target.value })}
                placeholder="3.0T · 367 л.с. · 4MATIC · 9AT · Бензин"
                className={inputClass}
              />
            </div>
          </div>

          {/* Photo upload */}
          <div className="mb-6">
            <label className={labelClass}>Фотографии</label>
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`border border-dashed px-6 py-8 text-center cursor-pointer transition-all ${
                dragOver
                  ? "border-[#D4AF37] bg-[#D4AF37]/5"
                  : "border-[rgba(212,175,55,0.25)] hover:border-[rgba(212,175,55,0.5)]"
              }`}
            >
              <Upload size={22} className="mx-auto mb-2 text-[#D4AF37]/40" />
              <p className="text-[#8892A4] text-sm">
                {photos.length > 0
                  ? `${photos.length} фото выбрано`
                  : "Перетащите или нажмите для выбора"}
              </p>
              <p className="text-[#4a5568] text-xs mt-1">JPG, PNG · несколько файлов</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && addFiles(e.target.files)}
            />
            {previews.length > 0 && (
              <div className="flex gap-2 mt-3 flex-wrap">
                {previews.map((src, i) => (
                  <div key={i} className="relative group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt=""
                      className="h-20 w-28 object-cover border border-[rgba(212,175,55,0.2)]"
                    />
                    <button
                      onClick={() => removePhoto(i)}
                      className="absolute top-1 right-1 bg-black/60 text-white p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={10} />
                    </button>
                    {i === 0 && (
                      <div className="absolute bottom-1 left-1 text-[9px] bg-[#D4AF37] text-black px-1 font-bold">
                        главное
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-[#D4AF37] text-[#070B17] font-bold px-8 py-3 tracking-[0.15em] text-sm hover:bg-[#c9a032] transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <Plus size={15} />
            {submitting ? "СОХРАНЯЕТСЯ..." : "ДОБАВИТЬ"}
          </button>
        </div>

        {/* Works list */}
        <div>
          <h2 className="font-display text-base tracking-[0.2em] text-[#D4AF37] mb-6">
            РАБОТЫ · {works.length}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {works.map((w, i) => {
              const catColors: Record<string, string> = {
                Эконом: "#4ade80",
                Комфорт: "#60a5fa",
                Бизнес: "#c084fc",
                Премиум: "#D4AF37",
              };
              const accent = catColors[w.category] ?? "#D4AF37";
              return (
                <div
                  key={i}
                  className="bg-[#0F1629] border border-[rgba(212,175,55,0.08)] overflow-hidden group relative"
                >
                  {w.photos[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={w.photos[0]}
                      alt=""
                      className="w-full h-36 object-cover"
                    />
                  )}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="font-display text-[#F0EDE8] text-sm leading-snug">
                        {w.brand}{" "}
                        <span className="text-[#8892A4] font-normal">{w.model}</span>
                      </div>
                      <span
                        className="text-[9px] px-1.5 py-0.5 shrink-0"
                        style={{ color: accent, background: `${accent}15`, border: `1px solid ${accent}30` }}
                      >
                        {w.category}
                      </span>
                    </div>
                    <div className="text-[#8892A4] text-[11px]">
                      {w.year} · {w.country} · {w.mileage}
                    </div>
                    <div className="text-[#D4AF37] font-bold text-sm mt-2">{w.price}</div>
                    <div className="text-[#4a5568] text-[10px] mt-1">{w.photos.length} фото</div>
                  </div>
                  <button
                    onClick={() => handleDelete(i)}
                    className="absolute top-2 right-2 p-1.5 bg-red-900/60 text-red-300 hover:bg-red-700/80 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
          {works.length === 0 && (
            <div className="text-[#4a5568] text-sm text-center py-16 border border-dashed border-[rgba(212,175,55,0.08)]">
              Список пуст
            </div>
          )}
        </div>
        </>}

      </div>
    </div>
  );
}
