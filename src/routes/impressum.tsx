import { Link, createFileRoute } from "@tanstack/react-router";
import { Mail, MapPin } from "lucide-react";
import { CONTACT, ContactEmail, LegalPage, LegalSection } from "@/components/legal-page";

export const Route = createFileRoute("/impressum")({
  head: () => ({ meta: [{ title: "Impressum · Furry Gallery" }] }),
  component: Impressum,
});

const SECTIONS = [
  { id: "anbieter", title: "Anbieter" },
  { id: "kontakt", title: "Kontakt" },
  { id: "verantwortlich", title: "Verantwortlich für den Inhalt" },
  { id: "jugendschutz", title: "Jugendschutz" },
  { id: "meldungen", title: "Inhalte melden" },
];

function Impressum() {
  return (
    <LegalPage
      title="Impressum"
      sections={SECTIONS}
      intro="Die Furry Gallery ist ein privates Community-Projekt für Furries."
    >
      <LegalSection id="anbieter" title="Angaben gemäß § 5 DDG">
        <div className="flex gap-3 rounded-2xl border border-border bg-bg-elevated p-4 text-fg">
          <MapPin className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
          <address className="not-italic">
            {CONTACT.name}
            <br />
            {CONTACT.city}
            <br />
            {CONTACT.country}
          </address>
        </div>
      </LegalSection>
      <LegalSection id="kontakt" title="Kontakt">
        <p className="flex items-center gap-2">
          <Mail className="size-4 shrink-0 text-fg-subtle" aria-hidden />
          <span>
            E-Mail: <ContactEmail />
          </span>
        </p>
        <p>
          Für Wünsche und Fehler auf der Seite gibt es außerdem die{" "}
          <Link to="/feedback" className="underline underline-offset-4 hover:text-fg">
            Feedback-Seite
          </Link>
          .
        </p>
      </LegalSection>
      <LegalSection id="verantwortlich" title="Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV">
        <p>{CONTACT.name}, Anschrift wie oben</p>
        <p>
          Bilder, Videos, Texte und Kommentare der Mitglieder stammen von den jeweiligen
          Mitgliedern.
        </p>
      </LegalSection>
      <LegalSection id="jugendschutz" title="Jugendschutz">
        <p>
          Bei der Anmeldung wird das Geburtsdatum abgefragt. FSK-18-Inhalte werden beim Hochladen
          automatisch erkannt und markiert. Scharf sehen sie nur Mitglieder ab 18, die über den
          Discord-Server der Community als volljährig verifiziert oder vom Team freigegeben wurden;
          alle anderen sehen sie unkenntlich, Mitglieder unter 18 gar nicht.
        </p>
        <p>
          Ansprechpartner für Jugendschutz: {CONTACT.name}, <ContactEmail />
        </p>
      </LegalSection>
      <LegalSection id="meldungen" title="Inhalte melden">
        <p>
          Rechtswidrige oder unpassende Inhalte kannst du direkt am Beitrag oder Profil über das
          ⋯-Menü und „Melden“ oder per E-Mail an <ContactEmail /> melden. Das Team sieht jede
          Meldung und kümmert sich darum.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
