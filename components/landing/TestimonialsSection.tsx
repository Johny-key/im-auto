"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Star, Quote } from "lucide-react";
import SectionTitle from "../ui/SectionTitle";

const testimonials = [
  {
    name: "Алексей Воронов",
    city: "Москва",
    car: "Genesis GV80",
    text: "Всё прошло чётко и без сюрпризов. Менеджер был на связи каждый день, отправлял фото с аукциона. Авто пришло в срок, в идеальном состоянии. Рекомендую всем, кто думает о корейском авто.",
    rating: 5,
    date: "Декабрь 2024",
  },
  {
    name: "Светлана Кравченко",
    city: "Санкт-Петербург",
    car: "Hyundai Tucson",
    text: "Сначала боялась, казалось сложно и рискованно. Ребята всё объяснили, подобрали отличный вариант в бюджет. Таможня, документы — всё сделали сами. Теперь езжу и радуюсь.",
    rating: 5,
    date: "Ноябрь 2024",
  },
  {
    name: "Дмитрий Петров",
    city: "Краснодар",
    car: "Kia Sportage GT Line",
    text: "Второй раз обращаюсь в эту компанию. Первый раз привозили Соляриса, теперь взял Спортейдж. Всё так же профессионально. Цена честная, скрытых платежей нет. Однозначно лучший вариант.",
    rating: 5,
    date: "Октябрь 2024",
  },
  {
    name: "Марина Соколова",
    city: "Екатеринбург",
    car: "Toyota Land Cruiser 300",
    text: "Брала для мужа в подарок — Land Cruiser 300 из Японии. Команда нашла машину в нужной комплектации и цвете. Доставили быстрее обещанного. Муж в восторге, говорит лучший подарок в жизни.",
    rating: 5,
    date: "Сентябрь 2024",
  },
];

export default function TestimonialsSection() {
  const [current, setCurrent] = useState(0);

  const prev = () => setCurrent((c) => (c === 0 ? testimonials.length - 1 : c - 1));
  const next = () => setCurrent((c) => (c === testimonials.length - 1 ? 0 : c + 1));

  const t = testimonials[current];

  return (
    <section id="reviews" className="py-28 bg-[#0D1426] relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(212,175,55,0.03) 0%, transparent 60%)" }}
      />

      <div className="max-w-4xl mx-auto px-6">
        <SectionTitle label="Отзывы" title="ЧТО ГОВОРЯТ" highlight="КЛИЕНТЫ" />

        <div className="relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={current}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.4 }}
              className="bg-[#0F1629] border border-[rgba(212,175,55,0.1)] p-10 md:p-14 relative"
            >
              {/* Quote icon */}
              <Quote size={48} className="absolute top-8 right-8 text-[#D4AF37]/10" />

              {/* Stars */}
              <div className="flex gap-1 mb-6">
                {[...Array(t.rating)].map((_, i) => (
                  <Star key={i} size={16} className="text-[#D4AF37] fill-[#D4AF37]" />
                ))}
              </div>

              {/* Text */}
              <p className="text-[#F0EDE8] text-lg md:text-xl leading-relaxed mb-8 relative z-10">
                &ldquo;{t.text}&rdquo;
              </p>

              {/* Author */}
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <div className="font-display text-xl text-[#F0EDE8]">{t.name}</div>
                  <div className="text-[#8892A4] text-sm">{t.city} · {t.car}</div>
                </div>
                <div className="text-[#8892A4] text-sm border border-[rgba(212,175,55,0.15)] px-4 py-2">
                  {t.date}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Controls */}
          <div className="flex items-center justify-between mt-8">
            <div className="flex gap-2">
              {testimonials.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrent(i)}
                  className={`h-1 transition-all duration-300 ${i === current ? "w-8 bg-[#D4AF37]" : "w-4 bg-[#8892A4]/30"}`}
                />
              ))}
            </div>

            <div className="flex gap-3">
              <motion.button
                onClick={prev}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="w-11 h-11 border border-[rgba(212,175,55,0.3)] flex items-center justify-center text-[#D4AF37] hover:bg-[#D4AF37]/10 transition-colors"
              >
                <ChevronLeft size={18} />
              </motion.button>
              <motion.button
                onClick={next}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="w-11 h-11 border border-[rgba(212,175,55,0.3)] flex items-center justify-center text-[#D4AF37] hover:bg-[#D4AF37]/10 transition-colors"
              >
                <ChevronRight size={18} />
              </motion.button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
