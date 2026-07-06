import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useApp } from '../state/AppContext';

const tabIcons: Record<string, string> = {
  home: '🏠', collect: '💰', expenses: '🧾', tasks: '✅', more: '☰',
};

export default function Shell() {
  const { t } = useTranslation();
  const { current, memberships, currentProgramId, setCurrentProgramId, frozen, can, isPadmin } = useApp();
  const nav = useNavigate();

  const tabs = [
    { to: '/', key: 'home', show: true },
    { to: '/collect', key: 'collect', show: can('collect') && !frozen },
    { to: '/expenses', key: 'expenses', show: can('expense') || can('approve') },
    { to: '/tasks', key: 'tasks', show: true },
    { to: '/more', key: 'more', show: true },
  ].filter((x) => x.show);

  const sideLinks = [
    { to: '/', label: t('nav.home') },
    ...(can('collect') && !frozen ? [{ to: '/collect', label: t('nav.collect') }] : []),
    { to: '/expenses', label: t('nav.expenses') },
    ...(can('coupons') ? [{ to: '/coupons', label: t('nav.coupons') }] : []),
    { to: '/transactions', label: t('nav.transactions') },
    { to: '/tasks', label: t('nav.tasks') },
    { to: '/reports', label: t('nav.reports') },
    { to: '/more', label: t('nav.more') },
  ];

  return (
    <div className="min-h-screen md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col w-60 shrink-0 bg-brand-800 text-white min-h-screen sticky top-0">
        <div className="p-4 font-black text-xl tracking-tight flex items-center gap-2">
          <img src="/favicon.svg" alt="" className="w-8 h-8" /> {t('app.name')}
        </div>
        <nav className="flex-1 px-2 space-y-1">
          {sideLinks.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.to === '/'}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2 ${isActive ? 'bg-brand-600 font-semibold' : 'hover:bg-brand-700'}`}>
              {l.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col min-h-screen pb-16 md:pb-0">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-brand-800 md:bg-white text-white md:text-stone-800 border-b border-brand-700 md:border-stone-200">
          <div className="flex items-center gap-2 px-4 py-2.5">
            <img src="/favicon.svg" alt="" className="w-7 h-7 md:hidden" />
            <select
              value={currentProgramId ?? ''}
              onChange={(e) => { setCurrentProgramId(e.target.value); nav('/'); }}
              className="flex-1 md:max-w-sm bg-transparent md:bg-white border-0 md:border font-bold text-white md:text-stone-800 focus:ring-0"
            >
              {memberships.map((m) => (
                <option key={m.program_id} value={m.program_id} className="text-stone-800">
                  {m.programs?.name} {m.programs?.year}
                </option>
              ))}
            </select>
            <span className="text-xs opacity-80 md:opacity-100 md:text-stone-500">
              {current ? t(`roles.${current.role}`) : isPadmin ? 'Admin' : ''}
            </span>
          </div>
          {frozen && (
            <div className="bg-stone-700 md:bg-stone-100 md:text-stone-700 text-stone-100 text-xs px-4 py-1.5">
              ❄️ {t('dashboard.frozen')}
            </div>
          )}
        </header>

        <main className="flex-1 p-4 max-w-5xl w-full mx-auto">
          <Outlet />
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-stone-200 flex">
          {tabs.map((x) => (
            <NavLink key={x.to} to={x.to} end={x.to === '/'}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center py-1.5 text-[11px] ${isActive ? 'text-brand-700 font-bold' : 'text-stone-500'}`}>
              <span className="text-xl leading-6">{tabIcons[x.key]}</span>
              {t(`nav.${x.key}`)}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
