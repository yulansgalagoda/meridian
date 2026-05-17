export interface Item {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  story: string;
  year: number | null;
  dateDetail: string;
  era: string;
  categoryId: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  tags: string[];
  maker: string;
  originCountry: string;
  materials: string;
  dimensions: string;
  condition: string;
  primaryImage: string | null;
  galleryImages: string[];
  imageAltText: string;
  featured: boolean;
  displayOrder: number;
  publishStatus: string;
  itemId: number;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  displayOrder: number;
  coverImage: string | null;
  publishStatus: string;
}

export interface SiteData {
  items: Item[];
  categories: Category[];
  aboutHtml: string;
}

export const ERA_OPTIONS = [
  'Ancient',
  'Medieval',
  'Renaissance',
  'Elizabethan',
  'Stuart',
  'Georgian',
  'Regency',
  'Victorian',
  'Edwardian',
  'Interwar',
  'Mid-Century',
  'Late 20th C.',
] as const;

export const CONDITION_OPTIONS = [
  'Mint',
  'Excellent',
  'Good',
  'Fair',
  'Poor',
  'Restoration Needed',
] as const;

export const TAG_OPTIONS = [
  'Optical',
  'Writing',
  'Navigation',
  'Calculation',
  'Meteorology',
  'Photography',
  'Literature',
  'Cartography',
  'Horology',
  'Scientific',
  'Decorative',
] as const;

export const TIMELINE_SEGMENTS = [
  { label: 'pre-1500', from: -Infinity, to: 1499 },
  { label: '1500–1799', from: 1500, to: 1799 },
  { label: '1800–1899', from: 1800, to: 1899 },
  { label: '1900–1950', from: 1900, to: 1950 },
  { label: '1951–present', from: 1951, to: Infinity },
] as const;
