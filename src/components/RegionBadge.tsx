import type { RegionCode } from '../types';

type RegionBadgeProps = {
  region: RegionCode | 'global' | string | null | undefined;
  label: string;
  compact?: boolean;
};

const regionMeta: Record<RegionCode | 'global', { code: string; symbol: string }> = {
  kr: { code: 'KOR', symbol: '🇰🇷' },
  cn: { code: 'CHN', symbol: '🇨🇳' },
  jp: { code: 'JPN', symbol: '🇯🇵' },
  tw: { code: 'TWN', symbol: '🇹🇼' },
  int: { code: 'INT', symbol: '🌐' },
  unknown: { code: 'UNKNOWN', symbol: '?' },
  global: { code: 'INT', symbol: '🌐' },
};

function normalizeRegion(region: RegionBadgeProps['region']): RegionCode | 'global' {
  if (region === 'kr' || region === 'cn' || region === 'jp' || region === 'tw' || region === 'int') {
    return region;
  }

  if (region === 'global') {
    return 'global';
  }

  return 'unknown';
}

export function RegionBadge({ region, label, compact = false }: RegionBadgeProps) {
  const meta = regionMeta[normalizeRegion(region)];

  return (
    <span
      className={compact ? 'region-badge region-badge-compact' : 'region-badge'}
      title={label}
      aria-label={label}
    >
      <span className="region-symbol" aria-hidden="true">
        {meta.symbol}
      </span>
      <span className="region-code">{meta.code}</span>
    </span>
  );
}
