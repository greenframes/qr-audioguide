// ============================================================
// Einmaliges Setup-Skript: lädt die 8 Stationen + Bildergalerie
// aus dem ursprünglichen Entwurf in die Supabase-Datenbank und
// den Storage-Bucket hoch.
//
// Ausführen (nach "npm install" und ausgefüllter .env):
//   npm run seed
//
// Das Skript ist idempotent für den zweiten Lauf NICHT gedacht -
// es legt Stationen per Insert an. Bei mehrfachem Ausführen lieber
// vorher die "stations"-Tabelle in Supabase leeren.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Bitte SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY setzen (siehe .env.example).');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const BUCKET = 'station-media';

const STATIONS = [
  { id:'01', slug:'gruendung-1844-dampfmaschine', sort_order:0, title:'Gründung 1844 & die erste Dampfmaschine', sub:'Auftakt · Hagen wird Industriestadt', era:'1844', dur:250, status:'pub',
    audio_title:'Der Anfang — Kaufleute werden Fabrikanten',
    image:'assets/images/stations/01.jpg',
    description:`Im Jahr 1844 gründeten der Kaufmann Bernhard Wilhelm Funcke und sein Neffe Friedrich Hueck in Hagen eine Schraubenfabrik. Beide gehörten zu jener Generation, die Kapital, Handelskenntnisse und familiäre Netzwerke aus dem Handel in neue industrielle Unternehmungen überführte.

Noch im selben Jahr nahm der Betrieb die erste Dampfmaschine des damaligen Hagener Stadtkreises in Betrieb. Das war mehr als eine technische Randnotiz: Wo zuvor Wasserkraft und Handarbeit die Metallverarbeitung bestimmten, trat nun eine Energiequelle, die unabhängig von Jahreszeit und Wasserstand arbeitete. Die Gründung fällt damit genau in jene Phase, in der sich Hagen von einem regionalen Handels- und Gewerbeort zu einem Industriezentrum entwickelte.

Bereits 1846 schied der ältere Funcke aus der Unternehmensleitung aus. Sein Sohn Wilhelm übernahm gemeinsam mit Friedrich Hueck — und wurde später zu einer der prägenden Unternehmerpersönlichkeiten der Stadt.

Ein Hinweis zum Ort, an dem Sie stehen: Das Gebäude vor Ihnen stammt nicht aus dem Gründungsjahr. Die Fabrik kam erst deutlich später hierher. Davon erzählt Station 5.`,
    narration:`Station 1. Gründung 1844 und die erste Dampfmaschine Hagens. Im Jahr 1844 gründeten der Kaufmann Bernhard Wilhelm Funcke und sein Neffe Friedrich Hueck in Hagen eine Schraubenfabrik. Beide gehörten zu jener Generation, die Kapital, Handelskenntnisse und familiäre Netzwerke in neue industrielle Unternehmungen überführte. Noch im selben Jahr nahm der Betrieb die erste Dampfmaschine des damaligen Hagener Stadtkreises in Betrieb. Das ist mehr als eine technische Randnotiz: Mit dieser Maschine begann in Hagen das industrielle Dampfzeitalter. Wo zuvor Wasserkraft und Handarbeit die Metallverarbeitung bestimmten, trat nun eine Energiequelle, die unabhängig von Jahreszeit und Wasserstand arbeitete. Bereits 1846 schied der ältere Funcke aus der Unternehmensleitung aus. Sein Sohn Wilhelm übernahm gemeinsam mit Friedrich Hueck — und wurde später zu einer der prägenden Unternehmerpersönlichkeiten der Stadt. Ein Hinweis zum Ort, an dem Sie gerade stehen: Das Gebäude vor Ihnen stammt nicht aus dem Gründungsjahr. Die Fabrik kam erst deutlich später hierher. Davon erzählt Station 5.` },

  { id:'02', slug:'eisenbahn-serienfertigung', sort_order:1, title:'Eisenbahn & Serienfertigung', sub:'Absatzmarkt und Lebensader zugleich', era:'ab 1850', dur:225, status:'pub',
    audio_title:'Schrauben für ein wachsendes Schienennetz',
    image:'assets/images/stations/02.jpg',
    description:`Mit dem starken Ausbau des Eisenbahnnetzes ab der Mitte des 19. Jahrhunderts stieg der Bedarf an standardisierten, hoch belastbaren Verbindungselementen sprunghaft an. Jede Schiene, jede Weiche, jede Brücke brauchte Schrauben, Bolzen und Muttern, die zuverlässig gleich waren — eine Anforderung, die handwerkliche Fertigung nicht erfüllen konnte.

Seit etwa 1850 fertigte Funcke & Hueck nachweislich Eisenbahnbedarf und Material für den Eisenbahnoberbau: Schrauben, Bolzen, Muttern und weitere Befestigungsteile.

Die Eisenbahn war für das Unternehmen in doppelter Hinsicht entscheidend. Sie war der wichtigste Absatzmarkt — und zugleich die Voraussetzung dafür, Rohstoffe in großen Mengen heranzuschaffen und fertige Ware überregional zu versenden. Ohne Schiene keine Serienfertigung, ohne Serienfertigung keine Schiene. Diese wechselseitige Abhängigkeit prägte das Werk über Jahrzehnte und erklärt, warum später die Nähe zum Hauptbahnhof über den Standort entschied.`,
    narration:`Station 2. Eisenbahn und Serienfertigung. Mit dem starken Ausbau des Eisenbahnnetzes ab der Mitte des 19. Jahrhunderts stieg der Bedarf an standardisierten, hoch belastbaren Verbindungselementen sprunghaft an. Jede Schiene, jede Weiche, jede Brücke brauchte Schrauben, Bolzen und Muttern, die zuverlässig gleich waren. Seit etwa 1850 fertigte Funcke und Hueck nachweislich Eisenbahnbedarf und Material für den Eisenbahnoberbau. Die Eisenbahn war für das Unternehmen in doppelter Hinsicht entscheidend. Sie war der wichtigste Absatzmarkt — und sie war zugleich die Voraussetzung dafür, Rohstoffe in großen Mengen heranzuschaffen und fertige Ware überregional zu versenden. Ohne Schiene keine Serienfertigung, ohne Serienfertigung keine Schiene. Diese wechselseitige Abhängigkeit prägte das Werk über Jahrzehnte und erklärt, warum später die Nähe zum Hauptbahnhof über den Standort entschied.` },

  { id:'03', slug:'gesenkschmiede-riemenfallhammer', sort_order:2, title:'Gesenkschmiede & Riemenfallhammer', sub:'Technische Innovation', era:'1860', dur:240, status:'pub',
    audio_title:'Der erste Riemenfallhammer Deutschlands',
    image:'assets/images/stations/03.jpg',
    description:`1860 wurde dem Unternehmen eine Gesenkschmiede angegliedert. Nach der archivalischen Überlieferung kam dort der erste Riemenfallhammer Deutschlands zum Einsatz.

Das Verfahren funktioniert im Kern so: Glühendes Metall wird zwischen zwei formgebende Werkzeuge gelegt, die Gesenke genannt werden. Ein schwerer Hammerbär fällt wiederholt darauf und presst das Material in die vorgegebene Form. Ein Riemen hebt den Bären zwischen den Schlägen wieder an — daher der Name.

Für Funcke & Hueck bedeutete das eine erhebliche Erweiterung der Möglichkeiten. Neben einfachen Schrauben ließen sich nun auch anspruchsvollere, hoch belastbare Schmiedeteile wirtschaftlich in großen Stückzahlen herstellen.

Der Lärm dieser Arbeit war weithin zu hören, die Hitze an den Feuern enorm. Was heute nach Technikgeschichte klingt, war für die Beschäftigten körperliche Schwerarbeit über lange Schichten.`,
    narration:`Station 3. Die Gesenkschmiede und der Riemenfallhammer. Im Jahr 1860 wurde dem Unternehmen eine Gesenkschmiede angegliedert. Nach der archivalischen Überlieferung kam dort der erste Riemenfallhammer Deutschlands zum Einsatz. Das Verfahren funktioniert im Kern so: Glühendes Metall wird zwischen zwei formgebende Werkzeuge gelegt, die Gesenke genannt werden. Ein schwerer Hammerbär fällt wiederholt darauf und presst das Material in die vorgegebene Form. Ein Riemen hebt den Bären zwischen den Schlägen wieder an — daher der Name. Für Funcke und Hueck bedeutete das eine erhebliche Erweiterung der Möglichkeiten. Neben einfachen Schrauben ließen sich nun auch anspruchsvollere, hoch belastbare Schmiedeteile wirtschaftlich in großen Stückzahlen herstellen. Der Lärm dieser Arbeit war weithin zu hören, die Hitze an den Feuern enorm. Was heute nach Technikgeschichte klingt, war für die Beschäftigten körperliche Schwerarbeit über lange Schichten.` },

  { id:'04', slug:'wachstum-zum-grossbetrieb', sort_order:3, title:'Wachstum zum Großbetrieb', sub:'Von 300 auf 1.500 Beschäftigte', era:'1850–1933', dur:215, status:'pub',
    audio_title:'Eine Fabrik und ihre Belegschaft',
    image:'assets/images/stations/04.jpg',
    description:`Die Zahlen erzählen die Geschichte dieser Fabrik so deutlich wie kaum etwas anderes. Mitte der 1850er-Jahre arbeiteten hier bereits ungefähr 300 bis 400 Menschen. Für 1872 werden rund 600 Beschäftigte genannt. Den höchsten bekannten Stand erreichte der Betrieb 1913 mit etwa 1.500 Arbeitern und Angestellten. 1933 — nach Weltkrieg, Inflation und Weltwirtschaftskrise — waren es noch rund 1.000.

Damit war Funcke & Hueck über Jahrzehnte einer der bedeutendsten Arbeitgeber Hagens.

Doch die wirtschaftliche Bedeutung reichte weit über die eigentliche Belegschaft hinaus. Familien lebten von diesen Löhnen. Zulieferer, Fuhrunternehmen, Händler und Handwerksbetriebe waren direkt oder indirekt mit dem Werk verbunden. Eine Fabrik dieser Größe formte einen ganzen Stadtteil — seine Wohnhäuser, seine Wege, seinen Tagesrhythmus.`,
    narration:`Station 4. Wachstum zum Großbetrieb. Die Zahlen erzählen die Geschichte dieser Fabrik so deutlich wie kaum etwas anderes. Mitte der 1850er-Jahre arbeiteten hier bereits ungefähr 300 bis 400 Menschen. Für 1872 werden rund 600 Beschäftigte genannt. Den höchsten bekannten Stand erreichte der Betrieb im Jahr 1913 mit etwa 1.500 Arbeitern und Angestellten. 1933, nach Weltkrieg, Inflation und Weltwirtschaftskrise, waren es noch rund 1.000. Damit war Funcke und Hueck über Jahrzehnte einer der bedeutendsten Arbeitgeber Hagens. Doch die wirtschaftliche Bedeutung reichte weit über die eigentliche Belegschaft hinaus. Familien lebten von diesen Löhnen. Zulieferer, Fuhrunternehmen, Händler und Handwerksbetriebe waren direkt oder indirekt mit dem Werk verbunden. Eine Fabrik dieser Größe formte einen ganzen Stadtteil — seine Wohnhäuser, seine Wege, seinen Tagesrhythmus.` },

  { id:'05', slug:'standort-an-der-ennepe', sort_order:4, title:'Der Standort an der Ennepe', sub:'Warum die Fabrik hierher kam', era:'1884 / 1905–06', dur:265, status:'pub',
    audio_title:'Bahn, Fluss und Fläche',
    image:'assets/images/stations/05.jpg',
    description:`Mit dem Wachstum reichten die älteren Produktionsflächen nicht mehr aus. 1884 wurde zunächst die Gesenkschmiede in das Gebiet westlich des Hagener Hauptbahnhofs verlagert. Ab 1905 beziehungsweise 1906 war dort auch die Schraubenfabrik selbst ansässig. Das ist der Ort, an dem Sie sich gerade befinden.

Der Standort bot alles, was ein wachsender Industriebetrieb brauchte: große Flächen, eine günstige Eisenbahnanbindung und gute Voraussetzungen für die Anlieferung schwerer Rohstoffe.

In unmittelbarer Nähe lag das mit der Familie verbundene Puddel- und Walzwerk Funcke & Elbers, das der Versorgung mit geeignetem Vormaterial diente. Diese Nähe zwischen Rohstoffaufbereitung, Walzwerk, Schmiede und Schraubenproduktion zeigt, wie arbeitsteilig und zugleich eng verflochten die Hagener Metallindustrie bereits im 19. Jahrhundert war.

Das Gebäude liegt am Fuß der Philippshöhe, parallel zur Ennepe. Achten Sie auf die langen Fensterreihen: Sie sollten so viel Tageslicht wie möglich in die Produktionsräume bringen. Im Laufe der Zeit entstand hier ein weitläufiger Komplex, dessen Bauteile über Treppen, Aufzüge und Übergänge verbunden waren — das erhaltene Gebäude zeigt nur noch einen kleinen Ausschnitt davon.`,
    narration:`Station 5. Der Standort an der Ennepe. Mit dem Wachstum reichten die älteren Produktionsflächen nicht mehr aus. 1884 wurde zunächst die Gesenkschmiede in das Gebiet westlich des Hagener Hauptbahnhofs verlagert. Ab 1905 beziehungsweise 1906 war dort auch die Schraubenfabrik selbst ansässig. Das ist der Ort, an dem Sie sich gerade befinden. Der Standort bot alles, was ein wachsender Industriebetrieb brauchte: große Flächen, eine günstige Eisenbahnanbindung und gute Voraussetzungen für die Anlieferung schwerer Rohstoffe. In unmittelbarer Nähe lag außerdem das mit der Familie verbundene Puddel- und Walzwerk Funcke und Elbers, das der Versorgung mit geeignetem Vormaterial diente. Diese räumliche und unternehmerische Nähe zwischen Rohstoffaufbereitung, Walzwerk, Schmiede und Schraubenproduktion zeigt, wie arbeitsteilig und zugleich eng verflochten die Hagener Metallindustrie bereits im 19. Jahrhundert war. Das Gebäude liegt am Fuß der Philippshöhe, parallel zur Ennepe. Achten Sie auf die langen Fensterreihen: Sie sollten so viel Tageslicht wie möglich in die Produktionsräume bringen.` },

  { id:'06', slug:'fruehe-betriebliche-sozialpolitik', sort_order:5, title:'Frühe betriebliche Sozialpolitik', sub:'Fürsorge und Abhängigkeit', era:'ab 1855', dur:230, status:'pub',
    audio_title:'Unterstützungskasse, Sparkasse, Werkswohnung',
    image:'assets/images/stations/06.jpg',
    description:`Funcke & Hueck führte vergleichsweise früh Einrichtungen für die Belegschaft ein. Belegt sind eine Unterstützungskasse ab 1855 und eine Arbeitersparkasse ab 1869. Später kamen Werkswohnungen, Versorgungs- und Speiseeinrichtungen sowie weitere Spar- und Pensionsangebote hinzu.

Die Unterstützungskasse wuchs beträchtlich: 1880 zählte sie 375 Mitglieder, 1885 waren es 551, 1890 bereits 930 und 1895 schließlich 986. Vieles davon entstand lange vor dem vollständigen Ausbau der staatlichen Sozialversicherung.

Man sollte diese Fürsorge allerdings nicht ausschließlich aus heutiger Sicht romantisieren. Solche betrieblichen Systeme boten echten Schutz und echte Unterstützung. Sie banden die Beschäftigten aber zugleich eng an den Arbeitgeber und waren Teil einer paternalistisch geprägten Unternehmenskultur. Wer die Werkswohnung verlor, verlor oft beides — Arbeit und Zuhause.`,
    narration:`Station 6. Frühe betriebliche Sozialpolitik. Funcke und Hueck führte vergleichsweise früh Einrichtungen für die Belegschaft ein. Belegt sind eine Unterstützungskasse ab 1855 und eine Arbeitersparkasse ab 1869. Später kamen Werkswohnungen, Versorgungs- und Speiseeinrichtungen sowie weitere Spar- und Pensionsangebote hinzu. Die Unterstützungskasse wuchs beträchtlich: Für 1880 werden 375 Mitglieder genannt, 1885 waren es 551, 1890 bereits 930 und 1895 schließlich 986. Vieles davon entstand lange vor dem vollständigen Ausbau der staatlichen Sozialversicherung. Man sollte diese Fürsorge allerdings nicht ausschließlich aus heutiger Sicht romantisieren. Solche betrieblichen Systeme boten echten Schutz und echte Unterstützung. Sie banden die Beschäftigten aber zugleich eng an den Arbeitgeber und waren Teil einer paternalistisch geprägten Unternehmenskultur. Wer die Werkswohnung verlor, verlor oft beides — Arbeit und Zuhause.` },

  { id:'07', slug:'menschen-und-netzwerk', sort_order:6, title:'Menschen & Netzwerk', sub:'Vom Schruwen-Willm bis Liselotte Funcke', era:'1820–2012', dur:300, status:'draft',
    audio_title:'Unternehmer, Mäzene, Politikerinnen',
    image:'assets/images/stations/07.jpg',
    description:`Hinter der Fabrik stehen Personen, deren Wirken weit über das Werkstor hinausreichte.

Wilhelm Funcke II., im Volksmund „Schruwen-Willm", führte das Unternehmen ab 1846 und machte es zum Großbetrieb. Er saß von 1856 bis 1872 in der Handelskammer zu Hagen, war 1868 kurzzeitig ihr Präsident und gehörte zu den Mitbegründern des Centralverbandes Deutscher Industrieller.

1875 trat Theodor Springmann als Teilhaber ein und blieb bis 1926. Von 1903 bis 1920 stand er an der Spitze der Handelskammer; 1925 verlieh ihm die Stadt Hagen die Ehrenbürgerwürde. Die Springmannstraße erinnert bis heute an die Familie.

Besonders bemerkenswert ist eine kulturgeschichtliche Verbindung: Karl Ernst Osthaus war ein Enkel Wilhelm Funckes. Ein Teil des Vermögens, das hier mit Schrauben und Eisenbahnbedarf entstand, ermöglichte 1902 das Folkwang-Museum und jenen kulturellen Aufbruch, der als „Hagener Impuls" bekannt wurde.

Und schließlich Liselotte Funcke: Sie arbeitete von 1944 bis 1969 als Prokuristin in diesem Unternehmen und wurde später Bundestagsvizepräsidentin, Wirtschaftsministerin von Nordrhein-Westfalen und Ausländerbeauftragte der Bundesregierung. 2003 wurde sie Ehrenbürgerin ihrer Stadt.`,
    narration:`Station 7. Menschen und Netzwerk. Hinter der Fabrik stehen Personen, deren Wirken weit über das Werkstor hinausreichte. Wilhelm Funcke der Zweite, im Volksmund „Schruwen-Willm" genannt, führte das Unternehmen ab 1846 und machte es zum Großbetrieb. Er saß in der Handelskammer zu Hagen, war 1868 kurzzeitig ihr Präsident und gehörte zu den Mitbegründern des Centralverbandes Deutscher Industrieller. 1875 trat Theodor Springmann als Teilhaber ein und blieb bis 1926. Von 1903 bis 1920 stand er an der Spitze der Handelskammer; 1925 verlieh ihm die Stadt Hagen die Ehrenbürgerwürde. Besonders bemerkenswert ist eine kulturgeschichtliche Verbindung: Karl Ernst Osthaus war ein Enkel Wilhelm Funckes. Ein Teil des Vermögens, das hier mit Schrauben und Eisenbahnbedarf entstand, ermöglichte 1902 das Folkwang-Museum und jenen kulturellen Aufbruch, der als „Hagener Impuls" bekannt wurde. Und schließlich Liselotte Funcke: Sie arbeitete von 1944 bis 1969 als Prokuristin in diesem Unternehmen und wurde später Bundestagsvizepräsidentin, Wirtschaftsministerin von Nordrhein-Westfalen und Ausländerbeauftragte der Bundesregierung.` },

  { id:'08', slug:'kriege-lost-place-neubeginn', sort_order:7, title:'Kriege, Lost Place & Neubeginn', sub:'1970 bis heute', era:'1914–2026', dur:285, status:'pub',
    audio_title:'Vom Abriss zum Denkmal mit Zukunft',
    image:'assets/images/stations/08.jpg',
    description:`Wie andere große metallverarbeitende Betriebe wurde Funcke & Hueck in beiden Weltkriegen in die Kriegswirtschaft einbezogen. Für 1944 ist ein Verlagerungsbetrieb unter der Bezeichnung „Kleinpresswerk" dokumentiert, ebenso die Verlagerung von Teilen der Produktion in geschützte Bereiche. Zur Frage, ob und in welchem Umfang Zwangsarbeitskräfte eingesetzt wurden, liegen keine gesicherten Angaben vor — hier wäre eine gezielte Archivauswertung nötig, und bis dahin verzichten wir bewusst auf Behauptungen.

1970 wurde das Unternehmen an den Neusser Schraubenhersteller Bauer & Schaurte verkauft. Damit endete nach mehr als 120 Jahren die eigenständige Firmengeschichte. Aus dem Namen Bauer & Schaurte entstand die Marke INBUS — erfunden hat Funcke & Hueck dieses System allerdings nicht.

Anfang der 1990er-Jahre endete die Produktion. 1991 diente das Gelände als Filmkulisse für Teile von „Manta, Manta". 2001 wurden große Teile abgerissen, der Rest verfiel und wurde zu einem bekannten Hagener Lost Place.

Seit 2021 wird das erhaltene Gebäude denkmalgerecht saniert. Es entstehen Bildungs-, Seminar-, Veranstaltungs-, Hotel- und Gastronomiebereiche. Denkmalpflege heißt hier nicht Konservieren, sondern Weiterbauen.`,
    narration:`Station 8. Kriege, Lost Place und Neubeginn. Wie andere große metallverarbeitende Betriebe wurde Funcke und Hueck in beiden Weltkriegen in die Kriegswirtschaft einbezogen. Für 1944 ist ein Verlagerungsbetrieb unter der Bezeichnung Kleinpresswerk dokumentiert, ebenso die Verlagerung von Teilen der Produktion in geschützte Bereiche. Zu der Frage, ob und in welchem Umfang Zwangsarbeitskräfte eingesetzt wurden, liegen uns keine gesicherten Angaben vor — hier wäre eine gezielte Archivauswertung nötig, und bis dahin verzichten wir bewusst auf Behauptungen. 1970 wurde das Unternehmen an den Neusser Schraubenhersteller Bauer und Schaurte verkauft. Aus dessen Namen entstand die Marke INBUS — erfunden hat Funcke und Hueck dieses System allerdings nicht. Anfang der 1990er-Jahre endete die Produktion. 1991 diente das Gelände als Filmkulisse für Teile von „Manta, Manta". 2001 wurden große Teile abgerissen, der Rest verfiel und wurde zu einem bekannten Hagener Lost Place. Seit 2021 wird das erhaltene Gebäude denkmalgerecht saniert. Es entstehen Bildungs-, Seminar-, Veranstaltungs-, Hotel- und Gastronomiebereiche. Denkmalpflege heißt hier nicht Konservieren, sondern Weiterbauen. Vielen Dank für Ihren Besuch.` },
];

