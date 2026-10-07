import { createFileRoute } from "@tanstack/react-router";
import { CONTACT, ContactEmail, LegalList, LegalPage, LegalSection } from "@/components/legal-page";

export const Route = createFileRoute("/datenschutz")({
  head: () => ({ meta: [{ title: "Datenschutz · Furry Gallery" }] }),
  component: Datenschutz,
});

const SECTIONS = [
  { id: "verantwortlich", title: "Verantwortlich" },
  { id: "daten", title: "Welche Daten wir speichern" },
  { id: "sichtbar", title: "Was andere sehen" },
  { id: "discord", title: "Discord" },
  { id: "browser", title: "Cookies & Browser-Speicher" },
  { id: "dienstleister", title: "Dienstleister" },
  { id: "zweck", title: "Zweck und Rechtsgrundlage" },
  { id: "dauer", title: "Speicherdauer und Löschung" },
  { id: "rechte", title: "Deine Rechte" },
];

const code = "rounded bg-bg-subtle px-1 py-0.5 font-mono text-[0.85em] text-fg";

function Datenschutz() {
  return (
    <LegalPage
      title="Datenschutz"
      sections={SECTIONS}
      intro="Hier steht in einfachen Worten, welche Daten die Furry Gallery speichert, wofür und wo."
    >
      <LegalSection id="verantwortlich" title="Verantwortlich">
        <p>
          {CONTACT.name}, {CONTACT.city}, {CONTACT.country}
          <br />
          E-Mail: <ContactEmail />
        </p>
      </LegalSection>

      <LegalSection id="daten" title="Welche Daten wir speichern">
        <LegalList
          items={[
            {
              term: "Konto",
              text: "E-Mail-Adresse, Name und Passwort (nur als Hash) – oder, wenn du dich mit Google oder Discord anmeldest, die Kennung dieses Kontos samt Anmelde-Tokens. Zu jeder Anmeldung speichern wir eine Sitzung mit IP-Adresse und Browser-Kennung (User-Agent).",
            },
            {
              term: "Profil",
              text: "Anzeigename, Handle, Bio, Beziehungsstatus, Geburtsdatum, Profilbild, Banner, Hintergrund, Interessen sowie gewählte Rahmen, Effekte und Namensstile.",
            },
            {
              term: "Beiträge",
              text: "Hochgeladene Bilder und Videos mit Beschreibung, Hashtags und der FSK-18-Markierung. Die Erkennung von FSK-18-Inhalten läuft in deinem Browser und auf unserem Server – ohne externen Dienst.",
            },
            {
              term: "Aktivität",
              text: "Likes, Kommentare und Kommentar-Likes, wem du folgst, welche Beiträge du dir angesehen hast (und wie oft), „Interessiert / Nicht interessiert“, deine Mitteilungen, die Tage, an denen du aktiv warst (für Belohnungen und Serien), deine Pfoten, Shop-Käufe und die tägliche Tagespfote.",
            },
            {
              term: "Feedback",
              text: "Meldungen, die du abgibst (mit Grund und Notiz), Feedback-Nachrichten, deine Sterne-Bewertung der Seite und wann du die letzten Updates gesehen hast.",
            },
            {
              term: "Moderation",
              text: "Bei Sperren: Zeitpunkt, Dauer und Grund; bei geplanter Löschung das Datum; FSK-18-Freigaben mit Zeitpunkt und wer sie erteilt hat.",
            },
          ]}
        />
      </LegalSection>

      <LegalSection id="sichtbar" title="Was andere sehen">
        <p>
          Dein Profil, deine Beiträge, Kommentare und Likes-Zahlen sind für andere Besucher*innen
          sichtbar. Von deinem Geburtsdatum sehen andere nur dein Alter. Wer welchen Beitrag
          angesehen hat, sieht niemand – bei deinen eigenen Beiträgen siehst du nur Zahlen (Aufrufe,
          Zuschauer*innen), keine Namen.
        </p>
      </LegalSection>

      <LegalSection id="discord" title="Discord">
        <p>
          Wenn du dein Discord-Konto verknüpfst, speichern wir deine Discord-ID, deinen
          Discord-Namen und den Zeitpunkt der Verifizierung. Wir lesen damit nur, ob du auf dem
          Community-Server die Rolle „volljährig verifiziert“ hast; ein Bot prüft das regelmäßig
          erneut, damit eine entzogene Rolle auch hier wirkt.
        </p>
        <p>
          Meldungen (mit dem gemeldeten Bild, dem Handle der meldenden und der gemeldeten Person und
          dem Grund) sowie Feedback (Text und Handle) werden in einen Team-Kanal auf Discord
          geschickt. Updates des Teams werden in einem öffentlichen Kanal gepostet.
        </p>
      </LegalSection>

      <LegalSection id="browser" title="Cookies & Browser-Speicher">
        <p>Wir setzen keine Werbe- oder Analyse-Cookies. Gespeichert werden nur:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Sitzungs-Cookies für die Anmeldung (inkl. eines kurzlebigen Zwischenspeichers der
            Sitzung).
          </li>
          <li>
            Ein kurzlebiges Cookie <span className={code}>vela_discord_state</span>, solange du
            Discord verknüpfst.
          </li>
          <li>
            Im Local Storage: <span className={code}>fg-last-seen</span> (wann du zuletzt im Feed
            warst, für den Hinweis „Neu seit deinem letzten Besuch“) und für Team-Mitglieder{" "}
            <span className={code}>fg-admin-tab</span> (zuletzt geöffneter Moderations-Bereich).
          </li>
          <li>
            Im Session Storage: <span className={code}>fg-stale-reload-at</span> (lädt die Seite
            nach einem Update einmal neu) und – nur in der Vorschau – ein Anmelde-Token.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="dienstleister" title="Dienstleister">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-fg">Vercel Inc., USA</strong> – Hosting der Webseite; Videos
            liegen im Speicher „Vercel Blob“.
          </li>
          <li>
            <strong className="text-fg">Neon Inc., USA</strong> – Datenbank für Konto, Profil,
            Bilder und alle anderen oben genannten Daten.
          </li>
          <li>
            <strong className="text-fg">Discord Inc., USA</strong> – Anmeldung und Verifizierung
            (wenn du sie nutzt) sowie Meldungen, Feedback und Updates wie oben beschrieben.
          </li>
          <li>
            <strong className="text-fg">Google</strong> – Anmeldung mit Google (wenn du sie nutzt);
            Schriftarten werden von Google Fonts geladen, dabei wird deine IP-Adresse an Google
            übertragen.
          </li>
          <li>
            <strong className="text-fg">xAI (grok.com)</strong> – ein kleines Skript für den Hinweis
            „Created with Grok“ wird von grok.com geladen; dabei wird deine IP-Adresse übertragen.
          </li>
        </ul>
        <p>Bei diesen Anbietern können Daten auch in den USA verarbeitet werden.</p>
      </LegalSection>

      <LegalSection id="zweck" title="Zweck und Rechtsgrundlage">
        <p>
          Wir verarbeiten deine Daten, um dir die Furry Gallery mit Konto, Profil und Beiträgen
          bereitzustellen (Art. 6 Abs. 1 lit. b DSGVO). Moderation, Jugendschutz, die
          Discord-Benachrichtigungen ans Team und die Sicherheit der Seite beruhen auf unserem
          berechtigten Interesse an einer sicheren Community (Art. 6 Abs. 1 lit. f DSGVO).
        </p>
      </LegalSection>

      <LegalSection id="dauer" title="Speicherdauer und Löschung">
        <p>
          Wir speichern deine Daten, solange dein Konto besteht. Eigene Beiträge kannst du jederzeit
          selbst löschen. Für die Löschung deines gesamten Kontos schreib an <ContactEmail />.
          Sitzungen laufen von selbst ab.
        </p>
      </LegalSection>

      <LegalSection id="rechte" title="Deine Rechte">
        <p>
          Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung,
          Datenübertragbarkeit und Widerspruch. Schreib dafür einfach an <ContactEmail />.
        </p>
        <p>
          Außerdem kannst du dich bei einer Datenschutz-Aufsichtsbehörde beschweren, zum Beispiel
          bei der Landesbeauftragten für den Datenschutz Niedersachsen.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
