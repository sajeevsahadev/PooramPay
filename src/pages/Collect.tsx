import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useApp } from '../state/AppContext';

export default function Collect() {
  const { t } = useTranslation();
  const { can, currentProgram } = useApp();
  const weekly = !!currentProgram?.weekly_amount;

  const items = [
    { to: '/collect/house', icon: '🏠', key: 'collect.house', tile: 'tile-lime', glow: 'rgba(163,230,53,.35)', show: true },
    { to: '/coupons', icon: '🎟️', key: 'collect.coupon', tile: 'tile-fuchsia', glow: 'rgba(217,70,239,.35)', show: can('coupons') },
    { to: '/collect/weekly', icon: '📅', key: 'collect.subscription', tile: 'tile-cyan', glow: 'rgba(34,211,238,.35)', show: weekly },
    { to: '/collect/other', icon: '➕', key: 'collect.other', tile: 'tile-amber', glow: 'rgba(251,191,36,.35)', show: true },
  ].filter((x) => x.show);

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">💰 {t('collect.title')}</h1>
      <div className="grid grid-cols-2 gap-3">
        {items.map((x) => (
          <Link key={x.to} to={x.to}
            className="card flex flex-col items-center py-8 text-center transition-all hover:-translate-y-1"
            style={{ boxShadow: `0 4px 24px rgb(0 0 0 / .35), 0 0 0 rgb(0 0 0 / 0)` }}
            onMouseEnter={(e) => { e.currentTarget.style.boxShadow = `0 8px 28px rgb(0 0 0/.4), 0 0 24px ${x.glow}`; }}
            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = ''; }}>
            <span className={`tile ${x.tile} w-16 h-16 text-4xl mb-3`}>{x.icon}</span>
            <span className="font-semibold">{t(x.key)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
