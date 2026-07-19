import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useApp } from '../state/AppContext';
import Tour from './Tour';

const tabIcons: Record<string, string> = {
  home: '🏠', collect: '💰', expenses: '🧾', tasks: '✅', more: '☰',
};

export default function Shell() {
  const { t } = useTranslation();
  const { current, programOptions, currentProgramId, setCurrentProgramId, frozen, can, isPadmin } = useApp();
  const nav = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showTour, setShowTour] = useState(false);

  // first visit: walk the user through the app once
  useEffect(() => {
    if (!localStorage.getItem('pp-tour-done')) setShowTour(true);
  }, []);
  const closeTour = () => { localStorage.setItem('pp-tour-done', '1'); setShowTour(false); };

  // the drawer covers navigation; close it whenever the route changes
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  // platform admins see every program, grouped by organization
  const orgGroups = (() => {
    const g = new Map<string, typeof programOptions>();
    for (const p of programOptions) {
      const org = p.committees?.organizations?.name ?? '—';
      if (!g.has(org)) g.set(org, []);
      g.get(org)!.push(p);
    }
    return [...g.entries()];
  })();

  const tabs = [
    { to: '/', key: 'home', show: true },
    { to: '/collect', key: 'collect', show: can('collect') && !frozen },
    { to: '/expenses', key: 'expenses', show: can('expense') || can('approve') },
    { to: '/tasks', key: 'tasks', show: true },
    { to: '/more', key: 'more', show: true },
  ].filter((x) => x.show);

  const sideLinks = [
    { to: '/', label: t('nav.home'), icon: '🏠' },
    ...(can('collect') && !frozen ? [{ to: '/collect', label: t('nav.collect'), icon: '💰' }] : []),
    { to: '/expenses', label: t('nav.expenses'), icon: '🧾' },
    ...(can('coupons') ? [{ to: '/coupons', label: t('nav.coupons'), icon: '🎟️' }] : []),
    { to: '/transactions', label: t('nav.transactions'), icon: '📒' },
    { to: '/tasks', label: t('nav.tasks'), icon: '✅' },
    { to: '/reports', label: t('nav.reports'), icon: '📊' },
    { to: '/more', label: t('nav.more'), icon: '☰' },
  ];

  return (
    <div className="min-h-screen md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col w-60 shrink-0 min-h-screen sticky top-0 bg-white border-r border-stone-200">
        <div className="p-4 font-black text-xl tracking-tight flex items-center gap-2 text-brand-800">
          <img src="/favicon.svg?v=2" alt="" className="w-9 h-9" />
          {t('app.name')}
        </div>
        <nav className="flex-1 px-2 space-y-0.5">
          {sideLinks.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors ${
                  isActive
                    ? 'bg-brand-50 text-brand-800 font-semibold border border-brand-100'
                    : 'text-stone-600 hover:bg-stone-50'}`}>
              <span>{l.icon}</span>{l.label}
            </NavLink>
          ))}
        </nav>
        <button onClick={() => setShowTour(true)}
          className="mx-2 mb-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-stone-600 hover:bg-stone-50 text-left">
          <span>❓</span>{t('tour.title')}
        </button>
        <div className="p-3 text-[10px] text-stone-400">{t('app.tagline')}</div>
      </aside>

      <div className="flex-1 flex flex-col min-h-screen pb-16 md:pb-0">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-stone-100">
          <div className="flex items-center gap-2 px-4 py-2.5">
            {/* hamburger — full menu + tour, mobile only */}
            <button onClick={() => setMenuOpen(true)} aria-label="menu"
              className="md:hidden min-h-0 p-1.5 -ml-1.5 rounded-lg text-stone-700 hover:bg-stone-100">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.2" strokeLinecap="round">
                <line x1="4" y1="6" x2="20" y2="6" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="18" x2="20" y2="18" />
              </svg>
            </button>
            <img src="/favicon.svg?v=2" alt="" className="w-8 h-8 rounded-lg md:hidden" />
            <select
              value={currentProgramId ?? ''}
              onChange={(e) => { setCurrentProgramId(e.target.value); nav('/'); }}
              className="flex-1 md:max-w-sm border-0 bg-transparent font-bold text-stone-800 focus:ring-0"
            >
              {isPadmin && orgGroups.length > 1
                ? orgGroups.map(([org, progs]) => (
                    <optgroup key={org} label={org}>
                      {progs.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} {p.year}</option>
                      ))}
                    </optgroup>
                  ))
                : programOptions.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} {p.year}</option>
                  ))}
            </select>
            <span className={`shrink-0 ${isPadmin ? 'chip-blue' : 'chip-gray'}`}>
              {isPadmin ? '🛡️ Admin' : current ? t(`roles.${current.role}`) : ''}
            </span>
          </div>
          {frozen && (
            <div className="bg-stone-100 text-stone-600 text-xs px-4 py-1.5 border-t border-stone-100">
              ❄️ {t('dashboard.frozen')}
            </div>
          )}
        </header>

        <main key={location.pathname} className="flex-1 p-4 max-w-5xl w-full mx-auto page-enter">
          <Outlet />
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 flex bg-white border-t border-stone-100
          pb-[env(safe-area-inset-bottom)]">
          {tabs.map((x) => (
            <NavLink key={x.to} to={x.to} end={x.to === '/'}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] transition-colors ${
                  isActive ? 'text-brand-700 font-bold' : 'text-stone-500'}`}>
              <span className="text-xl leading-6">{tabIcons[x.key]}</span>
              {t(`nav.${x.key}`)}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Mobile drawer — full navigation + tour */}
      {menuOpen && (
        <div className="fixed inset-0 z-[110] md:hidden" onClick={() => setMenuOpen(false)}>
          <div className="absolute inset-0 bg-[rgb(15_12_30/0.5)] backdrop-blur-sm" />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-2xl flex flex-col
            animate-[drawerIn_0.2s_ease]" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 flex items-center gap-2 border-b border-stone-100">
              <img src="/favicon.svg?v=2" alt="" className="w-9 h-9 rounded-lg" />
              <span className="font-black text-lg text-brand-800">{t('app.name')}</span>
              <button className="ml-auto text-stone-400 px-1 min-h-0" onClick={() => setMenuOpen(false)}>✕</button>
            </div>
            <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {sideLinks.map((l) => (
                <NavLink key={l.to} to={l.to} end={l.to === '/'}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 rounded-lg px-3 py-2.5 ${
                      isActive
                        ? 'bg-brand-50 text-brand-800 font-semibold'
                        : 'text-stone-700 hover:bg-stone-50'}`}>
                  <span>{l.icon}</span>{l.label}
                </NavLink>
              ))}
            </nav>
            <div className="p-2 border-t border-stone-100">
              <button onClick={() => { setMenuOpen(false); setShowTour(true); }}
                className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-brand-700 font-semibold hover:bg-brand-50 text-left">
                <span>❓</span>{t('tour.title')}
              </button>
              <Link to="/privacy" className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-stone-500 hover:bg-stone-50">
                <span>🔒</span>{t('privacy.title')}
              </Link>
            </div>
          </div>
        </div>
      )}

      {showTour && <Tour onClose={closeTour} />}
    </div>
  );
}
