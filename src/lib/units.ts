import { useTranslation } from 'react-i18next';
import { useApp } from '../state/AppContext';

/**
 * The payer register is called different things per program:
 * houses (temple), members (club), families, shops, units.
 * Returns the singular/plural words in the current language.
 */
export function useUnits() {
  const { t } = useTranslation();
  const { currentProgram } = useApp();
  const label = currentProgram?.unit_label ?? 'house';
  return {
    label,
    unit: t(`units.${label}.one`),
    units: t(`units.${label}.many`),
  };
}

/** Label for an income entry type; 'house' adapts to the program's register unit. */
export function incomeTypeLabel(
  t: (k: string, o?: Record<string, unknown>) => string,
  type: string,
  unit: string,
): string {
  return type === 'house' ? t('collect.unitCollection', { unit }) : t('collect.' + type);
}
