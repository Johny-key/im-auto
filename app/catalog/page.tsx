export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Suspense } from "react";
import CatalogContent from "./CatalogContent";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import FloatingButtons from "@/components/landing/FloatingButtons";
import SeoContentHome4 from "@/components/landing/SeoContentHome4";
import { Clock } from "lucide-react";

export const metadata = {
  title: "Каталог авто из-за границы и рубежа на заказ с расчетом итоговой цены от IM-Auto",
  description: "Сравните автомобили из-за рубежа по основным параметрам и запросите расчет выбранного варианта. Узнайте, из чего складывается итоговая стоимость, какие сведения нужны для заказа и как согласовать подходящее авто.",
};

const COMING_SOON: Record<string, string> = {
  japan:  "Японии",
  europe: "Европы",
};

function ComingSoonPage({ country }: { country: string }) {
  const name = COMING_SOON[country] ?? "этой страны";
  return (
    <main className="bg-[#F5F7FC] min-h-screen">
      <Navbar />
      <div className="min-h-[70vh] flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 mx-auto mb-6 bg-[#EBF0FA] rounded-full flex items-center justify-center">
            <Clock size={36} className="text-[#1B3260]" />
          </div>
          <h1 className="font-display text-3xl text-[#0D1729] mb-3">Скоро открытие</h1>
          <p className="text-[#6B7A96] text-lg mb-2">
            Каталог автомобилей из {name} в&nbsp;пути
          </p>
          <p className="text-[#A0AAB8] text-sm mb-8">
            Мы уже работаем над подбором лучших предложений. Оставьте заявку — и мы свяжемся с вами первыми.
          </p>
          <a
            href="/#contacts"
            className="inline-flex items-center gap-2 bg-[#1B3260] text-white px-6 py-3 rounded-xl text-sm font-semibold hover:bg-[#152850] transition-colors"
          >
            Оставить заявку
          </a>
          <div className="mt-4">
            <a href="/catalog" className="text-[#6B7A96] text-sm hover:text-[#1B3260] transition-colors">
              ← Вернуться в каталог Кореи
            </a>
          </div>
        </div>
      </div>
      <Footer />
      <FloatingButtons />
    </main>
  );
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;

  if (category && category in COMING_SOON) {
    return <ComingSoonPage country={category} />;
  }

  return (
    <main className="bg-[#F5F7FC] min-h-screen w-full overflow-x-hidden">
      <Suspense fallback={<div className="min-h-screen" />}>
        <CatalogContent />
      </Suspense>
      <SeoContentHome4 />
      <Footer />
      <FloatingButtons />
    </main>
  );
}
