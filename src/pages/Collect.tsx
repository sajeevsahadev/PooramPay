import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useApp } from '../state/AppContext';

export default function Collect() {
  const { t } = useTranslation();
  const { can, currentProgram } = useApp();
  const weekly = !!currentProgram?.weekly_amount;

  const items = [
    { to: '/collect/house', icon: '🏠', key: 'collect.house', tile: 'tile-lime', show: true },
    { to: '/coupons', icon: '🎟️', key: 'collect.coupon', tile: 'tile-fuchsia', show: can('coupons') },
    { to: '/collect/weekly', icon: '📅', key: 'collect.subscription', tile: 'tile-cyan', show: weekly },
    { to: '/collect/other', icon: '➕', key: 'collect.other', tile: 'tile-amber', show: true },
  ].filter((x) => x.show);

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">💰 {t('collect.title')}</h1>
      <div className="grid grid-cols-2 gap-3">
        {items.map((x) => (
          <Link key={x.to} to={x.to}
            className="card flex flex-col items-center py-8 text-center transition-all hover:shadow-md hover:border-brand-100">
            <span className={`tile ${x.tile} w-16 h-16 text-4xl mb-3`}>{x.icon}</span>
            <span className="font-semibold">{t(x.key)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
