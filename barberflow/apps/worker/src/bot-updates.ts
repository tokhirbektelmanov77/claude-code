import { createHash } from 'node:crypto';
import { PrismaClient } from '@barberflow/db';
import { TelegramBot } from './telegram';

interface Update {
  update_id: number;
  message?: { chat: { id: number; type: string }; from?: { id: number; language_code?: string }; text?: string };
}

/**
 * Long-polls getUpdates and handles /start:
 *   /start link_<token>  binds this private chat to the web account that created the token;
 *   /start               remembers the chat for a user who already logged in via the Mini App.
 * Only then may the worker message the user (bots cannot open conversations).
 */
export class BotUpdates {
  private offset = 0;
  constructor(private readonly bot: TelegramBot, private readonly prisma: PrismaClient, private readonly appUrl: string) {}

  async pollOnce() {
    const updates = await this.bot.call<Update[]>('getUpdates', { offset: this.offset, timeout: 25, allowed_updates: ['message'] }, 35000);
    for (const u of updates) {
      this.offset = u.update_id + 1;
      await this.handle(u).catch(() => undefined);
    }
  }

  private async handle(u: Update) {
    const msg = u.message;
    if (!msg?.text || msg.chat.type !== 'private' || !msg.from) return;
    const [cmd, payload] = msg.text.trim().split(/\s+/, 2);
    if (cmd !== '/start') return;
    const chatId = BigInt(msg.chat.id);
    const uz = msg.from.language_code === 'uz';

    if (payload?.startsWith('link_')) {
      const tokenHash = createHash('sha256').update(payload.slice(5)).digest('hex');
      const link = await this.prisma.telegramLinkToken.findUnique({ where: { tokenHash } });
      if (!link || link.consumedAt || link.expiresAt < new Date()) {
        await this.bot.sendMessage(chatId, uz ? 'Havola eskirgan. Ilovada qayta urinib ko‘ring.' : 'Ссылка устарела. Попробуйте ещё раз в приложении.');
        return;
      }
      await this.prisma.$transaction([
        this.prisma.telegramLinkToken.update({ where: { id: link.id }, data: { consumedAt: new Date() } }),
        // The Telegram account can belong to only one user.
        this.prisma.user.updateMany({ where: { telegramId: BigInt(msg.from.id), NOT: { id: link.userId } }, data: { telegramId: null, telegramChatId: null } }),
        this.prisma.user.update({ where: { id: link.userId }, data: { telegramId: BigInt(msg.from.id), telegramChatId: chatId } }),
      ]);
      await this.bot.sendMessage(chatId, uz ? '✅ Telegram ulandi. Endi eslatmalar shu yerga keladi.' : '✅ Telegram подключён. Напоминания о записях будут приходить сюда.');
      return;
    }

    const user = await this.prisma.user.findUnique({ where: { telegramId: BigInt(msg.from.id) } });
    if (user) await this.prisma.user.update({ where: { id: user.id }, data: { telegramChatId: chatId } });
    const text = uz
      ? 'Assalomu alaykum! BARBERFLOW orqali barberga yozilishingiz mumkin.'
      : 'Здравствуйте! Через BARBERFLOW можно записаться к барберу.';
    // web_app buttons require an https URL.
    const extra = this.appUrl.startsWith('https://')
      ? { reply_markup: { inline_keyboard: [[{ text: uz ? 'Yozilish' : 'Записаться', web_app: { url: `${this.appUrl}/tg` } }]] } }
      : {};
    await this.bot.sendMessage(chatId, text, extra);
  }
}
