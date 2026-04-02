import Stripe from "stripe";
import { buffer } from "micro";
import StripeWebhooks from "../js/stripe-webhooks.js";;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
      console.log("Secret key exists:", !!process.env.STRIPE_SECRET_KEY); 
     const sig = req.headers["stripe-signature"];
     const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    const buf = await buffer(req);

    event = stripe.webhooks.constructEvent(
      buf,
      sig,
      endpointSecret
    );
  } catch (err) {
    console.error("❌ Signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    const result = await StripeWebhooks.processEvent(
      event.type,
      event.data.object,
      event.id
    );

    return res.status(200).json({ success: true, result });
  } catch (err) {
    console.error("❌ Processing failed:", err);
    return res.status(500).json({ error: "Webhook failed" });
  }
}