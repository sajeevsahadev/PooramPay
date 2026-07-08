import { useState } from 'react';
import { useTranslation } from 'react-i18next';

function getPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('no geolocation'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => reject(e),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 15000 },
    );
  });
}

/** Big one-tap GPS capture. Stand at the house, tap once, location is stored. */
export default function GpsPin({
  lat, lng, unit, onChange, onError,
}: {
  lat: number | null;
  lng: number | null;
  unit: string;
  onChange: (lat: number | null, lng: number | null) => void;
  onError?: (msg: string | null) => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const pin = async () => {
    setBusy(true);
    onError?.(null);
    try {
      const p = await getPosition();
      onChange(p.lat, p.lng);
    } catch {
      onError?.(t('setup.gpsError'));
    }
    setBusy(false);
  };

  const pinned = lat != null && lng != null;

  if (pinned) {
    return (
      <div className="rounded-lg border border-green-300 bg-green-50 p-3 mb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="font-semibold text-green-800">📍 {t('setup.gpsAttached')}</span>
          <a className="text-brand-700 underline font-semibold text-sm" target="_blank" rel="noreferrer"
            href={`https://maps.google.com/?q=${lat},${lng}`}>
            🗺️ {t('setup.openMap')}
          </a>
        </div>
        <div className="flex items-center justify-between gap-2 mt-1.5">
          <span className="text-xs text-stone-500 money">{lat!.toFixed(5)}, {lng!.toFixed(5)}</span>
          <button type="button" className="text-xs text-stone-500 underline" disabled={busy} onClick={pin}>
            {busy ? t('setup.gpsLocating') : t('setup.gpsRepin')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-3">
      <button type="button" onClick={pin} disabled={busy}
        className="btn w-full py-3 text-base border-2 border-dashed border-brand-600 text-brand-700 bg-brand-50 hover:bg-brand-100">
        {busy ? <>⏳ {t('setup.gpsLocating')}</> : <>📍 {t('setup.pinGps')}</>}
      </button>
      <p className="text-xs text-stone-400 mt-1">{t('setup.gpsHelp', { unit })}</p>
    </div>
  );
}
