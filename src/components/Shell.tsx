import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useApp } from '../state/AppContext';

const tabIcons: Record<string, string> = {
  home: '🏠', collect: '💰', expenses: '🧾', tasks: '✅', more: '✨',
};
const tabGlow: Record<string, string> = {
  home: 'drop-shadow(0 0 8px rgba(232,121,249,.9))',
  collect: 'drop-shadow(0 0 8px rgba(163,230,53,.9))',
  expenses: 'drop-shadow(0 0 8px rgba(34,211,238,.9))',
  tasks: 'drop-shadow(0 0 8px rgba(251,191,36,.9))',
  more: 'drop-shadow(0 0 8px rgba(139,92,246,.9))',
};

export default function Shell() {
  const { t } = useTranslation();
  const { current, programOptions, currentProgramId, setCurrentProgramId, frozen, can, isPadmin } = useApp();
  const nav = useNavigate();
  const location = useLocation();

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
    { to: '/more', label: t('nav.more'), icon: '✨' },
  ];

  return (
    <div className="min-h-screen md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col w-60 shrink-0 min-h-screen sticky top-0 border-r border-stone-200"
        style={{ background: 'linear-gradient(180deg,#160c33 0%,#0b0620 100%)' }}>
        <div className="p-4 font-black text-xl tracking-tight flex items-center gap-2 text-white">
          <img src="/favicon.svg" alt="" className="w-9 h-9"
            style={{ filter: 'drop-shadow(0 0 10px rgba(217,70,239,.8))' }} />
          <span className="bg-gradient-to-r from-fuchsia-400 via-purple-300 to-cyan-300 bg-clip-text text-transparent">
            {t('app.name')}
          </span>
        </div>
        <nav className="flex-1 px-2 space-y-1">
          {sideLinks.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3 py-2 transition-all ${
                  isActive
                    ? 'text-white font-semibold bg-gradient-to-r from-fuchsia-600/80 to-violet-600/80 shadow-[0_0_16px_rgba(168,85,247,.5)]'
                    : 'text-stone-500 hover:text-stone-800 hover:bg-stone-100'}`}>
              <span>{l.icon}</span>{l.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 text-[10px] text-stone-400">✨ {t('app.tagline')}</div>
      </aside>

      <div className="flex-1 flex flex-col min-h-screen pb-16 md:pb-0">
        {/* Header */}
        <header className="sticky top-0 z-40 border-b border-stone-200 backdrop-blur-md"
          style={{ background: 'rgba(13,7,34,.85)' }}>
          <div className="flex items-center gap-2 px-4 py-2.5">
            <img src="/favicon.svg" alt="" className="w-7 h-7 md:hidden"
              style={{ filter: 'drop-shadow(0 0 8px rgba(217,70,239,.8))' }} />
            <select
              value={currentProgramId ?? ''}
              onChange={(e) => { setCurrentProgramId(e.target.value); nav('/'); }}
              className="flex-1 md:max-w-sm bg-transparent border-0 font-bold text-white focus:ring-0"
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
            <span className="text-xs text-stone-500">
              {isPadmin ? '🛡️ Admin' : current ? t(`roles.${current.role}`) : ''}
            </span>
          </div>
          {frozen && (
            <div className="text-xs px-4 py-1.5 text-cyan-200"
              style={{ background: 'linear-gradient(90deg,rgba(34,211,238,.15),rgba(124,58,237,.15))' }}>
              ❄️ {t('dashboard.frozen')}
            </div>
          )}
        </header>

        <main key={location.pathname} className="flex-1 p-4 max-w-5xl w-full mx-auto page-enter">
          <Outlet />
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 flex border-t border-stone-200 backdrop-blur-md"
          style={{ background: 'rgba(13,7,34,.92)' }}>
          {tabs.map((x) => (
            <NavLink key={x.to} to={x.to} end={x.to === '/'}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center py-1.5 text-[11px] transition-all ${
                  isActive ? 'text-white font-bold' : 'text-stone-500'}`}>
              {({ isActive }) => (
                <>
                  <span className="text-xl leading-6"
                    style={isActive ? { filter: tabGlow[x.key] } : undefined}>
                    {tabIcons[x.key]}
                  </span>
                  {t(`nav.${x.key}`)}
                  <span className={`h-0.5 w-6 rounded-full mt-0.5 ${isActive ? 'bg-gradient-to-r from-cyan-400 to-fuchsia-500' : 'bg-transparent'}`} />
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
