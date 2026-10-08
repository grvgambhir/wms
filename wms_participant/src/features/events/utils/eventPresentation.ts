import type { EventCardStatus } from '@/components/event/EventCard';
import type { QuotaStatus } from '@/components/registration/QuotaBadge';
import type { EventStatus } from '@/domain/models/event';
import type { SportAvailability } from '@/domain/models/sport';

export function toEventCardStatus(status: EventStatus): EventCardStatus {
  if (status === 'draft') return 'registration_closed';
  return status;
}

export function toQuotaStatus(availability: SportAvailability): QuotaStatus {
  if (availability === 'closed') return 'full';
  return availability;
}
