import { Logger } from '@nestjs/common';

/**
 * SMS integration point. A real provider (Eskiz, Play Mobile, etc.) implements this interface
 * and is selected via SMS_PROVIDER. No real provider ships with the MVP; nothing pretends to send.
 */
export interface SmsProvider {
  readonly name: string;
  /** True when messages actually leave the system. */
  readonly delivers: boolean;
  send(phone: string, text: string): Promise<void>;
}

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

/** No provider configured: sending is impossible and callers must handle that honestly. */
export class DisabledSmsProvider implements SmsProvider {
  readonly name = 'none';
  readonly delivers = false;
  async send(): Promise<void> {
    throw new Error('SMS provider is not configured');
  }
}

/** DEVELOPMENT ONLY: writes the message to the API log instead of sending it. */
export class ConsoleSmsProvider implements SmsProvider {
  readonly name = 'console';
  readonly delivers = false;
  private readonly logger = new Logger('DevSMS');
  async send(phone: string, text: string): Promise<void> {
    this.logger.warn(`[NOT SENT – dev console provider] to ${phone}: ${text}`);
  }
}
