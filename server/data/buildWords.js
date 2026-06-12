// buildWords.js
// Génère words_fr.json : un dictionnaire de mots français courants (noms
// communs, verbes, adjectifs — pas de noms propres), de 4 à 15 lettres,
// trié alphabétiquement et dédupliqué.
//
// Tous les mots sont stockés sans accents et en minuscules pour simplifier
// la validation côté serveur (la saisie joueur est normalisée de la même
// façon). La liste couvre volontairement les combinaisons fréquentes :
// "tion", "ment", "eur", "an", "oi", "ou", "pr", "tr", "bl", "gr", "ch",
// "ph", "qu", etc.
//
// Usage : node server/data/buildWords.js

import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const RAW = `
abandon abattre abdiquer abeille abimer abolir abonner aborder aboutir aboyer
abreger abriter absence absolu absorber abstrait absurde abuser academie
acajou acceder accent accepter acces accident acclamer accord accrocher accueil
accuser acheter achever acide acier acquerir acrobate acteur action active
actuel adapter addition adepte adhesion adieu admettre admirer adopter adorer
adresse adroit adulte adverbe affaire affamer affiche affirmer affreux agacer
agence agenda agir agiter agneau agreable agresser agricole aider aiguille
aimable aimer ainsi aisance ajouter alarme album alcool alerte algebre aliment
allee aller allonger allumer allure alors alpage alphabet alterner amande amateur
ambiance ambition ameliorer amener amertume amical amitie amour ample ampoule
amuser ananas ancetre ancien angle angoisse animal annee annoncer annuel anomalie
anonyme anormal antenne anxieux apaiser apercu aplatir apparaitre appareil appel
appetit applaudir apporter apprendre approche appui apres aptitude aquarium arbitre
arbre arcade ardeur arene argent argile aride armature arme armoire aromate arracher
arranger arret arriere arriver arrondir arroser article artisan artiste ascenseur
asile aspect asperge assaut assemble asseoir assez assiette assister associer assurer
asthme astuce atelier athlete atmosphere atome atout attache attaque atteindre attendre
attentif attirer attitude attraper aubaine auberge aucun audace augmenter aujourd
aumone auparavant auquel aurore aussi autant auteur autobus automne autorise autour
autre autruche avaler avance avant avantage avenir aventure averse aveugle avion
aviron aviser avocat avoir avouer avril azote azur babiole bagage baguette baigner
baisser balade balance balayer balcon baleine ballon banane bandeau banlieue banque
baptiser barbe barque barrage barriere basilic basket bassin bataille bateau batiment
batir baton battre bavard beaute bebe bedaine beignet belette belier belle benevole
benir berceau berger besoin betail betise beton beurre biberon bibelot biceps bicarbon
bidon bijou bilan billard billet biologie biscuit bisou bizarre blague blanc blason
blesser bleu bloquer blottir blouse bobine bocal boire boisson boite bolide bonbon
bond bondir bonheur bonjour bonte bord border botte bouche boucle boue bouger bougie
bouillon boulanger boulet boulon bouquet bourdon bourse bousculer boussole bouton
boxeur boyau bracelet braise brancher branche braquer bras brasier brave brebis breche
bredouille bref bretelle breve bricoler bride brigade brillant brindille brique briser
brocante broche bronze brosse brouette brouillard broyer bruit brulant bruler brume brun
brusque brutal bruyant budget buffet buisson bulle bureau burin buste butin cabane cabine
cable cacao cacher cactus cadeau cadran cadre cafard cafe cage cagnotte cahier caillou
caisse calcul calecon calendrier caleche caler calibre caline calmant calme calorie
camarade cambouis camera camion campagne canal canard candeur canette canevas canif
caniveau canne canoe cantine canular caoutchouc capable cape capitaine caprice capsule
capter captif capture caracole carafe caramel caravane carbone carcasse cardinal caresse
cargaison caribou carie carnaval carotte carre carreau carrefour carriere cartable carton
cascade casier casino casque casser casserole castor catalogue cataracte cathedrale cause
caution cavalier caverne caveau ceder cedille ceinture celebre celibataire cellule cendre
censurer cent centaine centre cependant cercle cereale cerf cerise cerne certain cerveau
cesser chaine chair chaise chaleur chambre chameau champ chance chandail changer chanson
chantier chaos chapeau chapitre chaque charbon charge chariot charmant charpente charrette
chasse chataigne chateau chaton chatouille chaud chauffer chaussure chauve chavirer chef
chemin cheminee chemise chene chenille cheque chercher cheri cheval chevre chevreuil chez
chiffon chiffre chimie chiot choc chocolat choeur choisir choix chomage chose chouette
chrome chronique chuchoter chute cible cidre ciel cigale cigare cigogne cimetiere cinema
cinquante circuit cirer cirque ciseaux citadelle citer citoyen citron civet civil clair
clameur clan claque clarinette classe clavier clef clemence client cligner climat clinique
clochard cloche cloison cloitre cloporte clore clou clouer clown coaguler cobaye cocarde
cochon cocon cocotte code coeur coffre cogner coiffer coin coincer colere colibri colis
collant colle collegue collier colline colombe colonel colonne colorier colosse combat
combien combiner comble comedie comestible comique commander comme commencer comment commerce
commun compact comparer compas compete complet complice composer comprendre compresse
compromis compter comptoir comte concert concevoir conclure concombre concours concret
condamner condition conduire confiance confier confit conflit confondre confort confus
congeler conge conjoint connaitre conquerir consacrer conscience conseil consentir conserve
considerer consister consoler consommer constat construire consulter contact conte contenir
content conter contexte continu contour contraire contraste contrat controle convaincre
convenir copain copeau copie coquille corail corbeau corde cordon corne cornichon corolle
corps correct corriger cortege corvee costaud costume cote coton couche coude couler couleur
couloir coup coupable couper couple courage courant courbe coureur courge courir couronne
courrier cours court couteau couter coutume couture couvercle couvert couvrir crabe cracher
craie craindre crampe crane crapaud craquer cratere cravate crayon creature creche credit
creer creme creneau crepe crepuscule cresson creuser crevasse crevette crible cric crier
crime crinière criquet crise cristal critique crochet crocodile croire croisade croissant
croquer crotte croute cruche cruel crustace cube cueillir cuillere cuir cuisine cuisse
cuivre culotte culture cumin cure curieux cuve cyclable cygne cymbale dactylo daigner
dalle damier danger danser datte dauphin debat debit deborder debout debris debrouiller
debut decembre decevoir dechet dechirer decider declarer decliner decor decouper decouvrir
decrire dedaigner dedans dedier defaire defaut defendre defi defiler definir deformer
degager degat degel degout degre deguiser dehors dejeuner dela delai delice delicat delier
delivrer deluge demain demander demarrer demeler demeurer demolir demon demonter dent depart
depasser depenser deplacer deplier deposer depuis deranger dernier derober derriere desert
desespoir desir desordre dessert dessin dessous dessus destin detacher detail detendre detenir
detester detour detruire dette deuil devancer devant devenir deviner devoir devorer diable
diametre dicter diete dieu different difficile digerer digne diluer dimanche diminuer dinde
diner dingue diplome dire direct diriger discret discuter disjoncter disparaitre disperser
disposer dispute disque distance distinct distraire divan diverger divin diviser docile docteur
document dodu doigt dolent domaine domicile dominer dompter donc donjon donner dorer dormir
dorsal dortoir dossier doter douane double doubler douceur doudoune doue douleur doute doux
douzaine dragon drainer drame drap dresser dribble drogue droit drole dur durant durcir durer
duvet dynamite eau ebene eblouir ecaille ecarter echange echapper echarpe echec echelle echo
eclair eclat eclipse eclore ecluse ecole economie ecorce ecouter ecran ecraser ecrire ecrou
ecume ecureuil ecurie edifice eduquer effacer effaroucher effectif effigie effort effrayer
egal egard egayer eglise egoute egratigner elan elargir electron elegant element elephant
eleve elever elire eloge eloigner elu emaner embarquer embaucher embellir emblee embraser
emerger emietter emission emmener emotion emousser emparer empattement empecher empereur empire
emploi emporter empreinte emprunter encadrer enchanter encolure encore endive endormir enduire
endurer energie enfance enfant enfer enfin enfler enfoncer enfouir enfuir engager engin englober
engloutir engrais enigme enjamber enlacer enlever ennemi ennui enorme enquete enraciner enregistrer
enrichir ensemble ensuite entamer entasser entendre enterrer entete entier entonnoir entourer
entrain entraver entre entree entrer entretien enveloppe envers envie environ envoler envoyer epais
epargne eparpiller epaule epeler eperon epi epice epinard epine epique epitre eplucher eponge epoque
epoux epreuve eprouver epuiser equipe equiper erable errer erreur eruption escabeau escalade escalier
escargot esclave escorte espace espadon especes esperer espion espoir esprit esquive essai essaim
essayer essence essieu essor essuyer estampe estime estomac estuaire etable etablir etage etagere
etalage etaler etang etat etau ete eteindre etendre eternel eternuer ethique etincelle etiquette
etoffe etoile etonner etouffer etourdir etrange etranger etre etrenne etreindre etrier etroit etude
etui euphorie evader evaluer evanouir evaporer eveil eveiller evenement eventail eventuel evidence
eviter evoluer evoquer exact examen exaucer exceder exceller excentrique excepter exces excité exclure
excursion excuse executer exemple exercer exhaler exhiber exiger exiler exister exode exotique
expedier experience expert expirer expliquer exploit explorer exploser exporter exposer exprimer
expulser exquis extase exterieur extraire extreme fable fabriquer facade face facette fache facile
facon facteur faculte fade fagot faible faille faim faire faisan faite falaise falloir fameux familier
famine fanal fanfare faner fanfaron fanion fantaisie fantome faon farce fardeau farine farouche fascine
fatal fatigue faubourg faucher faucon faufiler faune fausse faute fauteuil fauve faveur favori febrile
feconder federer fee feindre feinte feler felicite felin femelle feminin femme fendre fenetre fente fer
ferme fermer fermeture feroce ferraille ferrer fertile fervent fesse festin fete feuillage feuille feutre
fevrier fiable fiancer ficelle fiche fidele fier fievre figer figue figure fil filament file filer filet
filiere film filon fils filtre final finance finesse finir fiole firme fixer flacon flair flamant flambeau
flamme flanc flaner flanquer flaque flatter fleau fleche flechir fletrir fleur flocon flore flot flotte
fluide flute foie foin foire fois folie foncer fonction fond fondre fontaine football force foret forfait
forge formel former formidable formule fort fortune fosse fossile fou foudre fouet fougere fouille fouiner
foulard fouler four fourbe fourche fourchette fourmi fournir fourrer foyer fracas fraction fragile fragment
frais fraise framboise franc franchir frange frapper fraude frayeur fredonner frein frelater frequenter
frere fresque fretiller friand fric friche frigo frimer frire frise frisson frite froid froisser frole
fromage froment froncer fronde front frontiere frotter fructueux frugal fruit fugace fugitif fuir fumee
fumer funebre funeste fureur furie furtif fusee fuselage fusil fusion futur gabarit gable gachette gacher
gadget gaffe gage gagner gai gaine galant galaxie galerie galet galette galon galop gamin gamme gant garage
garantie garcon garder gare garer garnir gaspiller gateau gater gauche gaufre gaule gaz gazelle gazon geai
geant geler gemir gencive gendarme gene general genereux genese genie genou genre gens gentil geometrie gerant
gerbe germe geste geyser gibier gicler gifle gigot gilet girafe giron givre glace glacon glaise gland glissade
glisser globe gloire glouton gobelet goeland golfe gomme gond gondole gonfler gorge gosier goudron gouffre
goujon goulot gourde gourmand gousse gout goutte gouvernail gouverner grabuge grace gradin grain graisse
grammaire grand grange granit graphique grappe gras gratin gratter gratuit grave gravier gravir gravure gre
gredin greffe grele grenade grenier grenouille gresil greve gribouiller griffe grignoter gril grillage grille
grimace grimper grincer griotte grippe gris grisaille grive grogner gronder gros grossir grotesque grotte
groupe grue grumeau gruyere gue guepard guepe guere gueridon guerir guerre guet gueule guichet guide guidon
guigne guirlande guitare gymnase habile habit habiter habitude hache hagard haie haillon haine hair haleine
haleter halle halte hameau hamac hangar hanter happer harceler hardi hareng hargne haricot harmonie harnais
harpe hasard hate hausse haut havre hebdomadaire heberger hectare heler helice helicoptere hemisphere herbe
herisson heritage hermine heroique heron heros hesiter hetre heure heureux heurter hibou hideux hier histoire
hiver homard hommage homme honnete honneur honte hopital hoquet horaire horde horizon horloge horreur hospice
hostie hotel hotte houblon houle hourra housse hublot huche huer huile huit humain humble humeur humide
humilier humour hurler hutte hydrate hygiene hymne hypnose iceberg icone idee identite idiot idole ignorer
ile illuminer illusion ilot image imaginer imberbe imbiber imiter immense immeuble immobile immortel impair
impasse impatient impeccable imperial implorer importer imposer imprimer improviser impulsion inactif inattendu
incendie incident inciter incliner inclure incolore incomplet inconnu indecis indice indigne individu indolent
inedit inegal inerte inexact infame infect inferieur infini infirme inflammer influence informer ingenu ingrat
initier injecter injure injuste innocent innover inonder inquiet inscrire insecte inserer insigne insister
insolent inspecter inspirer installer instant instinct instruire insulte intact integre intellect intense
intention interdire interet interne interroger intervalle intime intrigue introduire intrus inutile invasion
inventer inverse investir inviter invoquer iode ironie irriter isard isoler issue ivoire ivre jacasser jachere
jadis jaillir jalon jaloux jamais jambe jambon janvier jardin jargon jarretelle jaser jasmin jauge jaune javelot
jersey jeter jeton jeu jeudi jeune joaillier joie joindre joker joli jonc jongler jonquille joue jouer jouet
joufflu joug jouir jour journal joute jovial joyau joyeux jubiler judo juge jugeote juillet juin jumeau jument
jungle junior jupe jupon jurer jus jusque juste justice juteux kaki kangourou karate kayak kepi kermesse kilo
kiosque klaxon koala labeur labo laborieux labour labyrinthe lac lacer lacet lache lacune lagune laine laisse
lait laitue lambeau lambris lame lamelle laminer lampe lance lancer landau lande langage langoureux langouste
langue lanterne lapin laque larcin lard large largeur larme larve lasser latte laureat lavabo lavande laver
lecon lecteur lecture legal legende leger legume lendemain lent lenteur lentille leopard lequel lessive leste
lettre leurre lever levier levre levure lexique liane liasse liberer liberte libre licence licorne lien lier
lierre lieu lievre ligne ligoter limace limande lime limite limon limpide linceul linge lingot lion liquide
lire lisible lisiere lisse liste lit litige litre livide livre lobe local locomotive loge logique loi lointain
loir loisir long longer longueur lopin loque lorgner lors losange loterie louange louche loueur loup loupe lourd
loutre louve loyal loyer lucarne lucide lueur luge luire lumiere lundi lune lunette lustre luth lutin lutte luxe
luxueux lycee macaron mache machine machoire macon madame mademoiselle magasin magie magique magnetique magnifique
maigre maille maillot main maintenir maire mairie mais maison maitre majeur majorite malade maladroit malaise male
malheur malice malle maltraiter mamelon maman mammifere manche mandarine manege manette mangeoire manger maniaque
manie maniere manifester manipuler manivelle mannequin manoir manquer manteau manuel manuscrit maquette maquiller
marais marbre marchand marche mardi mare marecage marelle marge marguerite mari marin marmite marmotte maroquin
marquer marraine marron marteau martien martyr masque masse massif mastic mat match matelas materiel maternel
matiere matin maturer maudire maussade mauvais maximum mazout mecanique mechant meche medaille medecin medical
meduse mefiance meilleur melange melodie melon membrane membre meme memoire menace menacer menager mendier mener
mensonge mensuel menthe mention menton menu mepris mer mercredi mere merguez meridien merite merle merveille
mesange mesaventure mesquin message messager mesure metal meteo methode metier metrage metre mettre meuble meugler
meurtre meute miauler microbe midi miel miette mieux mignon migraine migrer mijoter milieu militer mille millier
mime mimique mince mine mineral minet mineur minime ministre minou minuit minute miracle mirage mire miroir mise
miser misere missile mission mite mitiger mitraille mixer mixte mobile mode modele moderne modeste moelle moeurs
moindre moine moineau moins mois moisson moite moitie molaire molecule mollet moment momie monarque monastere monde
moniteur monnaie monocle monopole monotone monsieur monstre montagne montant monter montre montrer monture monument
moquer moquette moral morceau mordre morne morose mort morue mosaique motel moteur motif motiver moto motte mouche
moucheron moudre moue mouette moufle mouiller moule moulin mourir mousse moustache moustique moutarde mouton mouvant
mouvement moyen muet mufle mugir muguet mulet multiple munir mur muraille mure murmure muscade muscle museau musee
museler muselière musique mutiler mutin myrtille mystere nacre nageoire nager naguere naif nain naissance naitre
nappe narguer narine narrer naseau natation nation natte naturel naufrage nausee navet navette naviguer navire
nebuleux necessaire nectar nef nefaste negliger negocier neige nenuphar nerf nerveux nettoyer neuf neutre neveu
nez niche nicher nid niece nier nigaud niveau noble noce nocif noeud noir noisette noix nom nombre nombril nommer
nonante nonchalant nord normal note notice notre nouer nougat nourrir nouveau novembre novice noyade noyau noyer
nuage nuance nuee nuire nuisible nuit nul nullite numero nuque oasis obeir objecter objet obliger obscur obseder
observer obstacle obstine obtenir obus occasion occidental occire occuper ocean ocre octobre octogone oculaire odeur
oeil oeuf oeuvre offense office officier offrir ogre oie oignon oiseau oisif olive ombre omettre omoplate once oncle
onctueux onde ondoyer ongle onze opaque opera operer opinion opportun opposer oppresser opter optimiste opulent
oraison orange orateur orbite orchestre ordinaire ordinateur ordonner ordre oreille organe orge orgue orgueil orient
originaire orme ornement orner orphelin orteil ortie orvet os oser osier ossature otage oter ouate oubli oublier
ouest ourdir ourlet ours outil outrage ouvert ouvrage ouvrier ouvrir ovale ovni oxygene pacte page paille pain pair
paisible paitre paix palace palais palme palmier palper paludier pamplemousse pancarte panda panier panique panne
panneau panorama pantalon panthere pantin pantoufle paon papa papier papillon paquebot paquet parabole parachute
parade paradis parages paragraphe paraitre parallele parapluie parasol paratonnerre paravent parc parchemin pardon
pare pareil parent paresse parfait parfois parfum pari parier paroi paroisse parole parquet parrain part parterre
parti partir partout parure parvenir pas passage passer passion passoire pastel pasteque pastille patate pataud
pate patente patient patin patois patrie patron patrouille patte paturage paume paupiere pause pauvre pave pavillon
pavot payer pays paysage peage peau peche pecher pecheur pedale pediatre peigne peindre peine peintre pelage peler
pelican pelle pellicule pelouse peluche pencher pendant pendre penible peniche pensee penser pension pente pepin
pepite percer perceval percher perdre perdrix pere perfide peril periode perir perle permettre perroquet perruche
perruque persil persister personne perte peser peste petale petard petillant petit petrir petrole peuple peuplier
peur phare pharmacie phase phenomene philosophe phobie phoque photo phrase physique piano pic piece pied piege pierre
piete pieton pieu pigeon pilier piller pilote pince pinceau pingouin pintade pioche pion pipe piquant pique piqure
pirate pire piscine pissenlit piste pistolet pivert pivoine pivoter pizza placard place placer plafond plage plaie
plaindre plaine plainte plaire plaisir plan planche plancher planer planete plant plante plaque plastique plat plateau
platine pleurer pleuvoir pli plier plisser plomb plonger pluie plumage plume plupart pluriel plusieurs plutot pluvieux
pneu poche poele poeme poesie poete poids poignard poigne poignet poil poindre poing point pointe poire poireau poison
poisson poitrine poivre polaire police polir poltron pomme pommier pompe pompier ponctuel pondre poney pont populaire
porc porche portail porte porter portion portrait poser position posseder possible postal poste pot potable potage poteau
potion pou pouce poudre poulailler poulain poule poulet poulpe pouls poumon poupee pour pourrir poursuivre pourtant
pousser poussiere poutre pouvoir prairie pratique pre preavis precaution precieux precis predire prefere prelever premier
prendre prenom preparer pres presage prescrire presence present preserver presque presser pression preter pretexte
pretre preuve prevenir prevoir prier primaire prime primeur prince principe printemps priorite prise prison priver
privilege prix probable probleme proceder prochain proche proclamer prodige produire profane profil profit profond
programme progres proie projet prolonger promener promesse promettre promouvoir prompt prone pronom prononcer propager
propre proposer propriete prose prospere protege proteine protester prouesse prouver provenir province provoquer proximite
prudent prune psaume pseudonyme public publier puce pudeur puis puiser puissant puits pull pulpe pulser punaise punir
pupille pupitre pur puree pureté purger puzzle pyjama pylone pyramide quadrille quai qualifier qualite quand quantite
quarante quart quartier quasi quatorze quatre quelconque quenouille quereller question quete queue quiconque quille
quincaillerie quinquennat quinte quintette quinze quitter quoi quotidien rabais rabattre raboter raccourci racine raclette
raconter radar radeau radieux radin radio radis radoter rafale raffermir raffiner rafle rafraichir rage rai raideur
raie raifort rail raisin raison raler rallier rallonge rallye ramage ramasser rame rameau ramener ramer ramper rance
rancon rancune randonnee rang rangee rapace rapide rappel rapporter rapprocher rare raser rassurer rat rateau ration
ratisser raton rattacher rature rauque ravage ravir raviser ravissant ravitailler rayer rayon rayonner rayure reaction
realiser rebelle rebondir rebord rebut recapituler recel receler recensement recette recevoir rechauffer recherche
recif recipient reciter reclamer recolter recommander recompense reconnaitre record recoudre recourir recouvrir recreation
recruter rectangle recueillir reculer recuperer redaction reddition redevable rediger redire redoubler redouter redresser
reduire reel reflechir reflet reflexe reforme refrain refuge refuser regaler regard regime region regir regle regne
regret regulier rehausser rein reine rejeter rejoindre relacher relais relancer relater relever relier religion remarque
rembourser remede remettre remise remonter remords remorque remous rempart remplacer remplir remporter remuer renard
rencontre rendre renfort renier renne renom renoncer renover renseigner rente rentrer renverser renvoyer repaire reparer
repas repasser repere repeter replier replonger repondre report repos repousser reprendre representer reproche reptile
republique repugnant reputation requin requin reseau reserve resider resigner resine resister resoudre respecter respirer
resplendir responsable ressembler resserrer ressort ressource restaurer reste rester resultat resumer retablir retard
retenir retentir retirer retomber retordre retoucher retour retrait retraite retrouver reunion reunir reussir reve reveil
reveiller revele revendre revenir rever reverbere revers revetir reviser revivre revoir revolte revolu revue rez rhubarbe
rhum rhume ricaner riche richesse ride rideau ridicule rien rieur rigide rigole rigoler rigueur rime rincer ringard riposte
rire risee risque ristourne rite rituel rivage rival riveter riviere riz robe robinet robot robuste roc roche rocher rodeo
roder rogner roi role roman romarin rompre ronce rond ronde ronfler ronger ronron rosace rose roseau rosee rosier rossignol
rotation roter roti rotule rouage roucouler roue rouer rouge rougir rouille rouleau rouler roulotte route routier rouvrir
royal royaume ruban rubis ruche rude rudiment rue ruelle ruer rugir rugueux ruine ruisseau rumeur ruminer rupture rural ruse
rustique rythme sable sabot sabre sac sachet sacre sacrifice safran sage saigner saillie sain saint saisir saison salade
salaire sale saler salir salive salle salon saluer salut salve samedi sanction sandale sandwich sang sangle sanglier
sanglot sanguin sans sante saoul saper sapeur sapin sardine satin satire satisfaire sauce saucisse sauf sauge saumon saur
saut sauter sauterelle sauvage sauver savane savant saveur savoir savon savourer saxophone scarabee sceau scene sceptre
scie science scinder scintiller scion scolaire score scorpion scrupule sculpter seance seau secher second secouer secourir
secret secteur section seculaire securite sediment seduire segment seigle seigneur sein seize sejour selle selon semaine
semblable sembler semelle semer semestre semoule senat sentier sentir separer septembre sequence sequoia serein sergent
serie serieux serin seringue serment sermon serpent serre serrer serrure servante service servir serviette seuil seul seve
severe sevir shampoing siecle siege sieste siffler sigle signal signe signer silence silhouette sillage sillon silo simple
simuler sincere singe singulier sinistre sinon sirene sirop sismique site situer six sixieme ski slogan smoking sobre social
societe socle soeur soie soif soigner soin soir soiree soit sol solaire soldat soleil solennel solide soliste solitaire
solliciter solo soluble solution sombre sommaire somme sommeil sommet somnoler son sonate sondage songe songer sonner sonore
sorbet sorcier sort sortie sortir sosie sot sottise sou souche souci soucoupe soudain souder souffle souffrir souhait souiller
soulager soulever soulier souligner soumettre soupape soupcon soupe souper soupir souple source sourcil sourd souriceau sourire
souris sournois sous soustraire soutane soutenir souterrain soutien souvenir souvent souverain soyeux spacieux spatial speaker
special spectacle sphere spirale splendeur sport square squelette stable stade stage stagner stalle standard star station statue
stature steak stencil step stere sterile stimuler stipuler stock stop store strict strophe structure studio stupeur style stylo
subir subit sublime submerger substance subtil suburbain succeder succes succint sucer sucre sucrer sud suer suffire suffoquer
suggerer suie suif suinter suite suivre sujet sulfure superbe superflu superieur superviser supplier supporter supposer
supprimer supreme sur sureau surete surface surfer surgir surmonter surnom surpasser surplomber surprendre surveiller survie
survivre survoler suspect suspendre svelte syllabe symbole sympa symphonie symptome syndic synonyme syntaxe syrop systeme tabac
table tableau tablier tabou tabouret tache tacher tacite tact tactique taie taille tailler taire talon talus tambour tamis
tandis tanguer taniere tanin tante taon tapage tape tapir tapis tapisser taquiner tarder tarif tarir tarte tartine tas tasse
tasser tater tatouer taudis taupe taureau taux taverne taxe teck teindre teinte telephone televiseur temoin tempe tempete temple
tempo temps tenace tenailler tendance tendre tenebre tenir tennis tension tentacule tentative tente tenter tenu tepide terme
terminer terne terrain terrasse terre terreur terrible terrier territoire terroir tesson teter tete tetine texte texture thé
theatre theiere theme theorie theory thermos these thon thorax thym tiare tic ticket tiede tien tiers tige tigre tilleul timbre
timide tintamarre tinter tique tirer tiret tiroir tisane tison tisser tissu titre toast toboggan tocsin toge toile toilette
toit tole tolerer tomate tombe tomber tome ton tondre tonique tonneau tonnerre topaze toque torche tordre tornade torpille
torrent torse torsion tort tortue torturer total touche toucher touffe toujours toundra toupie tour tourbe tourbillon tourment
tournant tournee tournesol tourner tournevis tournoi tourterelle tousser tout toux toxine trace tracer tract tracteur tradition
trafic tragique trahir train traineau trainer trait traiter traitre trajet tramer tranche trancher tranquille transformer
transit transmettre transpercer transport trappe traquer travail travers traverser trebucher trefle treille treize trembler
tremper trente tresor tresser treve triage triangle tribu tricher tricot trier trimer tringle triomphe triple triste trognon
trois trombone tromper tronc trone troquer trot trotter trottoir trou trouble troupe troupeau trousse trouver truc truelle
truffe truie truite truquer tuba tube tuer tuile tulipe tunnel turban turbine turbot tutelle tuteur tuyau tympan type typique
tyran ulcere ultime ululer unanime uni unifier uniforme union unique unir unite univers urbain urgent urne usage user usine
usité ustensile usuel usure usurper utile utiliser utopie vacance vacarme vaccin vache vagabond vague vaillant vaincre vaisseau
vaisselle val valable valet valeur valider valise vallee valoir valse vampire vandale vanille vanite vanne vanter vapeur
vaporiser vaquer varech variable varier vase vaseux vaste vautour veau vedette vegetal vehicule veille veiller veine velin velo
velours velu venaison vendre vendredi venelle venerer vengeance venimeux venir vent vente ventre ver verbe verdir verdure verger
verglas vergogne vergue verifier veritable verite vermeil vermine vernir verre verrou vers verser verset version vertebre vertige
vertu verveine vespasienne veste vestige vetement veterinaire vetir veto vetuste veuf veuve vexer viable viaduc viager viande
vibrer vicaire vice victoire victuaille vide vidoir vie vieillir vierge vieux vif vigie vigne vigueur vil vilain village ville
vinaigre vingt violer violet violon vipere virage virer virgule viril virtuel virus vis visage viser visible vision visiter
visiteur visqueux visser visuel vital vitamine vite vitesse viticole vitrail vitre vivace vivant vivement vivifier vivre
vocable vocal vocation voeu vogue voici voie voila voile voir voisin voiture voix vol volage volaille volant volcan voler volet
voleur volige volley volonte volume voluptueux volute vomir vorace votant vote voter votre vouer vouloir voute voyage voyager
voyelle voyou vrac vrai vrille vrombir vue vulgaire vulnerable wagon week xenon xerox xylophone yacht yaourt yeux yoga yogourt
yourte zapper zebre zele zenith zephyr zeste zigzag zinc zizanie zodiaque zonage zone zoo zoom
`

// Découpe, nettoie, filtre par longueur (4-15), déduplique et trie.
const words = [
  ...new Set(
    RAW.split(/\s+/)
      .map((w) =>
        w
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .toLowerCase()
          .replace(/[^a-z]/g, '')
      )
      .filter((w) => w.length >= 4 && w.length <= 15)
  )
].sort((a, b) => a.localeCompare(b, 'fr'))

writeFileSync(
  join(__dirname, 'words_fr.json'),
  JSON.stringify(words, null, 0),
  'utf-8'
)

console.log(`✅ words_fr.json : ${words.length} mots`)
