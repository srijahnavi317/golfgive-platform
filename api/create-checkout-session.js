import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { planType, userId, email } = req.body;

    // 👇 Replace with YOUR real price IDs
    const prices = {
      monthly: "prod_UFxCJ9BZNqwK7a",
      yearly: "prod_UFxDvUut81ijK8"
    };

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [
        {
          price: prices[planType],
          quantity: 1
        }
      ],
      success_url: `https://golfgive-platform.vercel.app/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://golfgive-platform.vercel.app/cancel.html`,
      customer_email: email,
      metadata: {
        userId: userId,
        planType: planType
      }
    });

    res.status(200).json({ sessionId: session.id });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}