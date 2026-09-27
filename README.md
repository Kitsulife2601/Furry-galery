# Furry Gallery

Furry-Community mit vertikalem Bilder-Feed (wie TikTok), Gallery, Personensuche, Profilen,
Uploads, Likes, Folgen und Meldungen. Nur für Erwachsene: Profile werden nur mit einem
Geburtsdatum angelegt, das 18+ ergibt.

**FSK-18-Bilder** sind für alle unkenntlich, die sich nicht in unserem Discord verifiziert
haben. Der Server schickt ihnen nur eine 16-Pixel-Vorschau, die verschwommen angezeigt wird —
das echte Bild verlässt den Server nie, es lässt sich also auch nicht per Browser „entblurren“.

Stack: TanStack Start (React 19, Router, Query), Tailwind v4, Better Auth, Postgres
(Neon in Produktion, eingebettetes PGLite lokal), Deployment auf Vercel.

## Loslegen

```sh
npm ci
npm run dev        # http://localhost:8080 — ohne DATABASE_URL läuft PGLite im Speicher
```

| Befehl              | Zweck                                                        |
| ------------------- | ------------------------------------------------------------ |
| `npm run build`     | Produktions-Build + Datenbank-Migrationen (mit DATABASE_URL) |
| `npm run typecheck` | TypeScript prüfen                                            |
| `npm run lint`      | ESLint                                                       |
| `npm test`          | Unit-Tests                                                   |

## Aufbau

```
migrations/            SQL-Schema, wird beim Build (Neon) bzw. Start (PGLite) angewendet
  0001_auth.sql        Better-Auth-Tabellen (nicht von Hand ändern)
  0002_schema.sql      profiles, posts, likes, follows + Beispieldaten
  0003_reports.sql     Meldungen zu Bildern
  0004_fsk18.sql       FSK-18-Markierung, Vorschaubild, Discord-Verknüpfung
public/seed/           Beispielbilder der Seed-Profile
src/routes/            Seiten (dateibasiertes Routing)
  __root.tsx           HTML-Gerüst, 18+-Abfrage, Provider
  login.tsx            Anmelden / Registrieren
  impressum.tsx        Impressum (Platzhalter ausfüllen!)
  datenschutz.tsx      Datenschutzerklärung (Vorlage)
  _app.tsx             App-Layout mit Navigation + Onboarding-Gate
  _app/index.tsx       „Für dich“-Feed
  _app/explore.tsx     Gallery + Profilliste
  _app/upload.tsx      Bild hochladen
  _app/profile.tsx     Eigenes Profil
  _app/u.$handle.tsx   Fremdes Profil
  _app/settings.tsx    Profil, Portrait, Hintergrund, FSK-18-Freischaltung, Abmelden
  api/discord/         Discord-Login (start.ts) und Rückkehr mit Rollenprüfung (callback.ts)
src/components/        UI-Bausteine (Feed-Karte, Grid, Viewer, Melden-Dialog, …)
src/lib/vela/          Fachlogik: Server-Funktionen, Typen, Alter, Hintergründe, Cache
  discord.ts           Discord-OAuth, Rollenprüfung und Nachprüfung per Bot
src/lib/auth/          Better Auth + Middleware (vorkonfiguriert)
src/lib/db.ts          Datenbankzugang (Neon oder PGLite)
```

Alle schreibenden Server-Funktionen in `src/lib/vela/server.ts` laufen über
`authMiddleware` und prüfen serverseitig, dass ein volljähriges Profil existiert.

## FSK 18 über Discord einrichten

Euer Discord-Bot verifiziert Mitglieder und gibt ihnen eine Rolle (z. B. „18+ verifiziert“).
Die Webseite prüft nur, ob jemand diese Rolle auf eurem Server hat.

1. Im [Discord Developer Portal](https://discord.com/developers/applications) die Anwendung
   des Bots öffnen (oder eine neue anlegen).
2. **OAuth2 → Redirects**: `https://DEINE-DOMAIN/api/discord/callback` eintragen.
3. **OAuth2**: Client ID und Client Secret kopieren.
4. In Discord den Entwicklermodus einschalten (Einstellungen → Erweitert), dann per
   Rechtsklick die **Server-ID** und die **Rollen-ID** der Verifiziert-Rolle kopieren.
5. Optional, empfohlen: Bot-Token (**Bot → Reset Token**) als `DISCORD_BOT_TOKEN`. Damit
   prüft die Seite alle 6 Stunden nach, ob die Rolle noch da ist — wird sie entzogen, sind
   die Bilder wieder gesperrt. Der Bot braucht dafür den **Server Members Intent**.
6. In Vercel unter **Settings → Environment Variables** eintragen und neu deployen:

| Variable                   | Inhalt                                                               |
| -------------------------- | -------------------------------------------------------------------- |
| `DISCORD_CLIENT_ID`        | Client ID der Anwendung                                              |
| `DISCORD_CLIENT_SECRET`    | Client Secret                                                        |
| `DISCORD_GUILD_ID`         | Server-ID eures Discords                                             |
| `DISCORD_VERIFIED_ROLE_ID` | ID der Rolle, die der Bot nach der Prüfung vergibt                   |
| `DISCORD_BOT_TOKEN`        | optional: Bot-Token für die Nachprüfung                              |
| `DISCORD_INVITE_URL`       | optional: Einladungslink, wird in den Einstellungen gezeigt          |
| `DISCORD_REDIRECT_URI`     | optional: nur nötig, wenn die Domain automatisch falsch erkannt wird |

**Tokens und Secrets niemals in den Code oder ins Repository schreiben** — nur in Vercel.

Ein Discord-Konto kann nur ein Profil freischalten. FSK-18-Bilder posten dürfen nur
verifizierte Mitglieder.

## Vor dem Livegang

- **Impressum und Datenschutz ausfüllen** — alle markierten `[Platzhalter]` in
  `src/routes/impressum.tsx` und `src/routes/datenschutz.tsx`.
- **Meldungen sichten**: Es gibt noch keine Admin-Oberfläche. Meldungen liegen in der
  Tabelle `reports`, z. B.
  `select r.*, p.image_url from reports r join posts p on p.id = r.post_id order by r.created_at desc;`
- Google Fonts werden extern geladen (IP-Übertragung an Google). Wer das vermeiden will,
  hostet die Schriften selbst.
- Bilder werden als Data-URL direkt in der Datenbank gespeichert. Das reicht für den Start;
  bei vielen Nutzer*innen lohnt sich ein Objektspeicher (z. B. Vercel Blob, S3).
