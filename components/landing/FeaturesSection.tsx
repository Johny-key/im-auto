"use client";

import { motion } from "framer-motion";
import { Shield, Clock, FileText, Truck, Handshake, Globe } from "lucide-react";
import SectionTitle from "../ui/SectionTitle";

const features = [
  {
    icon: Shield,
    title: "Гарантия юридической чистоты",
    description: "Проверка VIN, истории ДТП, обременений и залогов через международные базы данных.",
  },
  {
    icon: Clock,
    title: "Поддержка 24/7",
    description: "Личный менеджер всегда на связи: Telegram, WhatsApp, телефон. Без выходных.",
  },
  {
    icon: Truck,
    title: "Доставка 30–45 дней",
    description: "Работаем с проверенными логистическими партнёрами. GPS-отслеживание груза.",
  },
  {
    icon: FileText,
    title: "Таможня под ключ",
    description: "Берём на себя все таможенные формальности, оплату пошлин и оформление ЭПТС.",
  },
  {
    icon: Handshake,
    title: "Честные условия",
    description: "Фиксированная стоимость услуг без скрытых комиссий. Договор с чётким описанием услуг.",
  },
  {
    icon: Globe,
    title: "Широкий выбор",
    description: "Тысячи авто на площадках Кореи, Японии и Китая. Подберём под любой запрос.",
  },
];

const nums = ["01", "02", "03", "04", "05", "06"];

export default function FeaturesSection() {
  return (
    <section id="features" className="py-28 bg-[#0D1426] relative overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 50% 100%, rgba(212,175,55,0.05) 0%, transparent 60%)",
        }}
      />

      <div className="max-w-6xl mx-auto px-6">
        <SectionTitle
          label="Почему мы"
          title="НАШИ"
          highlight="ПРЕИМУЩЕСТВА"
          subtitle="Всё что нужно для безопасной и комфортной покупки автомобиля за рубежом"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            <motion.div
              key={i}
              className="group relative bg-[#0F1629] border border-[rgba(212,175,55,0.08)] p-7 overflow-hidden cursor-default neon-border flex flex-col gap-5"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              whileHover={{ y: -3 }}
            >
              {/* Hover racing stripe */}
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(-45deg, transparent, transparent 10px, rgba(212,175,55,0.03) 10px, rgba(212,175,55,0.03) 20px)",
                  backgroundSize: "60px 60px",
                }}
              />

              {/* Corner accent — top-left */}
              <div className="absolute top-0 left-0 w-16 h-16 pointer-events-none">
                <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-[#D4AF37]/40 to-transparent group-hover:from-[#D4AF37]/80 transition-colors duration-300" />
                <div className="absolute top-0 left-0 h-full w-[2px] bg-gradient-to-b from-[#D4AF37]/40 to-transparent group-hover:from-[#D4AF37]/80 transition-colors duration-300" />
              </div>

              {/* Corner accent — bottom-right */}
              <div className="absolute bottom-0 right-0 w-16 h-16 pointer-events-none">
                <div className="absolute bottom-0 right-0 w-full h-[2px] bg-gradient-to-l from-[#D4AF37]/20 to-transparent group-hover:from-[#D4AF37]/60 transition-colors duration-300" />
                <div className="absolute bottom-0 right-0 h-full w-[2px] bg-gradient-to-t from-[#D4AF37]/20 to-transparent group-hover:from-[#D4AF37]/60 transition-colors duration-300" />
              </div>

              {/* ── Top row: icon (left) + ghost number (right) ── */}
              <div className="relative z-10 flex items-center justify-between">
                <div
                  className="w-12 h-12 border border-[#D4AF37]/30 flex items-center justify-center
                    group-hover:border-[#D4AF37]/65 group-hover:shadow-[0_0_16px_rgba(212,175,55,0.15)]
                    transition-all duration-300 shrink-0"
                >
                  <feature.icon size={22} className="text-[#D4AF37]" />
                </div>

                <span
                  className="font-display text-5xl leading-none select-none text-[#D4AF37]/10
                    group-hover:text-[#D4AF37]/18 transition-colors duration-300"
                >
                  {nums[i]}
                </span>
              </div>

              {/* ── Title ── */}
              <h3 className="relative z-10 font-display text-lg text-[#F0EDE8] leading-snug tracking-wide">
                {feature.title}
              </h3>

              {/* ── Description ── */}
              <p className="relative z-10 text-[#8892A4] text-sm leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
