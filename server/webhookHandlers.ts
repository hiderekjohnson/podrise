import { getStripeSync } from './stripeClient';
import { storage } from './storage';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '.'
      );
    }

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);

    let parsedEvent: any;
    try {
      parsedEvent = JSON.parse(payload.toString());
    } catch {
      return;
    }

    const eventType = parsedEvent?.type;
    const data = parsedEvent?.data?.object;

    if (!eventType || !data) return;

    try {
      switch (eventType) {
        case 'checkout.session.completed': {
          const customerId = data.customer;
          const subscriptionId = data.subscription;
          if (customerId && subscriptionId) {
            const user = await storage.getUserByStripeCustomerId(customerId);
            if (user) {
              await storage.updateUserStripeInfo(user.id, {
                stripeSubscriptionId: subscriptionId,
                plan: 'pro',
              });
              console.log(`User ${user.id} upgraded to pro via checkout`);
            }
          }
          break;
        }

        case 'customer.subscription.updated': {
          const customerId = data.customer;
          const status = data.status;
          const subscriptionId = data.id;
          if (customerId) {
            const user = await storage.getUserByStripeCustomerId(customerId);
            if (user) {
              if (status === 'active') {
                await storage.updateUserStripeInfo(user.id, {
                  stripeSubscriptionId: subscriptionId,
                  plan: 'pro',
                });
              } else if (status === 'canceled' || status === 'past_due' || status === 'unpaid') {
                await storage.updateUserStripeInfo(user.id, {
                  plan: 'free',
                });
                console.log(`User ${user.id} downgraded to free (status: ${status})`);
              }
            }
          }
          break;
        }

        case 'customer.subscription.deleted': {
          const customerId = data.customer;
          if (customerId) {
            const user = await storage.getUserByStripeCustomerId(customerId);
            if (user) {
              await storage.updateUserStripeInfo(user.id, {
                stripeSubscriptionId: undefined,
                plan: 'free',
              });
              console.log(`User ${user.id} subscription deleted, downgraded to free`);
            }
          }
          break;
        }
      }
    } catch (err) {
      console.error('Error handling webhook event:', eventType, err);
    }
  }
}
