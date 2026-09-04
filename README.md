# Alte Schraubenfabrik Hagen – Audioguide

Web-App für Besucher (QR-Code scannen → Stationstext & Audioguide) mit
echtem Admin-Bereich (Login, Stationen bearbeiten, Bilder/Audio hochladen,
druckfertige QR-Codes exportieren).

Die App selbst ist reines HTML/CSS/JavaScript ohne Build-Schritt — sie
läuft in jedem Ordner auf jedem Webserver. Als Backend wird
[Supabase](https://supabase.com) genutzt (kostenloser Tarif reicht):
Datenbank, Admin-Login und Datei-Speicher für Bilder/Audiodateien.

## Einrichtung

### 1. Supabase-Projekt anlegen

1. Kostenlosen Account auf [supabase.com](https://supabase.com) anlegen, neues Projekt erstellen.
2. Im Projekt unter **SQL Editor** die Datei [`supabase/schema.sql`](supabase/schema.sql) komplett einfügen und ausführen ("Run"). Das legt Tabellen, Sicherheitsregeln und den Speicher-Bucket an.
3. Unter **Project Settings → API** die **Project URL** und den **anon public key** kopieren.
4. Diese beiden Werte in [`src/config.js`](src/config.js) eintragen (`SUPABASE_URL`, `SUPABASE_ANON_KEY`). Diese Werte sind bewusst öffentlich nutzbar — Zugriffsschutz passiert über die Sicherheitsregeln in der Datenbank, nicht über Geheimhaltung des Keys.
5. In derselben Datei `SITE_URL` auf die spätere Subdomain setzen, z.B. `https://audioguide.ihre-domain.de` (ohne Slash am Ende). Dieser Wert wird für die QR-Codes gebraucht.

### 2. Inhalte der 8 Stationen einspielen

Die Original-Inhalte (Texte, Bilder) aus dem Entwurf liegen bereits fertig
vorbereitet in diesem Repo (`assets/images/…`, `scripts/seed.mjs`).

```bash
npm install
cp .env.example .env
# .env öffnen und SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY eintragen
# (Service-Role-Key: Project Settings -> API -> service_role, NICHT der anon key!)
npm run seed
```

Das Skript lädt die 8 Stationsbilder und 6 "Gebäude heute"-Fotos in den
Supabase-Storage-Bucket und legt die Stationen in der Datenbank an.
Es ist nur für den **einmaligen** Erststart gedacht.

⚠️ Der `service_role`-Key aus `.env` hat vollen Datenbankzugriff — er
gehört **nur** in diese lokale `.env`-Datei (steht in `.gitignore`) und
niemals in den Frontend-Code oder ein öffentliches Repo.

### 3. Admin-Zugang anlegen

Im Supabase-Dashboard unter **Authentication → Users → Add user**:
E-Mail-Adresse und Passwort für den/die Admin vergeben (z.B. Ihre eigene
E-Mail-Adresse). Häkchen bei "Auto Confirm User" setzen, damit kein
Bestätigungs-Mail-Versand nötig ist. Fertig — mit diesen Zugangsdaten kann
man sich im Admin-Bereich der App anmelden. Weitere Admin-Nutzer können
genauso angelegt werden.

### 4. Lokal testen

Da die App keinen Build-Schritt braucht, reicht ein einfacher lokaler
Webserver (nötig wegen ES-Modulen — direktes Öffnen der `index.html` per
Doppelklick funktioniert nicht):

```bash
npx serve .
# oder: python3 -m http.server 8080
```

Danach im Browser `http://localhost:3000` (bzw. `:8080`) öffnen.

## Admin-Bereich erreichen

Zwei Wege, wie im ursprünglichen Entwurf:

- **Versteckt in der App:** Auf der Startseite 5× schnell auf den kleinen
  Text „Funcke & Hueck" unter dem Titel tippen.
- **Direkt per Adresse:** `https://ihre-domain.de/#admin` aufrufen.

Anmelden mit der unter Schritt 3 angelegten E-Mail-Adresse und Passwort.

## Deployment auf Ihre Subdomain

Die App besteht nur aus statischen Dateien (`index.html`, `src/`,
`assets/`) — sie lässt sich auf jeden Webspace oder Static-Hosting-Dienst
hochladen:

1. **Einfachster Weg (empfohlen, kostenlos):** Repo mit
   [Netlify](https://netlify.com) oder [Vercel](https://vercel.com)
   verbinden, kein Build-Command nötig ("Publish directory" = Projekt-
   Wurzelverzeichnis). Anschließend im jeweiligen Dashboard Ihre eigene
   Subdomain als "Custom Domain" hinterlegen und beim Domain-Anbieter
   einen CNAME-Eintrag auf die von Netlify/Vercel angezeigte Adresse
   setzen.
2. **Eigener Webspace:** Alle Dateien aus diesem Ordner (außer
   `scripts/`, `.env`, `node_modules/`) per FTP/SFTP in das
   Subdomain-Verzeichnis hochladen.

Wichtig: `SITE_URL` in `src/config.js` **vor** dem Erzeugen der QR-Codes
auf die tatsächliche Subdomain setzen, da die QR-Codes genau diese
Adresse einkodieren.

## Was in dieser Version "echt" funktioniert (im Unterschied zum ersten Entwurf)

Der ursprüngliche Entwurf war eine reine Bildschirm-Simulation ohne
Backend. Diese Version macht daraus eine funktionierende App:

- **Login ist echt:** Supabase-Auth statt eines im Code sichtbaren
  Passworts (`Sonnenblume123#` im alten Entwurf).
- **Daten bleiben erhalten:** Stationen, Texte, Bilder, Audiodateien
  liegen in einer echten Datenbank/Storage statt nur im Arbeitsspeicher
  des Browsers.
- **QR-Codes sind echte, scanbare QR-Codes** (der Entwurf erzeugte nur
  ein zufälliges Pixelmuster, das keinerlei Daten enthielt) und
  verlinken direkt auf die jeweilige Station.
- **QR-Export als PNG/SVG/JPG/PDF/ZIP** lädt wirklich herunter.
- **Kamera-Scanner** erkennt echte QR-Codes (über die Browser-eigene
  `BarcodeDetector`-API, mit automatischem Fallback auf die Bibliothek
  jsQR in Browsern ohne diese API, z.B. ältere iOS-Versionen).
- **Bild-/Audio-Uploads** landen wirklich im Speicher und werden
  Besuchern ausgespielt.
- **Direktlinks funktionieren:** Ein gescannter oder aufgerufener Link
  wie `.../#/s/gruendung-1844-dampfmaschine` öffnet sofort die richtige
  Station, auch aus der normalen Handy-Kamera-App heraus (kein
  Öffnen der Scanner-Funktion in der App nötig).
- **Neue Stationen anlegen** funktioniert (im Entwurf führte der
  "Neue Station"-Knopf ins Leere).

### Bewusste kleine Abweichung vom Entwurf

Im Entwurf gab es ein Mehrfach-Bild-Upload-Feld ("Bilder") im
Bearbeiten-Formular, das aber mit keiner sichtbaren Stelle der App
verbunden war (eine Design-Lücke des Entwurfs). Da jede Station im
Datenmodell genau ein Hauptbild hat, wurde daraus ein einzelnes,
funktionierendes Bild-Upload-Feld. Die globale Bilderstrecke „Das
Gebäude heute" (gleiche Fotos auf jeder Stationsseite) bleibt wie im
Entwurf – sie wird einmalig über `scripts/seed.mjs` befüllt und ist
aktuell nicht über die Admin-Oberfläche editierbar (das war im Entwurf
ebenfalls nicht vorgesehen).

## Projektstruktur

```
index.html              Einstiegspunkt, lädt src/app.js
src/
  app.js                Gesamte App-Logik (State, Rendering, Events)
  config.js              Supabase-URL/Key + Subdomain eintragen
  supabaseClient.js       Erstellt den Supabase-Client
  qrcode.js               Eigener, getesteter QR-Code-Encoder
  zip.js                  Minimaler ZIP-Writer (für "Alle QR-Codes als ZIP")
  pdf.js                   Minimaler PDF-Writer (für QR-Code-Download als PDF)
supabase/
  schema.sql              Datenbank-Tabellen, Sicherheitsregeln, Storage-Bucket
scripts/
  seed.mjs                 Einmaliges Setup-Skript für die 8 Stationen
assets/images/             Original-Bilder aus dem Entwurf
```
