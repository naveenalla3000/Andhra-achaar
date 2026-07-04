export const colors = {
  surface: '#FDFBF7',
  onSurface: '#2D2421',
  surfaceSecondary: '#FFFFFF',
  surfaceTertiary: '#F5EFE6',
  onSurfaceTertiary: '#4A3F3A',
  surfaceInverse: '#2D2421',
  onSurfaceInverse: '#FDFBF7',
  brand: '#A33B20',
  brandPrimary: '#A33B20',
  onBrandPrimary: '#FFFFFF',
  brandSecondary: '#D48B30',
  brandTertiary: '#F7E6E1',
  onBrandTertiary: '#8A3019',
  success: '#3D6E4B',
  warning: '#D48B30',
  error: '#B23A3A',
  border: '#E8E1D7',
  borderStrong: '#C2B4A3',
  muted: '#7A6E66',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 };
export const fonts = {
  display: 'LibreBaskerville_700Bold',
  displayRegular: 'LibreBaskerville_400Regular',
  text: 'PlusJakartaSans_400Regular',
  textMedium: 'PlusJakartaSans_500Medium',
  textBold: 'PlusJakartaSans_700Bold',
};

export const statusColors: Record<string, { bg: string; fg: string; label: string }> = {
  placed: { bg: '#F7E6E1', fg: '#8A3019', label: 'Placed' },
  accepted: { bg: '#FFF4E0', fg: '#8A5F00', label: 'Accepted' },
  ready_date_set: { bg: '#E5EEFF', fg: '#2E4B8F', label: 'Ready Date Set' },
  ready_for_takeaway: { bg: '#E6F4EA', fg: '#1E5A2F', label: 'Ready for Pickup' },
  completed: { bg: '#E0E0E0', fg: '#2D2421', label: 'Completed' },
  cancelled: { bg: '#F0D6D6', fg: '#8A2020', label: 'Cancelled' },
};
