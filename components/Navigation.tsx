'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

const navItems = [
  { href: '/', label: 'Dashboard', icon: '📊' },
  { href: '/agenda', label: 'Agenda', icon: '📅' },
  { href: '/planner', label: 'Planner', icon: '📋' },
  { href: '/klassen', label: 'Klassen', icon: '👥' },
  { href: '/cijfers', label: 'Cijfers', icon: '📝' },
  { href: '/resultaten', label: 'Resultaten', icon: '📈' },
  { href: '/toetsen', label: 'Toetsen', icon: '✅' },
];

export default function Navigation() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Dashboard heeft eigen navigatie in de topbar
  if (pathname === '/') return null;

  // Sluit menu bij klik erbuiten
  useEffect(() => {
    const handler = () => setMenuOpen(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const currentPage = navItems.find(item => item.href === pathname);

  return (
    <div className="bg-[#1e3a5f] text-white px-4 py-2 flex items-center gap-3 text-sm" style={{ flexShrink: 0 }}>
      {/* Hamburger */}
      <div className="relative" onClick={e => e.stopPropagation()}>
        <button onClick={() => setMenuOpen(!menuOpen)} className="w-8 h-8 flex flex-col items-center justify-center gap-1 rounded hover:bg-white/10">
          <span className="block w-5 h-0.5 bg-white" />
          <span className="block w-5 h-0.5 bg-white" />
          <span className="block w-5 h-0.5 bg-white" />
        </button>
        {menuOpen && (
          <div className="absolute top-10 left-0 bg-white text-gray-800 rounded-lg shadow-xl border border-gray-200 py-2 z-50 min-w-[200px]">
            {navItems.map(item => {
              const isActive = pathname === item.href;
              return (
                <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-blue-50 hover:text-blue-600 transition-colors no-underline
                    ${isActive ? 'bg-blue-50 text-blue-600 font-semibold' : 'text-gray-700'}`}>
                  <span>{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <h1 className="font-bold text-base">Docentenplanner</h1>
      {currentPage && (
        <span className="text-white/50 text-xs">/ {currentPage.label}</span>
      )}
    </div>
  );
}
