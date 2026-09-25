import type { EntryType } from './types';

export interface CategorySeed {
  name: string;
  type: EntryType;
  icon: string;
  color: string;
}

/** Categorias iniciais — as mesmas do app antigo, com ícone e cor. Todas editáveis. */
export const DEFAULT_CATEGORIES: CategorySeed[] = [
  { name: 'Moradia', type: 'expense', icon: 'home-outline', color: '#5B7CFA' },
  { name: 'Alimentação', type: 'expense', icon: 'food-outline', color: '#F08A4B' },
  { name: 'Transporte', type: 'expense', icon: 'bus', color: '#3BA99C' },
  { name: 'Cartão', type: 'expense', icon: 'credit-card-outline', color: '#8E6CE8' },
  { name: 'Saúde', type: 'expense', icon: 'heart-pulse', color: '#E25C7B' },
  { name: 'Educação', type: 'expense', icon: 'school-outline', color: '#2F9BD6' },
  { name: 'Lazer', type: 'expense', icon: 'gamepad-variant-outline', color: '#D9A21B' },
  { name: 'Família', type: 'expense', icon: 'account-heart-outline', color: '#C46BB5' },
  { name: 'Contas', type: 'expense', icon: 'file-document-outline', color: '#6D7F8C' },
  { name: 'Outros', type: 'expense', icon: 'dots-horizontal-circle-outline', color: '#8A9491' },
  { name: 'Salário', type: 'income', icon: 'briefcase-outline', color: '#17B890' },
  { name: 'Renda extra', type: 'income', icon: 'cash-plus', color: '#2EA36B' },
  { name: 'Benefício', type: 'income', icon: 'gift-outline', color: '#4CB5AE' },
  { name: 'Outros', type: 'income', icon: 'dots-horizontal-circle-outline', color: '#8A9491' },
];

export const DEFAULT_ACCOUNT = { name: 'Carteira', kind: 'cash' as const, color: '#17B890' };

export const CATEGORY_ICONS = [
  'home-outline', 'food-outline', 'cart-outline', 'bus', 'car-outline', 'gas-station-outline',
  'credit-card-outline', 'heart-pulse', 'pill', 'school-outline', 'book-open-variant',
  'gamepad-variant-outline', 'movie-open-outline', 'airplane', 'account-heart-outline',
  'baby-face-outline', 'paw', 'tshirt-crew-outline', 'cellphone', 'wifi', 'lightning-bolt-outline',
  'water-outline', 'file-document-outline', 'gift-outline', 'briefcase-outline', 'cash-plus',
  'piggy-bank-outline', 'chart-line', 'dumbbell', 'dots-horizontal-circle-outline',
];

export const PALETTE = [
  '#17B890', '#2EA36B', '#3BA99C', '#4CB5AE', '#2F9BD6', '#5B7CFA', '#8E6CE8',
  '#C46BB5', '#E25C7B', '#DC5A5A', '#F08A4B', '#D9A21B', '#6D7F8C', '#8A9491',
];
