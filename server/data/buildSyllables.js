// buildSyllables.js
// Génère countries.json et capitals.json à partir de la liste des 195 pays
// reconnus par l'ONU (noms français + capitales).
//
// Les "syllables" sont TOUTES les sous-chaînes de 2 à 5 lettres consécutives
// du nom, en minuscules et sans accents. Elles servent de combinaisons
// de challenge pour les modes Pays et Capitales.
//
// Usage : node server/data/buildSyllables.js

import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// [ nom du pays (FR), capitale (FR) ]
const DATA = [
  ['Afghanistan', 'Kaboul'],
  ['Afrique du Sud', 'Pretoria'],
  ['Albanie', 'Tirana'],
  ['Algérie', 'Alger'],
  ['Allemagne', 'Berlin'],
  ['Andorre', 'Andorre-la-Vieille'],
  ['Angola', 'Luanda'],
  ['Antigua-et-Barbuda', 'Saint John'],
  ['Arabie saoudite', 'Riyad'],
  ['Argentine', 'Buenos Aires'],
  ['Arménie', 'Erevan'],
  ['Australie', 'Canberra'],
  ['Autriche', 'Vienne'],
  ['Azerbaïdjan', 'Bakou'],
  ['Bahamas', 'Nassau'],
  ['Bahreïn', 'Manama'],
  ['Bangladesh', 'Dacca'],
  ['Barbade', 'Bridgetown'],
  ['Belgique', 'Bruxelles'],
  ['Belize', 'Belmopan'],
  ['Bénin', 'Porto-Novo'],
  ['Bhoutan', 'Thimphou'],
  ['Biélorussie', 'Minsk'],
  ['Birmanie', 'Naypyidaw'],
  ['Bolivie', 'Sucre'],
  ['Bosnie-Herzégovine', 'Sarajevo'],
  ['Botswana', 'Gaborone'],
  ['Brésil', 'Brasilia'],
  ['Brunei', 'Bandar Seri Begawan'],
  ['Bulgarie', 'Sofia'],
  ['Burkina Faso', 'Ouagadougou'],
  ['Burundi', 'Gitega'],
  ['Cambodge', 'Phnom Penh'],
  ['Cameroun', 'Yaoundé'],
  ['Canada', 'Ottawa'],
  ['Cap-Vert', 'Praia'],
  ['Chili', 'Santiago'],
  ['Chine', 'Pékin'],
  ['Chypre', 'Nicosie'],
  ['Colombie', 'Bogota'],
  ['Comores', 'Moroni'],
  ['Congo', 'Brazzaville'],
  ['Corée du Nord', 'Pyongyang'],
  ['Corée du Sud', 'Séoul'],
  ['Costa Rica', 'San José'],
  ["Côte d'Ivoire", 'Yamoussoukro'],
  ['Croatie', 'Zagreb'],
  ['Cuba', 'La Havane'],
  ['Danemark', 'Copenhague'],
  ['Djibouti', 'Djibouti'],
  ['Dominique', 'Roseau'],
  ['Égypte', 'Le Caire'],
  ['Émirats arabes unis', 'Abou Dabi'],
  ['Équateur', 'Quito'],
  ['Érythrée', 'Asmara'],
  ['Espagne', 'Madrid'],
  ['Estonie', 'Tallinn'],
  ['Eswatini', 'Mbabane'],
  ['États-Unis', 'Washington'],
  ['Éthiopie', 'Addis-Abeba'],
  ['Fidji', 'Suva'],
  ['Finlande', 'Helsinki'],
  ['France', 'Paris'],
  ['Gabon', 'Libreville'],
  ['Gambie', 'Banjul'],
  ['Géorgie', 'Tbilissi'],
  ['Ghana', 'Accra'],
  ['Grèce', 'Athènes'],
  ['Grenade', "Saint-Georges"],
  ['Guatemala', 'Guatemala'],
  ['Guinée', 'Conakry'],
  ['Guinée-Bissau', 'Bissau'],
  ['Guinée équatoriale', 'Malabo'],
  ['Guyana', 'Georgetown'],
  ['Haïti', 'Port-au-Prince'],
  ['Honduras', 'Tegucigalpa'],
  ['Hongrie', 'Budapest'],
  ['Inde', 'New Delhi'],
  ['Indonésie', 'Jakarta'],
  ['Irak', 'Bagdad'],
  ['Iran', 'Téhéran'],
  ['Irlande', 'Dublin'],
  ['Islande', 'Reykjavik'],
  ['Israël', 'Jérusalem'],
  ['Italie', 'Rome'],
  ['Jamaïque', 'Kingston'],
  ['Japon', 'Tokyo'],
  ['Jordanie', 'Amman'],
  ['Kazakhstan', 'Astana'],
  ['Kenya', 'Nairobi'],
  ['Kirghizistan', 'Bichkek'],
  ['Kiribati', 'Tarawa'],
  ['Koweït', 'Koweït'],
  ['Laos', 'Vientiane'],
  ['Lesotho', 'Maseru'],
  ['Lettonie', 'Riga'],
  ['Liban', 'Beyrouth'],
  ['Liberia', 'Monrovia'],
  ['Libye', 'Tripoli'],
  ['Liechtenstein', 'Vaduz'],
  ['Lituanie', 'Vilnius'],
  ['Luxembourg', 'Luxembourg'],
  ['Macédoine du Nord', 'Skopje'],
  ['Madagascar', 'Antananarivo'],
  ['Malaisie', 'Kuala Lumpur'],
  ['Malawi', 'Lilongwe'],
  ['Maldives', 'Malé'],
  ['Mali', 'Bamako'],
  ['Malte', 'La Valette'],
  ['Maroc', 'Rabat'],
  ['Marshall', 'Majuro'],
  ['Maurice', 'Port-Louis'],
  ['Mauritanie', 'Nouakchott'],
  ['Mexique', 'Mexico'],
  ['Micronésie', 'Palikir'],
  ['Moldavie', 'Chisinau'],
  ['Monaco', 'Monaco'],
  ['Mongolie', 'Oulan-Bator'],
  ['Monténégro', 'Podgorica'],
  ['Mozambique', 'Maputo'],
  ['Namibie', 'Windhoek'],
  ['Nauru', 'Yaren'],
  ['Népal', 'Katmandou'],
  ['Nicaragua', 'Managua'],
  ['Niger', 'Niamey'],
  ['Nigéria', 'Abuja'],
  ['Norvège', 'Oslo'],
  ['Nouvelle-Zélande', 'Wellington'],
  ['Oman', 'Mascate'],
  ['Ouganda', 'Kampala'],
  ['Ouzbékistan', 'Tachkent'],
  ['Pakistan', 'Islamabad'],
  ['Palaos', 'Ngerulmud'],
  ['Palestine', 'Ramallah'],
  ['Panama', 'Panama'],
  ['Papouasie-Nouvelle-Guinée', 'Port Moresby'],
  ['Paraguay', 'Asuncion'],
  ['Pays-Bas', 'Amsterdam'],
  ['Pérou', 'Lima'],
  ['Philippines', 'Manille'],
  ['Pologne', 'Varsovie'],
  ['Portugal', 'Lisbonne'],
  ['Qatar', 'Doha'],
  ['République centrafricaine', 'Bangui'],
  ['République démocratique du Congo', 'Kinshasa'],
  ['République dominicaine', 'Saint-Domingue'],
  ['République tchèque', 'Prague'],
  ['Roumanie', 'Bucarest'],
  ['Royaume-Uni', 'Londres'],
  ['Russie', 'Moscou'],
  ['Rwanda', 'Kigali'],
  ['Saint-Christophe-et-Niévès', 'Basseterre'],
  ['Saint-Marin', 'Saint-Marin'],
  ['Saint-Vincent-et-les-Grenadines', 'Kingstown'],
  ['Sainte-Lucie', 'Castries'],
  ['Salomon', 'Honiara'],
  ['Salvador', 'San Salvador'],
  ['Samoa', 'Apia'],
  ['Sao Tomé-et-Principe', 'Sao Tomé'],
  ['Sénégal', 'Dakar'],
  ['Serbie', 'Belgrade'],
  ['Seychelles', 'Victoria'],
  ['Sierra Leone', 'Freetown'],
  ['Singapour', 'Singapour'],
  ['Slovaquie', 'Bratislava'],
  ['Slovénie', 'Ljubljana'],
  ['Somalie', 'Mogadiscio'],
  ['Soudan', 'Khartoum'],
  ['Soudan du Sud', 'Djouba'],
  ['Sri Lanka', 'Colombo'],
  ['Suède', 'Stockholm'],
  ['Suisse', 'Berne'],
  ['Suriname', 'Paramaribo'],
  ['Syrie', 'Damas'],
  ['Tadjikistan', 'Douchanbé'],
  ['Tanzanie', 'Dodoma'],
  ['Tchad', "N'Djamena"],
  ['Thaïlande', 'Bangkok'],
  ['Timor oriental', 'Dili'],
  ['Togo', 'Lomé'],
  ['Tonga', 'Nukualofa'],
  ['Trinité-et-Tobago', "Port d'Espagne"],
  ['Tunisie', 'Tunis'],
  ['Turkménistan', 'Achgabat'],
  ['Turquie', 'Ankara'],
  ['Tuvalu', 'Funafuti'],
  ['Ukraine', 'Kiev'],
  ['Uruguay', 'Montevideo'],
  ['Vanuatu', 'Port-Vila'],
  ['Vatican', 'Vatican'],
  ['Venezuela', 'Caracas'],
  ['Viêt Nam', 'Hanoï'],
  ['Yémen', 'Sanaa'],
  ['Zambie', 'Lusaka'],
  ['Zimbabwe', 'Harare']
]

