import { Badge } from '@/components/ui/badge';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

export type RegistrationStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'action_required'
  | 'waitlisted'
  | 'rejected'
  | 'approved'
  | 'accreditation_pending'
  | 'accreditation_issued';

const STATUS_LABELS: Record<RegistrationStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under Review',
  action_required: 'Action Required',
  waitlisted: 'Waitlisted',
  rejected: 'Rejected',
  approved: 'Approved',
  accreditation_pending: 'Accreditation Pending',
  accreditation_issued: 'Accreditation Ready',
};

const STATUS_STYLES: Record<RegistrationStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  submitted: 'bg-sky-50 text-sky-700',
  under_review: 'bg-amber-50 text-amber-700',
  action_required: 'bg-orange-50 text-orange-700',
  waitlisted: 'bg-violet-50 text-violet-700',
  rejected: 'bg-red-50 text-red-700',
  approved: 'bg-emerald-50 text-emerald-700',
  accreditation_pending: 'bg-blue-50 text-blue-700',
  accreditation_issued: 'bg-primary/10 text-primary',
};

type RegistrationStatusBadgeProps = {
  status: RegistrationStatus;
  className?: string;
};

export function RegistrationStatusBadge({ status, className }: RegistrationStatusBadgeProps) {
  const style = STATUS_STYLES[status];
  return (
    <Badge variant="outline" className={cn('border-transparent', style, className)}>
      <Text className="text-xs font-medium">{STATUS_LABELS[status]}</Text>
    </Badge>
  );
}
