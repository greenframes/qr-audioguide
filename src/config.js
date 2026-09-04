// ============================================================
// Konfiguration — hier deine eigenen Werte eintragen.
// Diese Datei wird im Browser geladen, daher NUR öffentliche
// Werte hier eintragen: die Supabase-URL und der "anon"-Key
// sind bewusst öffentlich nutzbar (Zugriff wird serverseitig
// über Row-Level-Security geregelt), niemals den service_role-Key
// hier eintragen!
// Siehe README.md, Abschnitt "Einrichtung".
// ============================================================

export const SUPABASE_URL = 'https://DEIN-PROJEKT.supabase.co';
export const SUPABASE_ANON_KEY = 'DEIN-ANON-KEY';

// Die öffentliche Adresse, unter der die App später erreichbar ist
// (deine Subdomain). Wird benutzt, um die QR-Codes zu erzeugen, die
// Besucher zu den Stationen führen. Ohne trailing slash.
export const SITE_URL = 'https://audioguide.example.de';