// Retire les accents et ne garde que les lettres a-z (les espaces, tirets et
// apostrophes ne comptent pas comme des lettres pour les syllabes).
export function normalize(str) {
  return str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // diacritiques
    .toLowerCase()
    .replace(/[^a-z]/g, '')
}

// Toutes les sous-chaînes de 2 à 5 lettres consécutives, dédupliquées.
export function buildSyllables(name) {
  const clean = normalize(name)
  const set = new Set()
  for (let len = 2; len <= 5; len++) {
    for (let i = 0; i + len <= clean.length; i++) {
      set.add(clean.slice(i, i + len))
    }
  }
  return [...set]
}

const countries = DATA.map(([name]) => ({
  name,
  norm: normalize(name),
  syllables: buildSyllables(name)
}))

const capitals = DATA.map(([country, capital]) => ({
  capital,
  country,
  norm: normalize(capital),
  syllables: buildSyllables(capital)
}))

writeFileSync(
  join(__dirname, 'countries.json'),
  JSON.stringify(countries, null, 2),
  'utf-8'
)
writeFileSync(
  join(__dirname, 'capitals.json'),
  JSON.stringify(capitals, null, 2),
  'utf-8'
)

console.log(`✅ countries.json : ${countries.length} pays`)
console.log(`✅ capitals.json  : ${capitals.length} capitales`)
