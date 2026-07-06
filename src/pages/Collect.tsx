import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useApp } from '../state/AppContext';

export default function Collect() {
  const { t } = useTranslation();
  const { can, current } = useApp();
  const weekly = !!current?.programs?.weekly_amount;

  const items = [
    { to: '/collect/house', icon: '🏠', key: 'collect.house', show: true },
    { to: '/coupons', icon: '🎟️', key: 'collect.coupon', show: can('coupons') },
    { to: '/collect/weekly', icon: '📅', key: 'collect.subscription', show: weekly },
    { to: '/collect/other', icon: '➕', key: 'collect.other', show: true },
  ].filter((x) => x.show);

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">{t('collect.title')}</h1>
      <div className="grid grid-cols-2 gap-3">
        {items.map((x) => (
          <Link key={x.to} to={x.to}
            className="card flex flex-col items-center py-8 hover:bg-brand-50 text-center">
            <span className="text-4xl mb-2">{x.icon}</span>
            <span className="font-semibold">{t(x.key)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
