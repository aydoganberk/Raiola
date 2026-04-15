export async function postStripeWebhook(request, stripe) {
  const signature = request.headers.get('stripe-signature');
  const event = stripe.webhooks.constructEvent('body', signature, 'whsec_demo');
  return { event, idempotencyKey: 'evt_123' };
}
