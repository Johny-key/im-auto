"use client";

export default function Footer() {
  return (
    <footer className="bg-[#070B14] border-t border-[rgba(212,175,55,0.1)] py-10">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 border-2 border-[#D4AF37] rotate-45 flex items-center justify-center">
              <div className="w-2 h-2 bg-[#D4AF37]" />
            </div>
            <span className="font-display text-xl text-[#F0EDE8]">IM-<span className="text-[#D4AF37]">AUTO</span></span>
          </div>

          <div className="flex flex-wrap justify-center gap-6 text-sm text-[#8892A4]">
            <a href="#about" className="hover:text-[#D4AF37] transition-colors">О нас</a>
            <a href="#process" className="hover:text-[#D4AF37] transition-colors">Как работаем</a>
            <a href="/catalog" className="hover:text-[#D4AF37] transition-colors">Каталог</a>
            <a href="#contacts" className="hover:text-[#D4AF37] transition-colors">Контакты</a>
            <a href="#" className="hover:text-[#D4AF37] transition-colors">Политика конфиденциальности</a>
          </div>

          <div className="text-[#8892A4]/50 text-xs">
            © {new Date().getFullYear()} IM-Auto. Все права защищены.
          </div>
        </div>
      </div>
    </footer>
  );
}
