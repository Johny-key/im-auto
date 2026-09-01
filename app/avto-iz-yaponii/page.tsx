import type { Metadata } from "next";
import { Suspense } from "react";
import Navbar from "@/components/landing/Navbar";
import ContactSection from "@/components/landing/ContactSection";
import Footer from "@/components/landing/Footer";
import FloatingButtons from "@/components/landing/FloatingButtons";
import SeoContentHome9 from "@/components/landing/SeoContentHome9";
import CatalogContent from "@/app/catalog/CatalogContent";

export const metadata: Metadata = {
  title: "Купить авто из Японии под заказ с растаможкой и доставкой в Россию от IM-Auto",
  description: "Подберем автомобиль на рынке Японии по вашим требованиям, проверим выбранный вариант, согласуем расчет и организуем выкуп, доставку и оформление в России. Изучите условия заказа и доступные автомобили.",
};

export default function AvtoIzYaponiiPage() {
  return (
    <main className="min-h-screen">
      <Navbar />
      <SeoContentHome9 />
      <Suspense fallback={<div className="min-h-[400px]" />}>
        <CatalogContent defaultCountry="all" embedded />
      </Suspense>
      <ContactSection />
      <Footer />
      <FloatingButtons />
    </main>
  );
}
