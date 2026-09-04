// Der Supabase-Client wird lokal mitgeliefert (src/vendor/supabase.js,
// als klassisches <script> in index.html vor diesem Modul geladen) statt
// von einem CDN geladen zu werden - so funktioniert die App auch in
// Netzwerken, die externe CDNs blockieren (z.B. manche Museums-WLANs).
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export const BUCKET = 'station-media';
