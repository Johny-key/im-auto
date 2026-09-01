import type { Metadata } from "next";
import { Suspense } from "react";
import Navbar from "@/components/landing/Navbar";
import ContactSection from "@/components/landing/ContactSection";
import Footer from "@/components/landing/Footer";
import FloatingButtons from "@/components/landing/FloatingButtons";
import SeoContentHome10 from "@/components/landing/SeoContentHome10";
import CatalogContent from "@/app/catalog/CatalogContent";

export const metadata: Metadata = {
  title: "Купить авто из Кореи под заказ с растаможкой и доставкой в Россию от IM-Auto",
  description: "Подберем автомобиль на корейском рынке по бюджету и требованиям, проверим сведения о выбранном варианте, согласуем расчет, организуем выкуп, доставку в Россию и необходимое оформление. Получите консультацию по заказу.",
};

export default function AvtoIzKoreiPage() {
  return (
    <main className="min-h-screen">
      <Navbar />
      <SeoContentHome10 />
      <Suspense fallback={<div className="min-h-[400px]" />}>
        <CatalogContent defaultCountry="korea" embedded />
      </Suspense>
      <ContactSection />
      <Footer />
      <FloatingButtons />
    </main>
  );
}
