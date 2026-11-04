export interface Welcome { name: string; activeDays: number; badge: 'visitor' | 'friend' | 'keeper'; at: number }
export interface GrowthSnapshot { enabled: boolean; welcome: Welcome | null }
export interface GrowthMetrics {
  since: number; fromDay: string; throughDay: string;
  participants: number; gifters: number; giftParticipationRate: number | null;
  returningParticipants: number; appliedCoins: number;
  d1: { cohortDay: string; returnDay: string; eligible: number; returned: number; rate: number | null; available: boolean };
}
/** Badges come from distinct participation days. Spending never upgrades them faster. */
export function participationBadge(days: number): Welcome['badge'] {
  return days >= 7 ? 'keeper' : days >= 3 ? 'friend' : 'visitor';
}
export function badgeName(badge: Welcome['badge']): string {
  return badge === 'keeper' ? 'Slime Ustası' : badge === 'friend' ? 'Yeğen' : 'Misafir';
}
