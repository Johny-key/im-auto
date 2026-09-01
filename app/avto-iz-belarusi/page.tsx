import type { Metadata } from "next";
import { Suspense } from "react";
import Navbar from "@/components/landing/Navbar";
import ContactSection from "@/components/landing/ContactSection";
import Footer from "@/components/landing/Footer";
import FloatingButtons from "@/components/landing/FloatingButtons";
import SeoContentHome5 from "@/components/landing/SeoContentHome5";
import CatalogContent from "@/app/catalog/CatalogContent";

export const metadata: Metadata = {
  title: "Купить и пригнать авто из Беларуси в Россию на заказ и под ключ от IM-Auto",
  description: "Подберите автомобиль в Беларуси по бюджету и требованиям. Сравните варианты, согласуйте проверку, состав расходов, порядок покупки, доставки и оформления в России. Узнайте, что учесть перед заказом, и запросите индивидуальный расчет.",
};

export default function AvtoIzBelarusiPage() {
  return (
    <main className="min-h-screen">
      <Navbar />
      <SeoContentHome5 />
      <Suspense fallback={<div className="min-h-[400px]" />}>
        <CatalogContent defaultCountry="all" embedded />
      </Suspense>
      <ContactSection />
      <Footer />
      <FloatingButtons />
    </main>
  );
}
