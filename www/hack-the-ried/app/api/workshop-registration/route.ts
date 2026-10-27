import { NextResponse } from "next/server";
import { z } from "zod";

const registrationSchema = z.object({
  email: z.string().email("Bitte eine gültige E-Mail-Adresse eingeben."),
  name: z.string().max(100).optional(),
  location: z.string().max(100).optional(),
  interest: z.string().max(200).optional(),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const result = registrationSchema.safeParse(json);

    if (!result.success) {
      const errorMessage =
        result.error.issues[0]?.message || "Ungültige Eingabedaten.";
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    const { email, name, location, interest } = result.data;
    const recipientName = name?.trim() || "Sensor-Begeisterte/r";

    const resendApiKey = process.env.RESEND_API_KEY;

    if (resendApiKey) {
      try {
        const fromSender =
          process.env.RESEND_FROM_EMAIL ||
          "HackTheRied <onboarding@resend.dev>";

        const emailContent = `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <title>Anmeldung zum Sensor-Bau-Workshop</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #020617; color: #f8fafc; padding: 24px; line-height: 1.6;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 16px; padding: 32px;">
    <div style="display: inline-block; padding: 4px 12px; background-color: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 9999px; color: #34d399; font-size: 12px; font-weight: bold; text-transform: uppercase; margin-bottom: 16px;">
      HackTheRied · Bürgerforschung
    </div>
    <h1 style="color: #f1f5f9; font-size: 24px; margin-top: 0; margin-bottom: 16px;">
      Vielen Dank für dein Interesse, ${recipientName}!
    </h1>
    <p style="color: #cbd5e1; font-size: 15px; margin-bottom: 20px;">
      Wir haben deine Vormerkung für den nächsten <strong>Sensor-Bau-Workshop</strong> im <strong>Kulturzentrum KAMÜ</strong> in Bürstadt erfolgreich registriert.
    </p>

    <div style="background-color: #020617; border: 1px solid #1e293b; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
      <h3 style="color: #34d399; font-size: 14px; margin-top: 0; margin-bottom: 8px;">Deine hinterlegten Angaben:</h3>
      <p style="font-size: 13px; color: #94a3b8; margin: 4px 0;"><strong>E-Mail:</strong> ${email}</p>
      ${location ? `<p style="font-size: 13px; color: #94a3b8; margin: 4px 0;"><strong>Ortsteil / Region:</strong> ${location}</p>` : ""}
      ${interest ? `<p style="font-size: 13px; color: #94a3b8; margin: 4px 0;"><strong>Schwerpunkt:</strong> ${interest}</p>` : ""}
    </div>

    <h2 style="color: #f1f5f9; font-size: 16px; margin-top: 24px; margin-bottom: 8px;">
      Wie geht es weiter?
    </h2>
    <p style="color: #94a3b8; font-size: 14px; margin-bottom: 16px;">
      Sobald die Sammelbestellung der Bausätze (RAK3113 LoRaWAN-Modul, Sensoren für Feinstaub, CO₂, UV, Lärm und Klima) abgeschlossen ist und der konkrete Workshop-Termin feststeht, erhältst du von uns eine E-Mail mit allen Details zur Anmeldung.
    </p>

    <p style="color: #94a3b8; font-size: 14px; margin-bottom: 24px;">
      Bis dahin kannst du dir auf unserer Website schon die vollständige 
      <a href="https://hack-the-ried.de/sensor-bauen" style="color: #34d399; text-decoration: underline;">Stückliste und Bauanleitung</a> ansehen.
    </p>

    <div style="border-top: 1px solid #1e293b; padding-top: 20px; font-size: 12px; color: #64748b;">
      <p style="margin: 0;">HackTheRied – Eine Bürgerinitiative in Kooperation mit dem Kulturzentrum KAMÜ Bürstadt.</p>
      <p style="margin: 4px 0 0 0;"><a href="https://kamue.me" style="color: #34d399; text-decoration: none;">kamue.me</a> · <a href="https://hack-the-ried.de" style="color: #34d399; text-decoration: none;">hack-the-ried.de</a></p>
    </div>
  </div>
</body>
</html>
        `;

        const resendResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromSender,
            to: [email],
            subject: "Deine Vormerkung zum Sensor-Bau-Workshop – HackTheRied",
            html: emailContent,
          }),
        });

        if (!resendResponse.ok) {
          const errText = await resendResponse.text();
          console.error("Resend API error:", errText);
        }
      } catch (err) {
        console.error("Error sending email via Resend:", err);
      }
    } else {
      console.log(
        "RESEND_API_KEY is not set yet. Registration recorded:",
        { email, name, location, interest, timestamp: new Date().toISOString() }
      );
    }

    return NextResponse.json({
      success: true,
      message:
        "Vielen Dank! Deine E-Mail wurde erfolgreich vorgemerkt. Sobald der nächste Termin im Kulturzentrum KAMÜ feststeht, informieren wir dich direkt.",
    });
  } catch (error) {
    console.error("Workshop registration error:", error);
    return NextResponse.json(
      { error: "Registrierung fehlgeschlagen. Bitte versuche es später erneut." },
      { status: 500 }
    );
  }
}
