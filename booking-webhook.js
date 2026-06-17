// /api/booking-webhook — chamado pelo Zapier a cada reserva criada/atualizada
// no BookingKoala. Grava (ou sobrescreve) o documento dessa reserva no
// Firestore, usando o Booking ID como identificador único — então uma
// reserva que muda de status (ex: upcoming -> charged) sobrescreve o
// registro anterior em vez de criar um duplicado.
//
// Espera um corpo JSON tipo:
// {
//   "bookingId": "5800",
//   "date": "6/13/2026",
//   "fullName": "Chris Playton",
//   "location": "cincinnati and northern kentucky",
//   "finalAmount": 620,
//   "tip": 0,
//   "status": "charged",
//   "service": "Move In/Move Out"
// }

const FIRESTORE_PROJECT_ID = "daily-reports-ssc";
const FIRESTORE_APP_ID = "simply-spotless-production";

function clean(v) {
  if (v === undefined || v === null) return 0;
  const n = parseFloat(String(v).replace(/[$,]/g, ""));
  return isNaN(n) ? 0 : n;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }
  try {
    const body = req.body || {};
    const bookingId = String(
      body.bookingId || body.booking_id || body["Booking ID"] || body["Booking id"] || ""
    ).trim();

    if (!bookingId) {
      res.status(400).json({ error: "Faltou bookingId no corpo da requisição" });
      return;
    }

    const fields = {
      date: { stringValue: String(body.date || body.Date || "") },
      fullName: { stringValue: String(body.fullName || body.full_name || body["Full name"] || "") },
      location: { stringValue: String(body.location || body.Location || "") },
      finalAmount: { doubleValue: clean(body.finalAmount ?? body.final_amount ?? body["Final amount"]) },
      tip: { doubleValue: clean(body.tip ?? body.Tip) },
      status: { stringValue: String(body.status || body.booking_status || body["Booking status"] || "") },
      service: { stringValue: String(body.service || body.Service || "") },
      updatedAt: { stringValue: new Date().toISOString() },
    };

    const path = `artifacts/${FIRESTORE_APP_ID}/public/data/bookings/${encodeURIComponent(bookingId)}`;
    const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/${path}`;

    const fsRes = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    });

    if (!fsRes.ok) {
      const errText = await fsRes.text();
      res.status(502).json({ error: "Firestore rejeitou a escrita", details: errText });
      return;
    }

    res.status(200).json({ ok: true, bookingId });
  } catch (err) {
    res.status(500).json({ error: "Erro inesperado: " + (err && err.message) });
  }
};
