"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import SectionTitle from "../ui/SectionTitle";
const categories = [
  {
    slug: "ekonom",
    label: "Эконом",
    price: "до 1 500 000 ₽",
    description: "Надёжные городские автомобили: Hyundai, Kia, Toyota. Оптимальное соотношение цена/качество.",
    examples: "Hyundai Solaris, Kia Rio, Toyota Vitz",
    color: "from-[#1a3a2a] to-[#0d1e15]",
    accent: "#4ade80",
    photoBg: "radial-gradient(ellipse at 60% 40%, #1a4a2a 0%, #0d2418 50%, #070f0a 100%)",
    icon: "🚗",
  },
  {
    slug: "komfort",
    label: "Комфорт",
    price: "до 3 000 000 ₽",
    description: "Просторные седаны и кроссоверы с богатой комплектацией. Идеально для семьи.",
    examples: "Hyundai Tucson, Kia Sportage, Toyota Camry",
    color: "from-[#1a2a3a] to-[#0d1520]",
    accent: "#60a5fa",
    photoBg: "radial-gradient(ellipse at 60% 40%, #1a2e4a 0%, #0d1a30 50%, #070b18 100%)",
    icon: "🚙",
  },
  {
    slug: "biznes",
    label: "Бизнес",
    price: "до 6 000 000 ₽",
    description: "Премиальные авто бизнес-класса с максимальными опциями. Статус и комфорт.",
    examples: "Genesis G80, BMW 5, Mercedes E-Class",
    color: "from-[#2a1a3a] to-[#18102a]",
    accent: "#c084fc",
    photoBg: "radial-gradient(ellipse at 60% 40%, #2a1a4a 0%, #1a0f30 50%, #0f0818 100%)",
    icon: "🏎️",
  },
  {
    slug: "premium",
    label: "Премиум",
    price: "от 6 000 000 ₽",
    description: "Эксклюзивные автомобили высшего класса. Индивидуальный подход и белые перчатки.",
    examples: "Genesis GV80, BMW X7, Porsche Cayenne",
    color: "from-[#2a1f0a] to-[#1a1308]",
    accent: "#D4AF37",
    photoBg: "radial-gradient(ellipse at 60% 40%, #3a2a0a 0%, #241a05 50%, #120d02 100%)",
    icon: "👑",
  },
];

export default function CategoriesSection() {
  const router = useRouter();

  return (
    <section id="categories" className="py-28 bg-[#0A0F1E] relative overflow-hidden">
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#D4AF37]/20 to-transparent" />

      <div className="max-w-6xl mx-auto px-6">
        <SectionTitle
          label="Каталог"
          title="ВЫБЕРИТЕ"
          highlight="СВОЙ СЕГМЕНТ"
          subtitle="Нажмите на категорию, чтобы перейти в каталог с подобранными автомобилями"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {categories.map((cat, i) => (
            <motion.div
              key={cat.slug}
              className={`relative bg-gradient-to-b ${cat.color} border cursor-pointer overflow-hidden group`}
              style={{ borderColor: `${cat.accent}20` }}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              whileHover={{ y: -6 }}
              onClick={() => router.push(`/catalog?category=${cat.slug}`)}
            >
              {/* Hover glow */}
              <motion.div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10"
                style={{ background: `radial-gradient(circle at 50% 0%, ${cat.accent}15, transparent 70%)` }}
              />

              {/* Photo */}
              <div className="relative w-full h-44 overflow-hidden flex items-center justify-center" style={{ background: cat.photoBg }}>
                <span className="text-6xl opacity-30 select-none">{cat.icon}</span>
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/60" />
                {/* Price badge */}
                <div
                  className="absolute bottom-3 left-4 text-xs font-bold tracking-wide"
                  style={{ color: cat.accent }}
                >
                  {cat.price}
                </div>
              </div>

              <div className="relative z-10 p-7">
                {/* Label */}
                <div className="font-display text-3xl text-[#F0EDE8] mb-3 tracking-wide">{cat.label}</div>

                {/* Line */}
                <div className="h-px w-full mb-4" style={{ background: `linear-gradient(90deg, ${cat.accent}40, transparent)` }} />

                {/* Description */}
                <p className="text-[#8892A4] text-sm leading-relaxed mb-4">{cat.description}</p>

                {/* Examples */}
                <p className="text-xs text-[#8892A4]/60 mb-6">{cat.examples}</p>

                {/* CTA */}
                <div className="flex items-center gap-2 text-sm font-medium" style={{ color: cat.accent }}>
                  <span className="uppercase tracking-wider text-xs">Смотреть авто</span>
                  <motion.span
                    className="inline-flex"
                    initial={{ x: 0 }}
                    whileHover={{ x: 4 }}
                  >
                    <ChevronRight size={14} />
                  </motion.span>
                </div>
              </div>

              {/* Bottom accent line */}
              <div className="absolute bottom-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{ background: `linear-gradient(90deg, transparent, ${cat.accent}, transparent)` }}
              />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
