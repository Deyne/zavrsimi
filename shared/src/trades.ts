export type TradeSlug =
  | 'vodoinstalater'
  | 'elektricar'
  | 'moler'
  | 'keramicar'
  | 'vozac'
  | 'cisticac'
  | 'babysitter'
  | 'petsitter'
  | 'it_tehnicar'
  | 'privatni_casovi'
  | 'majstor_opste';

export interface TradeOption {
  value: TradeSlug;
  label: string;
  categoryId: number;
}

export const TRADES: TradeOption[] = [
  { value: 'vodoinstalater', label: 'Vodoinstalater', categoryId: 2 },
  { value: 'elektricar', label: 'Električar', categoryId: 3 },
  { value: 'moler', label: 'Moler', categoryId: 4 },
  { value: 'keramicar', label: 'Keramičar', categoryId: 5 },
  { value: 'vozac', label: 'Vozač / prevoz', categoryId: 7 },
  { value: 'cisticac', label: 'Čistač', categoryId: 8 },
  { value: 'babysitter', label: 'Babysitter / čuvanje dece', categoryId: 9 },
  { value: 'petsitter', label: 'Petsitter / čuvanje ljubimaca', categoryId: 10 },
  { value: 'it_tehnicar', label: 'IT tehničar', categoryId: 11 },
  { value: 'privatni_casovi', label: 'Privatni časovi', categoryId: 12 },
  { value: 'majstor_opste', label: 'Majstor (opšte)', categoryId: 1 },
];

export const TRADE_LABELS: Record<string, string> = Object.fromEntries(
  TRADES.map(t => [t.value, t.label])
);

export function getCategoryIdForTrade(trade: string): number | undefined {
  return TRADES.find(t => t.value === trade)?.categoryId;
}

export function getTradesForCategory(categoryId: number): TradeSlug[] {
  return TRADES.filter(t => t.categoryId === categoryId).map(t => t.value);
}

export function userTradeMatchesCategory(trade: string | undefined, categoryId: number): boolean {
  if (!trade) return false;
  if (trade === 'majstor_opste') return true;
  return getTradesForCategory(categoryId).includes(trade as TradeSlug);
}

export function listingAcceptsBids(type: string, isSos?: boolean): boolean {
  return type === 'request' || type === 'sos' || !!isSos;
}
