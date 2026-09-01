import type { Metadata } from "next";
import { Suspense } from "react";
import Navbar from "@/components/landing/Navbar";
import ContactSection from "@/components/landing/ContactSection";
import Footer from "@/components/landing/Footer";
import FloatingButtons from "@/components/landing/FloatingButtons";
import SeoContentHome7 from "@/components/landing/SeoContentHome7";
import CatalogContent from "@/app/catalog/CatalogContent";

export const metadata: Metadata = {
  title: "Заказ авто из Киргизии под ключ: подбор, проверка, доставка и оформление в России от IM-Auto",
  description: "Подберите автомобиль в Киргизии по бюджету и требованиям. Согласуйте проверку выбранного варианта, состав расходов, порядок выкупа, доставки и оформления в России. Изучите этапы заказа и запросите индивидуальный расчет.",
};

export default function AvtoIzKirgiziiPage() {
  return (
    <main className="min-h-screen">
      <Navbar />
      <SeoContentHome7 />
      <Suspense fallback={<div className="min-h-[400px]" />}>
        <CatalogContent defaultCountry="all" embedded />
      </Suspense>
      <ContactSection />
      <Footer />
      <FloatingButtons />
    </main>
  );
}
