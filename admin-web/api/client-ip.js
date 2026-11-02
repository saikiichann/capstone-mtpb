// GET /api/client-ip → { "ip": "203.0.113.7" }
//
// The admin's Session Monitor and Audit Log show the IP address a staff
// member signed in from. A browser can't see its own public IP, so the
// dashboard asks this Vercel function, which reads it from the request.
// Vercel sets x-forwarded-for / x-real-ip to the visitor's address.
// Nothing is stored here; the dashboard saves it on the session record.

export default function handler(req, res) {
  const forwarded = String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim();
  const real = String(req.headers["x-real-ip"] ?? "").trim();
  const ip = forwarded || real || req.socket?.remoteAddress || "";

  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(200).send(JSON.stringify({ ip: /^[0-9a-fA-F:.]{3,45}$/.test(ip) ? ip : "" }));
}
