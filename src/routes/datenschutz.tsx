import { createFileRoute } from "@tanstack/react-router";
import { CONTACT, ContactEmail, LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/datenschutz")({
  head: () => ({ meta: [{ title: "Datenschutz · Furry Gallery" }] }),
  component: Datenschutz,
});

function Datenschutz() {
  return (
    <LegalPage title="Datenschutz">
      <p>
        Vorlage — bitte vor dem Livegang prüfen und an deinen tatsächlichen Betrieb anpassen. Dies
        ist keine Rechtsberatung.
      </p>
      <section>
        <h2 className="text-base font-medium text-fg">Verantwortliche Stelle</h2>
        <p className="mt-2">
          {CONTACT.name}, {CONTACT.city}, {CONTACT.country}
          <br />
          E-Mail: <ContactEmail />
        </p>
      </section>
      <section>
        <h2 className="text-base font-medium text-fg">Welche Daten wir verarbeiten</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <strong className="text-fg">Konto:</strong> E-Mail-Adresse, Name und Passwort-Hash bzw.
            die Kennung deines Google- oder Discord-Kontos, wenn du dich darüber anmeldest.
          </li>
          <li>
            <strong className="text-fg">Profil:</strong> Anzeigename, Handle, Bio, Beziehungsstatus,
            Portrait, gewählter Hintergrund und dein Geburtsdatum. Andere sehen nur dein Alter,
            nicht das Datum.
          </li>
          <li>
            <strong className="text-fg">Inhalte:</strong> hochgeladene Bilder mit Caption, Likes,
            gefolgte Profile und Meldungen, die du abgibst.
          </li>
          <li>
            <strong className="text-fg">Im Browser:</strong> ein Sitzungs-Cookie für die Anmeldung.
          </li>
        </ul>
        <p className="mt-2">
          Rechtsgrundlage ist die Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO). Bilder und
          Profilangaben sind für alle Besucher*innen sichtbar.
        </p>
      </section>
      <section>
        <h2 className="text-base font-medium text-fg">Dienstleister</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Hosting: Vercel Inc., USA</li>
          <li>Datenbank: Neon Inc., USA</li>
          <li>
            Schriftarten werden von Google Fonts (Google Ireland Ltd.) geladen; dabei wird deine
            IP-Adresse an Google übertragen.
          </li>
        </ul>
      </section>
      <section>
        <h2 className="text-base font-medium text-fg">Speicherdauer und Löschung</h2>
        <p className="mt-2">
          Eigene Bilder kannst du jederzeit selbst löschen. Für die Löschung deines gesamten Kontos
          schreib an <ContactEmail />.
        </p>
      </section>
      <section>
        <h2 className="text-base font-medium text-fg">Deine Rechte</h2>
        <p className="mt-2">
          Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung,
          Datenübertragbarkeit und Widerspruch sowie auf Beschwerde bei einer
          Datenschutz-Aufsichtsbehörde.
        </p>
      </section>
    </LegalPage>
  );
}
