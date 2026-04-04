import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'docentenplanner.db');

let db: Database | null = null;

export async function getDb(): Promise<Database> {
  if (db) return db;

  const wasmPath = path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
  const wasmBinary = fs.readFileSync(wasmPath);
  const SQL = await initSqlJs({ wasmBinary });

  // Load existing DB or create new
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
    initializeSchema(db);
  }

  return db;
}

export function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, buffer);
}

function initializeSchema(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS klassen (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      naam TEXT NOT NULL,
      vak TEXT NOT NULL DEFAULT 'Nederlands',
      lokaal TEXT,
      jaarlaag TEXT,
      schooljaar TEXT DEFAULT '2025-2026',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS leerlingen (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      klas_id INTEGER NOT NULL,
      voornaam TEXT NOT NULL,
      achternaam TEXT NOT NULL,
      foto_url TEXT,
      seat_row INTEGER DEFAULT 0,
      seat_col INTEGER DEFAULT 0,
      boek_titel TEXT,
      boek_kleur TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (klas_id) REFERENCES klassen(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lessen (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      klas_id INTEGER NOT NULL,
      datum TEXT NOT NULL,
      startopdracht TEXT,
      terugkijken TEXT,
      programma TEXT,
      leerdoelen TEXT,
      huiswerk TEXT,
      niet_vergeten TEXT,
      notities TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (klas_id) REFERENCES klassen(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS registraties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      leerling_id INTEGER NOT NULL,
      les_id INTEGER,
      datum TEXT NOT NULL DEFAULT (date('now')),
      type TEXT NOT NULL CHECK(type IN ('telaat','absent','huiswerk','materiaal','verwijderd','waarschuwing','compliment')),
      details TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (leerling_id) REFERENCES leerlingen(id) ON DELETE CASCADE,
      FOREIGN KEY (les_id) REFERENCES lessen(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS observaties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      leerling_id INTEGER NOT NULL,
      les_id INTEGER,
      datum TEXT NOT NULL DEFAULT (date('now')),
      tekst TEXT NOT NULL,
      audio_url TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (leerling_id) REFERENCES leerlingen(id) ON DELETE CASCADE,
      FOREIGN KEY (les_id) REFERENCES lessen(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS plattegrond_layouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      klas_id INTEGER NOT NULL UNIQUE,
      layout_type TEXT DEFAULT 'paren',
      rijen INTEGER DEFAULT 5,
      kolommen INTEGER DEFAULT 8,
      layout_data TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (klas_id) REFERENCES klassen(id) ON DELETE CASCADE
    );
  `);

  // Insert demo data
  insertDemoData(db);
  saveDb();
}

function insertDemoData(db: Database) {
  db.run(`INSERT INTO klassen (naam, vak, lokaal, jaarlaag) VALUES ('M3B', 'Nederlands', '214', '3 mavo')`);
  db.run(`INSERT INTO klassen (naam, vak, lokaal, jaarlaag) VALUES ('H4A', 'Nederlands', '108', '4 havo')`);
  db.run(`INSERT INTO klassen (naam, vak, lokaal, jaarlaag) VALUES ('V5C', 'Nederlands', '315', '5 vwo')`);

  const leerlingenM3B = [
    ['Rafael','Blom'],['Valerio','Schulte'],['Nathaniël','Elden'],
    ['Kaan','Tanrikulu'],['Bart','van der Laan'],['Nine','Bos'],
    ['Alexander','Klaver'],['Dyani','Verschoor'],['Pepijn','Schrama'],
    ['Jasim','Hamou'],['Fadi','Mubarak'],['Jameley','Wijdenbosch'],
    ['Meis','Rijlaarsdam'],['Shayan','Vaasen'],['Sem','Beelen'],
    ['Isabelle','Debrichy'],['Tess','Melkert'],['Lars','van Es'],
    ['Fabiano','Jamett'],['Veerle','Hooiveld'],['Brody','Peters'],
  ];

  const boeken = [
    'Het Diner','De Aanslag','Turks Fruit','De Donkere Kamer','Joe Speedboot',
    'Bonita Avenue','Oorlogswinter','Sonny Boy','Brief aan de Koning','Kruistocht in Spijkerbroek',
    'De Tweeling','Het Gouden Ei','Tirza','De Engelenmaker','Hersenschimmen',
    'Kaas','Max Havelaar','De Avonden','Komt een vrouw','Alleen maar nette mensen','De Helaasheid'
  ];

  const kleuren = [
    '#8B4513','#2E4057','#6B3FA0','#C0392B','#1A5276','#117864','#784212',
    '#4A235A','#1B4F72','#7B241C','#0E6655','#6C3483','#935116','#1F618D',
    '#922B21','#196F3D','#7D3C98','#A04000','#2C3E50','#884EA0','#2874A6'
  ];

  leerlingenM3B.forEach(([voornaam, achternaam], idx) => {
    db.run(
      `INSERT INTO leerlingen (klas_id, voornaam, achternaam, boek_titel, boek_kleur) VALUES (1, ?, ?, ?, ?)`,
      [voornaam, achternaam, boeken[idx], kleuren[idx]]
    );
  });

  // Layout for M3B (matches Peter's classroom)
  const layoutData = JSON.stringify([
    [1,2,null,null,null,null,null,3],
    [4,5,null,null,6,null,7,8],
    [9,null,null,10,11,null,12,13],
    [14,15,null,16,17,null,18,19],
    [20,null,null,null,null,null,null,21],
  ]);
  db.run(`INSERT INTO plattegrond_layouts (klas_id, layout_data) VALUES (1, ?)`, [layoutData]);

  // Demo les voor vandaag - M3B
  db.run(`INSERT INTO lessen (klas_id, datum, startopdracht, terugkijken, programma, leerdoelen, huiswerk, niet_vergeten) VALUES (1, date('now'), ?, ?, ?, ?, ?, ?)`, [
    'Pak je schrift en schrijf in 5 minuten een samenvatting van wat we vorige les hebben geleerd over werkwoordspelling. Gebruik minimaal 3 voorbeeldzinnen.',
    'Hoofdstuk 4 besproken: werkwoordspelling. Leerlingen hebben oefening 3 t/m 6 gemaakt. Nabesproken in de klas.',
    'Herhaling werkwoordspelling (10 min)\nNieuw: lijdend en meewerkend voorwerp (20 min)\nZelfstandig werken: oefening 7 en 8 (15 min)',
    '• Kan werkwoordspelling toepassen\n• Kan lijdend voorwerp herkennen',
    'Oefening 7 en 8 afmaken (p. 34-35)\nLeer de theorie van §4.3',
    'PW Hoofdstuk 3+4 - dinsdag 8 april\nKoningsspelen - vrijdag 25 april\nMeivakantie begint 26 april'
  ]);

  // === H4A - 4 havo (klas_id = 2) ===
  const leerlingenH4A = [
    ['Emma','de Vries'],['Daan','Jansen'],['Sophie','Bakker'],
    ['Liam','Visser'],['Julia','Smit'],['Noah','Meijer'],
    ['Sara','de Groot'],['Lucas','Bos'],['Isa','Mulder'],
    ['Finn','de Boer'],['Eva','Dekker'],['Jesse','van Dijk'],
    ['Noa','Hendriks'],['Milan','Peters'],['Lotte','van den Berg'],
    ['Sven','Vermeer'],['Fleur','van Leeuwen'],['Thijs','de Jong'],
    ['Roos','Maas'],['Luuk','Scholten'],['Amber','Willems'],
    ['Stijn','van der Heijden'],['Lynn','Jacobs'],['Ruben','van der Linden'],
    ['Femke','Kuijpers'],['Bram','Brouwer'],
  ];

  const boekenH4A = [
    'Het Schnitzelparadijs','Spijt!','De Kleine Blonde Dood','Oeroeg','Kus me',
    'Nooit meer slapen','Onder het viaduct','De brief voor de koning','Lampje','Soms snap ik mijn moeder',
    'Het leven is vuransen','Oorlogswinter','De gelukkige klas','Sprakeloos','Huid en haar',
    'Doodsbloemen','De ontdekking van de hemel','Logboek van een onbarmhartig jaar','Achtste groepers huilen niet','De helaasheid der dingen',
    'Tikkop','Fucking Istanbul','Alles wat er was','De jongen in de gestreepte pyjama','Een vlucht regenwulpen','Karakter'
  ];

  const kleurenH4A = [
    '#D4A017','#2E86C1','#A93226','#1ABC9C','#8E44AD','#D35400','#2980B9',
    '#C0392B','#27AE60','#8B0000','#3498DB','#E74C3C','#16A085','#F39C12',
    '#7D3C98','#2C3E50','#E67E22','#1F618D','#C0392B','#117A65','#884EA0',
    '#A04000','#2874A6','#6C3483','#196F3D','#935116'
  ];

  leerlingenH4A.forEach(([voornaam, achternaam], idx) => {
    db.run(
      `INSERT INTO leerlingen (klas_id, voornaam, achternaam, boek_titel, boek_kleur) VALUES (2, ?, ?, ?, ?)`,
      [voornaam, achternaam, boekenH4A[idx], kleurenH4A[idx]]
    );
  });

  // Layout H4A - 4 rijen, standaard paren
  const layoutH4A = JSON.stringify([
    [22,23,null,24,25,null,26,27],
    [28,29,null,30,31,null,32,33],
    [34,35,null,36,37,null,38,39],
    [40,41,null,42,43,null,44,45],
    [46,47,null,null,null,null,null,null],
  ]);
  db.run(`INSERT INTO plattegrond_layouts (klas_id, layout_data) VALUES (2, ?)`, [layoutH4A]);

  // Demo les H4A
  db.run(`INSERT INTO lessen (klas_id, datum, startopdracht, terugkijken, programma, leerdoelen, huiswerk, niet_vergeten) VALUES (2, date('now'), ?, ?, ?, ?, ?, ?)`, [
    'Schrijf drie argumenten op waarom jouw boek wel of niet geschikt is als eindexamentekst. Gebruik de STAAL-methode.',
    'Vorige les: argumentatiestructuur besproken. Stellingen geanalyseerd in groepjes.',
    'Terugblik argumentatie (5 min)\nLeesvaardigheid: tekst 4 maken (25 min)\nNabespreken in tweetallen (15 min)',
    '• Kan argumenten herkennen in een betoog\n• Kan hoofd- en deelargumenten onderscheiden',
    'Tekst 4 afmaken + vragen 1 t/m 8\nLees hoofdstuk 5 van je leesboek',
    'SE Leesvaardigheid - woensdag 16 april\nInleverdatum boekverslag - 23 april'
  ]);

  // === V5C - 5 vwo (klas_id = 3) ===
  const leerlingenV5C = [
    ['Mila','van Beek'],['Thomas','Groen'],['Anna','Pieters'],
    ['Cas','de Wit'],['Olivia','van der Wal'],['Max','Huisman'],
    ['Zoë','Koster'],['Jasper','Dijkstra'],['Lisa','van der Meer'],
    ['Timo','Schouten'],['Nina','van Vliet'],['Joep','Verhoeven'],
    ['Eline','de Graaf'],['Rick','Kok'],['Sarah','van Dam'],
    ['Jens','Molenaar'],['Hannah','de Haan'],['Wouter','Vos'],
    ['Iris','Klein'],['Daniël','Lam'],['Vera','Wolters'],
    ['Matthijs','Post'],['Charlotte','van der Velden'],['Sander','Blom'],
    ['Noor','van Es'],['Hidde','Vermeulen'],['Floor','van Dijk'],
    ['Gijs','Bosman'],['Merel','Evers'],['Tobias','van den Heuvel'],
  ];

  const boekenV5C = [
    'De avonden','Max Havelaar','Het bureau','De ontdekking van de hemel','Hersenschimmen',
    'De aanslag','Nooit meer slapen','Heren van de thee','De donkere kamer van Damokles','Twee vrouwen',
    'Het diner','Een vlucht regenwulpen','Karakter','De kleine blonde dood','Oeroeg',
    'Het verdriet van België','De verwondering','De kellner en de levenden','Tirza','Bonita Avenue',
    'Nachttrein naar Lissabon','De ontaarde moeders','Het achterhuis','Contrapunt','Meander',
    'Kaas','Jan Kansen','Het bittere kruid','Dubbelspel','De Tandeloze Tijd'
  ];

  const kleurenV5C = [
    '#1B2631','#4A235A','#0B5345','#7B241C','#1A5276','#6C3483','#784212',
    '#2E4057','#922B21','#0E6655','#2C3E50','#8B4513','#1F618D','#A04000',
    '#196F3D','#7D3C98','#2874A6','#884EA0','#117864','#C0392B','#2E86C1',
    '#935116','#6B3FA0','#1ABC9C','#D35400','#8E44AD','#27AE60','#D4A017',
    '#3498DB','#E74C3C'
  ];

  leerlingenV5C.forEach(([voornaam, achternaam], idx) => {
    db.run(
      `INSERT INTO leerlingen (klas_id, voornaam, achternaam, boek_titel, boek_kleur) VALUES (3, ?, ?, ?, ?)`,
      [voornaam, achternaam, boekenV5C[idx], kleurenV5C[idx]]
    );
  });

  // Layout V5C - 5 rijen
  const layoutV5C = JSON.stringify([
    [48,49,null,50,51,null,52,53],
    [54,55,null,56,57,null,58,59],
    [60,61,null,62,63,null,64,65],
    [66,67,null,68,69,null,70,71],
    [72,73,null,74,75,null,76,77],
  ]);
  db.run(`INSERT INTO plattegrond_layouts (klas_id, layout_data) VALUES (3, ?)`, [layoutV5C]);

  // Demo les V5C
  db.run(`INSERT INTO lessen (klas_id, datum, startopdracht, terugkijken, programma, leerdoelen, huiswerk, niet_vergeten) VALUES (3, date('now'), ?, ?, ?, ?, ?, ?)`, [
    'Lees het gedicht op het bord (Lucebert - "ik tracht op poëtische wijze"). Noteer in steekwoorden: thema, beeldspraak, en jouw eerste interpretatie.',
    'Vorige les: literaire stromingen 20e eeuw. Expressionisme en de Vijftigers behandeld. Leerlingen hebben gedichten geanalyseerd.',
    'Herhaling Vijftigers (5 min)\nNieuw: Postmodernisme in de Nederlandse literatuur (20 min)\nClose reading: fragment uit Het Bureau (20 min)',
    '• Kan kenmerken van postmodernisme herkennen\n• Kan een literair fragment analyseren op stijl en thematiek',
    'Lees hoofdstuk 7 van je literatuurgeschiedenis\nMaak de analyseopdracht van het fragment af',
    'Literatuurtoets stromingen - donderdag 17 april\nMondeling boekbespreking - week 18\nDeadline leesdossier - 2 mei'
  ]);
}
