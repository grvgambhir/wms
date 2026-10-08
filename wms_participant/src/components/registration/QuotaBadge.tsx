import { Badge } from '@/components/ui/badge';
import { Text } from '@/components/ui/text';
import { copy } from '@/constants/copy';
import { cn } from '@/lib/utils';

export type QuotaStatus = 'available' | 'almost_full' | 'full' | 'waitlist' | 'closed';

const QUOTA_CONFIG: Record<
  QuotaStatus,
  { label: string; className: string; textClassName: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  available: {
    label: copy.quotaAvailable,
    className: 'border-transparent bg-emerald-50',
    textClassName: 'text-emerald-700',
    variant: 'outline',
  },
  almost_full: {
    label: copy.quotaAlmostFull,
    className: 'border-transparent bg-amber-50',
    textClassName: 'text-amber-700',
    variant: 'outline',
  },
  full: {
    label: copy.quotaFull,
    className: 'border-transparent bg-red-50',
    textClassName: 'text-red-700',
    variant: 'outline',
  },
  waitlist: {
    label: copy.quotaWaitlist,
    className: 'border-transparent bg-sky-50',
    textClassName: 'text-sky-700',
    variant: 'outline',
  },
  closed: {
    label: copy.registrationClosed,
    className: 'border-transparent bg-muted',
    textClassName: 'text-muted-foreground',
    variant: 'secondary',
  },
};

type QuotaBadgeProps = {
  status: QuotaStatus;
  className?: string;
};

export function QuotaBadge({ status, className }: QuotaBadgeProps) {
  const config = QUOTA_CONFIG[status];

  return (
    <Badge variant={config.variant} className={cn(config.className, className)}>
      <Text className={cn('text-xs font-medium', config.textClassName)}>{config.label}</Text>
    </Badge>
  );
}
