/**
 * Extension point for online payment providers (Payme, Click, Uzum …).
 *
 * NOT IMPLEMENTED in the MVP. Payments are recorded and confirmed manually by a platform admin
 * (see PlatformAdminController). A provider module must:
 *   1. create an invoice/checkout for a Payment row in PENDING state (providerPaymentId stored),
 *   2. verify the provider's webhook signature server-side,
 *   3. call SubscriptionBillingService.confirmPayment() only for a verified, captured transaction.
 * Nothing in the codebase marks a subscription paid without a confirmed Payment.
 */
export interface PaymentProvider {
  readonly code: 'PAYME' | 'CLICK';
  createCheckout(input: { paymentId: string; amountUzs: number; description: string }): Promise<{ redirectUrl: string; providerPaymentId: string }>;
  verifyWebhook(headers: Record<string, string | string[] | undefined>, rawBody: Buffer): Promise<{ providerPaymentId: string; captured: boolean } | null>;
}