const GALLERY = [
  { file:'assets/images/gallery/01.jpg', caption:'Backsteinfassade an der Ennepe. Die gereihten Fensterachsen brachten Tageslicht in die Produktionsräume.' },
  { file:'assets/images/gallery/02.jpg', caption:'Produktionshalle mit gusseisernen Stützen — Blick in den Zustand vor der Sanierung.' },
  { file:'assets/images/gallery/03.jpg', caption:'Treppenhaus im Rohzustand. Über solche Aufgänge waren die Werksteile miteinander verbunden.' },
  { file:'assets/images/gallery/04.jpg', caption:'Rundbogenfenster über dem neuen Eingang: erhaltene Substanz trifft heutige Nutzung.' },
  { file:'assets/images/gallery/05.jpg', caption:'Die Ennepe entlang der Werksmauer. Wasser und Bahn bestimmten die Standortwahl.' },
  { file:'assets/images/gallery/06.jpg', caption:'Detail der sanierten Fassade am Fuß der Philippshöhe.' },
];

async function ensureBucket() {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.some(b => b.name === BUCKET)) {
    const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
    if (error) throw error;
    console.log(`Bucket "${BUCKET}" angelegt.`);
  }
}

async function uploadImage(relPath, destFolder) {
  const bytes = readFileSync(path.join(ROOT, relPath));
  const filename = path.basename(relPath);
  const dest = `${destFolder}/${filename}`;
  const { error } = await supabase.storage.from(BUCKET).upload(dest, bytes, {
    contentType: 'image/jpeg', upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(dest);
  return data.publicUrl;
}

async function main() {
  console.log('Prüfe Storage-Bucket...');
  await ensureBucket();

  console.log('Lade Stationsbilder hoch...');
  const rows = [];
  for (const s of STATIONS) {
    const image_url = await uploadImage(s.image, 'images');
    const { image, ...rest } = s;
    rows.push({ ...rest, image_url, scans: 0 });
    console.log(`  ✓ ${s.id} ${s.title}`);
  }

  console.log('Lege Stationen in der Datenbank an...');
  const { error: stErr } = await supabase.from('stations').insert(rows);
  if (stErr) throw stErr;

  console.log('Lade Galeriebilder hoch...');
  const galRows = [];
  for (let i = 0; i < GALLERY.length; i++) {
    const g = GALLERY[i];
    const image_url = await uploadImage(g.file, 'gallery');
    galRows.push({ sort_order: i, image_url, caption: g.caption });
    console.log(`  ✓ ${g.file}`);
  }
  const { error: galErr } = await supabase.from('gallery').insert(galRows);
  if (galErr) throw galErr;

  console.log('\nFertig! 8 Stationen und 6 Galeriebilder wurden angelegt.');
  console.log('Nächster Schritt: einen Admin-Benutzer anlegen (siehe README.md, Abschnitt "Admin-Zugang").');
}

main().catch(e => { console.error('Fehler beim Seed-Vorgang:', e); process.exit(1); });
