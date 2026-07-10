// Geographic lists for the organization location dropdowns.
// Start minimal; extend these maps as more country/state/district data arrives.

export const COUNTRIES = ['India'];

export const STATES_BY_COUNTRY: Record<string, string[]> = {
  India: ['Kerala'],
};

export const DISTRICTS_BY_STATE: Record<string, string[]> = {
  Kerala: ['Thrissur'],
};

export const statesOf = (country: string): string[] => STATES_BY_COUNTRY[country] ?? [];
export const districtsOf = (state: string): string[] => DISTRICTS_BY_STATE[state] ?? [];
