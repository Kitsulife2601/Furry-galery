import { createFileRoute } from "@tanstack/react-router";
import { CONTACT, ContactEmail, LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/impressum")({
  head: () => ({ meta: [{ title: "Impressum · Furry Gallery" }] }),
  component: Impressum,
});

function Impressum() {
  return (
    <LegalPage title="Impressum">
      <section>
        <h2 className="text-base font-medium text-fg">Angaben gemäß § 5 DDG</h2>
        <p className="mt-2">
          {CONTACT.name}
          <br />
          {CONTACT.city}
          <br />
          {CONTACT.country}
        </p>
      </section>
      <section>
        <h2 className="text-base font-medium text-fg">Kontakt</h2>
        <p className="mt-2">
          E-Mail: <ContactEmail />
        </p>
      </section>
      <section>
        <h2 className="text-base font-medium text-fg">
          Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV
        </h2>
        <p className="mt-2">{CONTACT.name}, Anschrift wie oben</p>
      </section>
      <section>
        <h2 className="text-base font-medium text-fg">Jugendschutz</h2>
        <p className="mt-2">
          Profile werden nur nach Angabe eines Geburtsdatums angelegt, das die Volljährigkeit
          ergibt. FSK-18-Inhalte werden automatisch erkannt und sind nur für Mitglieder sichtbar,
          die sich über Discord als volljährig verifiziert haben; alle anderen sehen sie
          unkenntlich. Ansprechpartner für Jugendschutz: {CONTACT.name}, <ContactEmail />
        </p>
      </section>
      <section>
        <h2 className="text-base font-medium text-fg">Meldung von Inhalten</h2>
        <p className="mt-2">
          Rechtswidrige Inhalte kannst du direkt am Bild über „Melden“ oder per E-Mail an die oben
          genannte Adresse melden. Wir prüfen jede Meldung zeitnah.
        </p>
      </section>
    </LegalPage>
  );
}
