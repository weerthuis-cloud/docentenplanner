'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

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

  // On dashboard page, hide nav (full-screen digibord mode)
  if (pathname === '/') return null;

  return (
    <nav style={{
      width: 220,
      minHeight: '100vh',
      background: '#1e293b',
      color: 'white',
      padding: '1rem 0',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}>
      <div style={{
        padding: '0 1.2rem 1.2rem',
        borderBottom: '1px solid #334155',
        marginBottom: '0.5rem',
      }}>
        <h1 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>Docentenplanner</h1>
      </div>

      {navItems.map(item => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.7rem 1.2rem',
              color: isActive ? '#fff' : '#94a3b8',
              background: isActive ? '#334155' : 'transparent',
              textDecoration: 'none',
              fontSize: '0.95rem',
              fontWeight: isActive ? 600 : 400,
              borderLeft: isActive ? '3px solid #3b82f6' : '3px solid transparent',
              transition: 'all 0.15s',
            }}
          >
            <span style={{ fontSize: '1.1rem' }}>{item.icon}</span>
            {item.label}
          </Link>
        );
      })}

      <div style={{ marginTop: 'auto', padding: '1rem 1.2rem', borderTop: '1px solid #334155' }}>
        <Link href="/" style={{ color: '#64748b', textDecoration: 'none', fontSize: '0.85rem' }}>
          ← Terug naar digibord
        </Link>
      </div>
    </nav>
  );
}
