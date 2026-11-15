/** Minimal Telegram Bot API client (https://core.telegram.org/bots/api). */
export class TelegramApiError extends Error {
  constructor(public readonly status: number, public readonly description: string) {
    super(`Telegram API ${status}: ${description}`);
  }
  /** 403 = user blocked the bot / never started it; 400 chat not found. Retrying will not help. */
  get permanent() {
    return this.status === 403 || (this.status === 400 && /chat not found|user is deactivated/i.test(this.description));
  }
}

export interface MessageSender {
  sendMessage(chatId: bigint, text: string, extra?: Record<string, unknown>): Promise<void>;
}

export class TelegramBot implements MessageSender {
  constructor(private readonly token: string) {}

  async call<T>(method: string, body: Record<string, unknown>, timeoutMs = 15000): Promise<T> {
    const res = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body, (_, v) => (typeof v === 'bigint' ? v.toString() : v)),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string; error_code?: number };
    if (!json.ok) throw new TelegramApiError(json.error_code ?? res.status, json.description ?? 'unknown error');
    return json.result as T;
  }

  async sendMessage(chatId: bigint, text: string, extra: Record<string, unknown> = {}) {
    await this.call('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra });
  }
}
