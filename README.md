# VELA — 18+ Photo-Gallery

Vertikaler Bilder-Feed (wie TikTok), Gallery, Profile mit Alter und Beziehungsstatus,
Uploads, Likes, Folgen und Meldungen. Nur für Erwachsene: Profile werden nur mit einem
Geburtsdatum angelegt, das 18+ ergibt.

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
  _app/settings.tsx    Profil, Portrait, Hintergrund, Abmelden
src/components/        UI-Bausteine (Feed-Karte, Grid, Viewer, Melden-Dialog, …)
src/lib/vela/          Fachlogik: Server-Funktionen, Typen, Alter, Hintergründe, Cache
src/lib/auth/          Better Auth + Middleware (vorkonfiguriert)
src/lib/db.ts          Datenbankzugang (Neon oder PGLite)
```

Alle schreibenden Server-Funktionen in `src/lib/vela/server.ts` laufen über
`authMiddleware` und prüfen serverseitig, dass ein volljähriges Profil existiert.

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
