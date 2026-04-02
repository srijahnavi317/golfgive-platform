export default function handler(req, res) {
  const { email, password } = req.body;

  if (email === "james@example.com" && password === "password123") {
    return res.status(200).json({ success: true });
  }

  return res.status(401).json({ error: "Invalid credentials" });
}