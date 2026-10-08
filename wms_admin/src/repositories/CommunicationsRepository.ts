import type {
  CommunicationsOverview,
  SendBroadcastInput,
  SendBroadcastResponse,
} from '../domain/communications';

export interface CommunicationsRepository {
  getOverview(): Promise<CommunicationsOverview>;
  sendBroadcast(input: SendBroadcastInput): Promise<SendBroadcastResponse>;
}
