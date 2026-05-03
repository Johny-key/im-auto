"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Phone, Mail, MessageCircle, Send, MapPin, CheckCircle } from "lucide-react";
import SectionTitle from "../ui/SectionTitle";
import Button from "../ui/Button";

interface FormData {
  name: string;
  phone: string;
  email: string;
  message: string;
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

const emptyForm: FormData = { name: "", phone: "", email: "", message: "" };

export default function ContactSection() {
  const [form, setForm] = useState<FormData>(emptyForm);
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

  const handleReset = () => {
    setSubmitted(false);
    setPhoneTouched(false);
    setPhoneHasInvalid(false);
    setForm(emptyForm);
  };

  const contacts = [
    { icon: Phone, label: "Телефон", value: "+7 (900) 123-45-67", href: "tel:+79001234567" },
    { icon: Mail, label: "Email", value: "info@autoimport.ru", href: "mailto:info@autoimport.ru" },
    { icon: MessageCircle, label: "Telegram", value: "@autoimport_ru", href: "https://t.me/autoimport_ru" },
    { icon: MessageCircle, label: "WhatsApp", value: "+7 (900) 123-45-67", href: "https://wa.me/79001234567" },
  ];

  return (
    <section id="contacts" className="py-28 bg-[#0A0F1E] relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 gold-line" />

      <div className="max-w-6xl mx-auto px-6">
        <SectionTitle label="Контакты" title="СВЯЖИТЕСЬ" highlight="С НАМИ" subtitle="Оставьте заявку — перезвоним в течение 15 минут" />

        <div className="grid lg:grid-cols-2 gap-12">
          {/* Form */}
          <motion.div
            className="bg-[#0F1629] border border-[rgba(212,175,55,0.1)] p-8 md:p-10"
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            {submitted ? (
              <motion.div
                className="flex flex-col items-center justify-center py-16 text-center"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                <CheckCircle size={56} className="text-[#D4AF37] mb-5" />
                <h3 className="font-display text-3xl text-[#F0EDE8] mb-3">Заявка отправлена!</h3>
                <p className="text-[#8892A4]">Мы перезвоним вам в течение 15 минут.<br />Спасибо за обращение!</p>
                <button
                  onClick={handleReset}
                  className="mt-8 text-[#D4AF37] text-sm border border-[#D4AF37]/30 px-6 py-2 hover:bg-[#D4AF37]/10 transition-colors"
                >
                  Отправить ещё одну
                </button>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="text-xs text-[#8892A4] uppercase tracking-wider mb-2 block">Ваше имя *</label>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Иван Иванов"
                    className="w-full bg-[#0A0F1E] border border-[rgba(212,175,55,0.15)] text-[#F0EDE8] px-4 py-3 text-sm placeholder:text-[#8892A4]/50 focus:outline-none focus:border-[#D4AF37]/50 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs text-[#8892A4] uppercase tracking-wider mb-2 block">Телефон *</label>
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
                <div>
                  <label className="text-xs text-[#8892A4] uppercase tracking-wider mb-2 block">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="ivan@mail.ru"
                    className="w-full bg-[#0A0F1E] border border-[rgba(212,175,55,0.15)] text-[#F0EDE8] px-4 py-3 text-sm placeholder:text-[#8892A4]/50 focus:outline-none focus:border-[#D4AF37]/50 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs text-[#8892A4] uppercase tracking-wider mb-2 block">Сообщение</label>
                  <textarea
                    rows={4}
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    placeholder="Хочу узнать о..."
                    className="w-full bg-[#0A0F1E] border border-[rgba(212,175,55,0.15)] text-[#F0EDE8] px-4 py-3 text-sm placeholder:text-[#8892A4]/50 focus:outline-none focus:border-[#D4AF37]/50 transition-colors resize-none"
                  />
                </div>
                <Button type="submit" size="lg" className="w-full justify-center" disabled={loading}>
                  {loading ? "Отправляем..." : <>Отправить заявку <Send size={14} /></>}
                </Button>
                <p className="text-[#8892A4]/50 text-xs text-center">
                  Нажимая кнопку, вы соглашаетесь с политикой конфиденциальности
                </p>
              </form>
            )}
          </motion.div>

          {/* Contacts + Map */}
          <motion.div
            className="flex flex-col gap-6"
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <div className="space-y-4">
              {contacts.map((c, i) => (
                <a
                  key={i}
                  href={c.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-4 p-5 bg-[#0F1629] border border-[rgba(212,175,55,0.08)] hover:border-[rgba(212,175,55,0.3)] transition-colors group"
                >
                  <div className="w-10 h-10 border border-[#D4AF37]/30 flex items-center justify-center group-hover:border-[#D4AF37]/60 transition-colors shrink-0">
                    <c.icon size={16} className="text-[#D4AF37]" />
                  </div>
                  <div>
                    <div className="text-xs text-[#8892A4] uppercase tracking-wider mb-0.5">{c.label}</div>
                    <div className="text-[#F0EDE8] text-sm font-medium">{c.value}</div>
                  </div>
                </a>
              ))}
            </div>

            {/* Office info */}
            <div className="flex items-start gap-4 p-5 bg-[#0F1629] border border-[rgba(212,175,55,0.08)]">
              <div className="w-10 h-10 border border-[#D4AF37]/30 flex items-center justify-center shrink-0">
                <MapPin size={16} className="text-[#D4AF37]" />
              </div>
              <div>
                <div className="text-xs text-[#8892A4] uppercase tracking-wider mb-1">Офис</div>
                <div className="text-[#F0EDE8] text-sm">г. Москва, ул. Примерная, д. 1, офис 205</div>
                <div className="text-[#8892A4] text-xs mt-1">Пн–Пт: 9:00–20:00 · Сб: 10:00–17:00</div>
              </div>
            </div>

            {/* Map placeholder */}
            <div className="flex-1 min-h-40 bg-[#0F1629] border border-[rgba(212,175,55,0.08)] flex items-center justify-center">
              <div className="text-center">
                <MapPin size={32} className="text-[#D4AF37]/30 mx-auto mb-2" />
                <p className="text-[#8892A4] text-sm">Яндекс Карта будет здесь</p>
                <p className="text-[#8892A4]/50 text-xs mt-1">Подключите Яндекс Карты API</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
