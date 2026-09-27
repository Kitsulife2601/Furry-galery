import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, Placeholder } from "@/components/legal-page";

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
          <Placeholder>Name, Anschrift, E-Mail — wie im Impressum</Placeholder>
        </p>
      </section>
      <section>
        <h2 className="text-base font-medium text-fg">Welche Daten wir verarbeiten</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <strong className="text-fg">Konto:</strong> E-Mail-Adresse, Name und Passwort-Hash bzw.
            die Kennung deines Google- oder X-Kontos, wenn du dich darüber anmeldest.
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
            <strong className="text-fg">Im Browser:</strong> ein Sitzungs-Cookie für die Anmeldung
            und ein Eintrag im lokalen Speicher, dass du die 18+-Abfrage bestätigt hast.
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
          <li>
            Hosting: <Placeholder>z. B. Vercel Inc., USA</Placeholder>
          </li>
          <li>
            Datenbank: <Placeholder>z. B. Neon Inc., USA / Region</Placeholder>
          </li>
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
          schreib an <Placeholder>kontakt@example.com</Placeholder>.
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
