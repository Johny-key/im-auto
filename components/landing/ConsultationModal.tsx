"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle, Send } from "lucide-react";
import Button from "../ui/Button";

interface Props {
  open: boolean;
  onClose: () => void;
}

function formatPhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("8")) digits = "7" + digits.slice(1);
  if (digits.startsWith("7")) digits = digits.slice(0, 11);
  else digits = ("7" + digits).slice(0, 11);

  let out = "+7";
  if (digits.length > 1) out += ` (${digits.slice(1, 4)}`;
  if (digits.length >= 4) out += ")";
  if (digits.length > 4) out += ` ${digits.slice(4, 7)}`;
  if (digits.length > 7) out += `-${digits.slice(7, 9)}`;
  if (digits.length > 9) out += `-${digits.slice(9, 11)}`;
  return out;
}

function isValidPhone(phone: string): boolean {
  return phone.replace(/\D/g, "").length === 11;
}

export default function ConsultationModal({ open, onClose }: Props) {
  const [form, setForm] = useState({ name: "", phone: "" });
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [phoneHasInvalid, setPhoneHasInvalid] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const phoneError = phoneHasInvalid
    ? "Только цифры — буквы недопустимы"
    : phoneTouched && !isValidPhone(form.phone)
    ? "Введите корректный номер телефона"
    : null;

  const handlePhoneKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const passthrough = ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Tab", "Home", "End", "Enter"];
    if (passthrough.includes(e.key) || e.ctrlKey || e.metaKey) return;
    if (!/^\d$/.test(e.key)) e.preventDefault();
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const hasInvalid = /[^\d\s+()\-]/.test(raw);
    setPhoneHasInvalid(hasInvalid);
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 0) {
      setForm({ ...form, phone: "" });
      return;
    }
    setForm({ ...form, phone: formatPhone(digits) });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhoneTouched(true);
    if (phoneHasInvalid || !isValidPhone(form.phone)) return;
    setLoading(true);
    await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setLoading(false);
    setSubmitted(true);
  };

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setSubmitted(false);
      setPhoneTouched(false);
      setPhoneHasInvalid(false);
      setForm({ name: "", phone: "" });
    }, 300);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
          />
          <motion.div
            className="fixed z-50 top-1/2 left-1/2 w-full max-w-md mx-4 bg-[#0F1629] border border-[rgba(212,175,55,0.25)] p-8"
            style={{ x: "-50%", y: "-50%" }}
            initial={{ opacity: 0, scale: 0.93 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.93 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 text-[#8892A4] hover:text-[#F0EDE8] transition-colors"
            >
              <X size={20} />
            </button>

            {submitted ? (
              <motion.div
                className="flex flex-col items-center py-8 text-center"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                <CheckCircle size={52} className="text-[#D4AF37] mb-4" />
                <h3 className="font-display text-2xl text-[#F0EDE8] mb-2">Заявка принята!</h3>
                <p className="text-[#8892A4] text-sm leading-relaxed">
                  Мы перезвоним вам в течение 15 минут.<br />Спасибо за обращение!
                </p>
              </motion.div>
            ) : (
              <>
                <div className="mb-6">
                  <div className="h-px w-8 bg-[#D4AF37] mb-3" />
                  <h2 className="font-display text-2xl text-[#F0EDE8] mb-1">Получить консультацию</h2>
                  <p className="text-[#8892A4] text-sm">Оставьте контакты — перезвоним в течение 15 минут</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="text-xs text-[#8892A4] uppercase tracking-wider mb-2 block">
                      Ваше имя *
                    </label>
                    <input
                      required
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Иван Иванов"
                      className="w-full bg-[#0A0F1E] border border-[rgba(212,175,55,0.15)] text-[#F0EDE8] px-4 py-3 text-sm placeholder:text-[#8892A4]/50 focus:outline-none focus:border-[#D4AF37]/50 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[#8892A4] uppercase tracking-wider mb-2 block">
                      Номер телефона *
                    </label>
                    <input
                      type="tel"
                      inputMode="numeric"
                      value={form.phone}
                      onKeyDown={handlePhoneKeyDown}
                      onChange={handlePhoneChange}
                      onBlur={() => setPhoneTouched(true)}
                      placeholder="+7 (999) 000-00-00"
                      className={`w-full bg-[#0A0F1E] border text-[#F0EDE8] px-4 py-3 text-sm placeholder:text-[#8892A4]/50 focus:outline-none transition-colors ${
                        phoneError
                          ? "border-red-500/70 focus:border-red-500"
                          : "border-[rgba(212,175,55,0.15)] focus:border-[#D4AF37]/50"
                      }`}
                    />
                    {phoneError && (
                      <p className="text-red-400 text-xs mt-1">{phoneError}</p>
                    )}
                  </div>
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full justify-center mt-2"
                    disabled={loading}
                  >
                    {loading ? "Отправляем..." : <><Send size={14} className="mr-2" />Жду звонка</>}
                  </Button>
                  <p className="text-[#8892A4]/50 text-xs text-center">
                    Нажимая кнопку, вы соглашаетесь с политикой конфиденциальности
                  </p>
                </form>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
