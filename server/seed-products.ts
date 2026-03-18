import { getUncachableStripeClient } from "./stripeClient";

async function createProducts() {
  const stripe = await getUncachableStripeClient();

  const existingProducts = await stripe.products.search({ query: "name:'PodRise Pro'" });
  if (existingProducts.data.length > 0) {
    console.log("PodRise Pro product already exists:", existingProducts.data[0].id);
    const prices = await stripe.prices.list({ product: existingProducts.data[0].id, active: true });
    console.log("Existing prices:", prices.data.map(p => `${p.id} - $${(p.unit_amount || 0) / 100}/${p.recurring?.interval}`));
    return;
  }

  const product = await stripe.products.create({
    name: "PodRise Pro",
    description: "Unlimited podcast summaries delivered daily to your inbox.",
    metadata: {
      plan: "pro",
    },
  });
  console.log("Created product:", product.id);

  const monthlyPrice = await stripe.prices.create({
    product: product.id,
    unit_amount: 999,
    currency: "usd",
    recurring: { interval: "month" },
  });
  console.log("Created monthly price:", monthlyPrice.id, "- $9.99/month");
}

createProducts()
  .then(() => {
    console.log("Done!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Failed:", err);
    process.exit(1);
  });
