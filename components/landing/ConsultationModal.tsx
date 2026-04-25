"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle, Send } from "lucide-react";
import Button from "../ui/Button";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ConsultationModal({ open, onClose }: Props) {
  const [form, setForm] = useState({ name: "", phone: "" });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1200));
    setLoading(false);
    setSubmitted(true);
  };

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setSubmitted(false);
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
                      required
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      placeholder="+7 (999) 000-00-00"
                      className="w-full bg-[#0A0F1E] border border-[rgba(212,175,55,0.15)] text-[#F0EDE8] px-4 py-3 text-sm placeholder:text-[#8892A4]/50 focus:outline-none focus:border-[#D4AF37]/50 transition-colors"
                    />
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
