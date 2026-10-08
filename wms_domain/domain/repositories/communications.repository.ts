// Admin communications-center repository contract (A06 — WS-D / P1). The center reads
// its segments + templates + delivery log and sends broadcasts through this seam only;
// the API implementation swaps in later with no UI change (§6.6).
import type {
  CommunicationsOverview,
  SendBroadcastInput,
  SendBroadcastResponse,
} from '../models/communications';

export interface CommunicationsRepository {
  /** GET — audience segments (with live counts), templates, delivery log + summary. */
  getOverview(): Promise<CommunicationsOverview>;
  /** POST /…/broadcasts — send a broadcast to an audience; appends to the delivery log. */
  sendBroadcast(input: SendBroadcastInput): Promise<SendBroadcastResponse>;
}
