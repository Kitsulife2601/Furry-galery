import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, Placeholder } from "@/components/legal-page";

export const Route = createFileRoute("/impressum")({
  head: () => ({ meta: [{ title: "Impressum · VELA" }] }),
  component: Impressum,
});

function Impressum() {
  return (
    <LegalPage title="Impressum">
      <section>
        <h2 className="text-base font-medium text-fg">Angaben gemäß § 5 DDG</h2>
        <p className="mt-2">
          <Placeholder>Vor- und Nachname / Firma</Placeholder>
          <br />
          <Placeholder>Straße und Hausnummer</Placeholder>
          <br />
          <Placeholder>PLZ Ort</Placeholder>
          <br />
          <Placeholder>Land</Placeholder>
        </p>
      </section>
      <section>
        <h2 className="text-base font-medium text-fg">Kontakt</h2>
        <p className="mt-2">
          E-Mail: <Placeholder>kontakt@example.com</Placeholder>
          <br />
          Telefon: <Placeholder>optional</Placeholder>
        </p>
      </section>
      <section>
        <h2 className="text-base font-medium text-fg">
          Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV
        </h2>
        <p className="mt-2">
          <Placeholder>Name, Anschrift wie oben</Placeholder>
        </p>
      </section>
      <section>
        <h2 className="text-base font-medium text-fg">Jugendschutz</h2>
        <p className="mt-2">
          VELA richtet sich ausschließlich an Personen ab 18 Jahren. Profile werden nur nach Angabe
          eines Geburtsdatums angelegt, das die Volljährigkeit ergibt. Jugendschutzbeauftragte*r:{" "}
          <Placeholder>Name und E-Mail</Placeholder>
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
