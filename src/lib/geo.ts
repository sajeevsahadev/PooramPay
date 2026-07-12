// Geographic lists for the organization location dropdowns.
// Extend these maps as more country/state/district data arrives.

export const COUNTRIES = ['India'];

// All Indian states (28) followed by union territories (8), alphabetical within
// each group. NOTE: spelled "Kerala" (not "Keralam") so it matches the default
// value used when creating an organization.
export const STATES_BY_COUNTRY: Record<string, string[]> = {
  India: [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa',
    'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala',
    'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland',
    'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
    'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    // Union territories
    'Andaman and Nicobar Islands', 'Chandigarh',
    'Dadra and Nagar Haveli and Daman and Diu',
    'Delhi (National Capital Territory of Delhi)', 'Jammu and Kashmir', 'Ladakh',
    'Lakshadweep', 'Puducherry',
  ],
};

export const DISTRICTS_BY_STATE: Record<string, string[]> = {
  Kerala: [
    'Alappuzha', 'Ernakulam', 'Idukki', 'Kannur', 'Kasaragod', 'Kollam', 'Kottayam',
    'Kozhikode', 'Malappuram', 'Palakkad', 'Pathanamthitta', 'Thiruvananthapuram',
    'Thrissur', 'Wayanad',
  ],
};

export const statesOf = (country: string): string[] => STATES_BY_COUNTRY[country] ?? [];
export const districtsOf = (state: string): string[] => DISTRICTS_BY_STATE[state] ?? [];
