# Construction du village touristique polynésien

Plan validé le 1er octobre 2026. Référence visuelle : image « Village touristique des îles du Pacifique » fournie dans la conversation. Il s'agit d'une scène Three.js navigable inspirée de la référence, avec des éléments procéduraux et les assets existants.

## 1. Analyse du projet et décisions retenues

Le projet utilise Three.js r169 fourni localement, des modules JavaScript natifs et `serve.py`. Les maps partagent `index.html`, le HUD et les contrôles. Un paramètre `?map=…` sélectionne le module principal ; les déplacements entre maps utilisent un fondu puis une nouvelle URL.

| Système existant | Réutilisation prévue |
|---|---|
| `jungleLayout.js` : terrain analytique et API de sol | Même principe dans `resortLayout.js` : terrain, eau, végétation et contrôleur lisent les mêmes hauteurs |
| `jungleTerrain.js` : matériau procédural | Extraire le grain et les détails dans `islandTerrainMaterials.js` ; garder le terrain de la cascade |
| `jungleOcean.js`, `oceanSurface.js` | Layout et preset resort ; dimensions des maillages configurables, défauts jungle conservés |
| `jungleVegetation.js` | Réutiliser géométries, textures Canvas, vent et instancing ; ajouter un placement de jardins à limites configurables |
| `marineLife.js` : île volcanique | Extraire les hauteurs sans changer les paramètres du paquebot |
| `Controller`, `Input`, `CameraRig`, `Player` | Contrôles existants ; capacité de nage optionnelle et pose procédurale |
| Pose allongée et caméra de repos | Hamac interactif, point de retour sûr |
| Tests Python/Playwright et `.mjs` | Parcours réels, contrats du layout, captures et compteurs de rendu |

La même île est représentée par plusieurs scènes locales ; elle n'est pas un terrain global chargé simultanément. La tenue `swim` existante ne constitue pas une animation de nage. Le placement de végétation et les dimensions d'écume avaient encore des limites propres à la jungle. Les collisions orientées du resort doivent utiliser une géométrie précise, pas la seule boîte englobante de leurs diagonales.

### Périmètre validé

- 12 bungalows sur pilotis, dont 3 suites avec piscine privée.
- 6 bungalows-jardin et 4 bâtiments centraux : accueil, restaurant, bar et galerie Matisse.
- Tous les bungalows sont visitables ; portes ouvertes et intérieurs simples.
- Accès depuis la promenade tropicale et depuis le menu. Débarquement du paquebot inchangé.
- Jour, coucher de soleil et nuit sélectionnables ; transition de 3 secondes, sans horloge automatique.
- Marche dans les faibles profondeurs et nage en surface dans le lagon et les piscines ; pas de plongée.
- Hamac, transat, lit et banquette intérieure du bungalow réservé interactifs ; meubles des autres bungalows et pirogues décoratifs.
- Pas de nouvelle dépendance ni achat ; seules les sept reproductions officielles Open Access de la galerie sont téléchargées et servies localement.

## 2. Implantation et construction visuelle

### Géographie et accès

Le resort occupe une baie protégée à l'ouest de l'anse forêt/cascade. Le secteur est reste réservé au futur village indigène. `islandGeography.js` décrit les secteurs et les connexions sans imposer leurs coordonnées locales à une scène unique.

Convention : mer vers −Z, terre vers +Z. Zone jouable d'environ 340 × 280 m. Accueil à l'arrivée terrestre, restaurant et bar sur la plage ; avenue de sable de 3 m desservant les jardins. Deux pontons courbes desservent chacun six bungalows en épi. Les suites occupent les emplacements les plus dégagés. Trois motus décoratifs sont hors de la zone parcourable.

Une branche de sentier quitte la promenade près de la lisière ouest. Un panneau et l'action E conduisent à `index.html?map=resort&arrival=jungle&time=…`, avec fondu de 650 ms. Le retour arrive hors du déclencheur, orienté vers la promenade. Les capacités de toile sont désactivées uniquement dans le resort.

### Galerie Matisse

Le bungalow-galerie `matisse-gallery` occupe x = 12, z = 60, face à MAEVA, avec un deck à 2,25 m, une terrasse de 2,5 m et un chemin réservé depuis l’avenue. Il présente sept reproductions locales de Matisse dans le domaine public, des cartels et un banc, sans HUD ni nouveaux PNJ. Les murs pleins possèdent une ventilation haute et une entrée de 2,2 m. À partir de 55 m, les cadres et le banc utilisent un matériau simplifié ; les tableaux restent visibles. Le restaurant conserve son propre LOD à 60 m et ses visiteurs. Sources et crédits : `textures/resort-matisse/CREDITS.md`.

Vérification : `.venv/bin/python tests/resort_gallery.py`, puis la même commande avec `--headed` pour le GPU réel, et les régressions du village et du restaurant.

### Terrain et lagon

Le layout est l'unique source des hauteurs et profondeurs. Côte doucement courbe, plage blanche en pente douce, bord d'eau 0–0,8 m, baignade 1,2–2,5 m, fonds des bungalows peu profonds et bleu profond au large (12–18 m). Les pontons sont à 1,35 m et disposent de rampes depuis la plage.

Preset initial : `waveScale=0.18`, turquoise clair → cyan → bleu profond ; alpha 0,25 → 0,92 sur environ 8 m de profondeur, normales et réflexion réduites, écume discrète. La profondeur JS et la profondeur GLSL concordent. La surface est coupée au rivage. Les piscines disposent de volumes distincts et de trous réels dans leurs terrasses.

Sable ondulé, rochers et trois familles de coraux instanciés, hors des accès à l'eau. Caustiques animées dans les matériaux immergés, atténuées avec profondeur et heure. Pas de passe supplémentaire de réflexion ou de réfraction.

### Architecture et pontons

Composants réutilisables : pilotis, poutres, planchers, murs de bois avec ouvertures, toiture pyramidale quatre pans, terrasse, rambardes, escalier et piscine.

| Variante | Chambre / terrasse | Équipement |
|---|---|---|
| Pilotis standard | 6 × 8 m / 6 × 4 m | Lit, canapé blanc, deux transats, fruits, escalier vers l'eau |
| Pilotis premium | 8 × 8 m / 8 × 5 m | Même base ; piscine 2,5 × 4 m |
| Jardin | 6 × 8 m / 6 × 3 m | Soubassement et marches adaptés au sol |

Toitures en couches de chaume, charpente et bordures irrégulières ; intérieur visible. Les bâtiments centraux réemploient cette bibliothèque à une échelle supérieure.

Pontons Catmull-Rom, segments courts, largeur 2,8 m et branches 1,8 m, pilotis environ tous les 3 m. Les raccords aux bungalows gardent des ouvertures dans les rambardes. Marches de 20–25 cm. La géométrie et les surfaces marchables utilisent le même tracé. Les composants sont instanciés par secteur et matériau, sans mesh par planche.

### Mobilier, jardins et matériaux

Transats bois/toile blanche, canapés et coussins bleus, tables et fruits, lanternes, hamac courbe entre deux palmiers explicitement placés, deux pirogues à balancier flottant sur la même eau que le shader.

Réutiliser les cocotiers droits, penchés et courbes, buissons, fougères et plantes tropicales. Ajouter les hibiscus rouges/roses et laisser les vues sur le massif et le lagon ouvertes. Aucun végétal dans les empreintes bâties, chemins, rampes ou zones d'interaction. Tirages déterministes indépendants par système.

Réutiliser les textures `wood_diff`, `wood_n`, `wood_r` et `water_normal`. Chaume, tissu et fleurs procéduraux. Textures partagées, résolution maximale 1 024 px, UV du bois à l'échelle métrique.

Réglages après inspection de la référence : la transparence minimale est portée à 0,45, le fond est teinté selon la profondeur et les coraux sont regroupés en récifs plutôt qu'uniformément dispersés. Les profondeurs aux centres des bungalows sont comprises entre 1,59 et 2,57 m.

### Lumière et ciel

Soleil à ombre 2 048² suivant le joueur, hémisphérique et environnement PMREM existant. Ciel bleu, cumulus, brume lointaine sur le massif/motus ; ciel étoilé la nuit. Les presets pilotent soleil, ciel, eau, brume et lanternes ensemble.

Toutes les lanternes deviennent émissives ; six lumières locales sans ombres au maximum, autour du joueur. Au retour dans la jungle, `sunset` est conservé comme heure de voyage mais utilise son ambiance de jour. Une sélection explicite jour/nuit remplace cette valeur.

## 3. Modules et interactions

`main-RESORT.js` assemble la scène, le joueur, l'interface et la boucle. Les modules `resort*` séparent layout, terrain, eau, architecture, pontons, collisions, mobilier, piscines, végétation, ambiance, déplacement et interactions. `window.__resort` expose les éléments nécessaires aux tests et captures.

| Interface | Évolution |
|---|---|
| Layout resort | Hauteur, profondeur, rivage, sols, chemins, empreintes, arrivées |
| Océan partagé | Dimensions optionnelles de surface et d'écume ; défauts conservés |
| Végétation partagée | Région jardin configurable, palmiers explicites, réutilisation des primitives |
| Architecture/pontons | Surfaces marchables et colliders explicites, indépendants du LOD visuel |
| Contrôleur | Cinquième argument facultatif : `waterProbe`, `allowWeb` |
| Collisions | Boîtes orientées facultatives pour les primitives du resort |
| Personnage/caméra | Nage procédurale et caméra au-dessus de l'eau |
| Ambiance | `setResortTime('day'|'sunset'|'night')` |

Surfaces marchables : terrain, terrasses, pontons et marches. Obstacles : murs, rambardes, troncs, mobilier et piscines. Décor : feuillage, petits accessoires et coraux. Le sol bâti a priorité sur l'eau située dessous ; les murs ne deviennent jamais des sols. Les objets imbriqués fournissent leurs colliders explicitement.

Nage : entrée vers 1,2 m, sortie sous 0,95 m pour éviter les oscillations ; vitesse 2,2 m/s. Tête au-dessus de l'eau, mouvements horizontaux, collision avec pilotis et parois. Une chute dans l'eau passe en nage. Sortie par plage ou marches, pas à travers une paroi verticale. Limite de baignade avant le large. Piscines : profondeur de 1,35 m, surface calme et escalier dans une ouverture du rebord.

Hamac : E pour s'allonger ; E, espace ou déplacement pour se relever au point sûr. Échap conserve son rôle de pause. Un gestionnaire unique règle le repos et le voyage, et restaure caméra, vitesse et verrouillage du pointeur.

Réservation fixe : `PLAYER_BUNGALOW_ID = 'water-1'`, bungalow standard sur
l'eau, sans piscine, au premier embranchement ouest. La flèche 3D dorée
`player-bungalow-arrow` pointe vers son toit et oscille doucement depuis la
boucle de props. Le vacancier de cette chambre est omis. `bungalowLoungers()`
dans `resortFurniture.js` partage les positions de rendu et les points de pose,
d'approche et de sortie ; `PLAYER_LOUNGER` désigne le transat de droite.
E propose la pose assise, R la pose allongée, avec deux boutons accessibles.
E, espace, ZQSD/WASD ou le bouton de réveil replacent le joueur sur la terrasse.
Le prompt attend que le joueur quitte la zone avant de revenir. Priorité :
réveil, voyage, meuble intérieur le plus proche, transat réservé, hamac. Les états sont exposés par
`window.__resort.interactions`, la réservation par `window.__resort.layout`.
Les captures ciblées `scratch/resort_player_{bungalow,sit,lie}_*.png` sont
produites par `tests/resort_interactions.py` et restent hors du suivi Git.

Le lit et la banquette intérieure de `water-1` proposent **E** ou un clic pour
s'allonger ; **E**, espace, ZQSD/WASD ou « Se relever » restaurent le mode de
marche au point sûr sur le plancher. `getBungalowFurnitureAnchors()` partage
les positions locales et mondiales, orientations, hauteurs, poses et sorties
avec le rendu instancié. Les zones exigent le mode `ground`, la bonne hauteur
et une approche locale dans la chambre ; les 17 autres chambres restent
décoratives. Les états `bed-lie` et `bench-lie` réutilisent la pose `lie` sans
la modifier. La caméra de repos intérieur garde le regard orientable et
limite sa position à la chambre, sous le toit et au-dessus du plancher.
Les captures `scratch/resort_indoor_*.png` couvrent les deux poses, plusieurs
angles, les sorties et la nuit ; elles restent hors du suivi Git.

Validation du repos intérieur (3 octobre 2026) : les tests interactions,
mobilier, layout, marche et interface réussissent, y compris le transat,
le hamac et l'aller-retour jungle. Les huit captures intérieures ont été
inspectées : points de sortie dégagés, corps sur les coussins, orientations
correctes et interface lisible la nuit. Le cadrage de la banquette a été
corrigé pour voir l'assise plutôt que le dossier. Maximum intérieur :
171 appels / 658 347 triangles, ombres comprises. L'échec supplémentaire
de nage `pileBlocks` est reproduit avec les quatre modules originaux de
`HEAD`, avant cette évolution.

Vérification du 3 octobre 2026 : interactions, mobilier, layout, marche,
interface, touristes et galerie réussis. Les cinq captures ciblées (bungalow
jour/coucher/nuit, poses assise et allongée) ont été inspectées. Les 27 vues du
test visuel respectent le plafond : maximum 250 appels et 780 843 triangles,
ombres comprises. La flèche réutilise le culling des détails au-delà de 100 m.
Le test supplémentaire de nage échoue sur `pileBlocks` ; le même échec a été
reproduit avec les modules originaux de `HEAD`, avant cette modification.

## 4. Étapes courtes et testables

| Étape | Fichiers | Résultat attendu |
|---|---|---|
| 0 | Ce document, tests jungle existants | Référence initiale du relief et des contrôles |
| 1 | `main-RESORT.js`, `resortLayout.js`, `index.html` | Nouvelle map accessible depuis le menu |
| 2 | `islandGeography.js`, `islandTravel.js`, `main-JUNGLE.js` | Sentier et aller-retour avec fondu et heure conservée |
| 3 | `resortTerrain.js`, `islandTerrainMaterials.js`, `jungleTerrain.js` | Plage, jardins, fond ; matériaux partagés |
| 4 | `islandRelief.js`, `resortBackdrop.js`, `marineLife.js` | Massif et trois motus ; relief du paquebot préservé |
| 5 | `resortLagoon.js`, `jungleOcean.js` | Eau claire et profondeur cohérente |
| 6 | `resortCorals.js` et terrain | Coraux et caustiques |
| 7 | `resortMaterials.js`, `resortArchitecture.js`, `resortGeometry.js` | Bungalow complet et visitable |
| 8 | `resortBoardwalks.js`, `resortCollision.js` | Pontons courbes, rampes, raccords et escaliers |
| 9 | Architecture/layout | 18 bungalows et 3 bâtiments centraux |
| 10 | `resortProps.js`, `resortPools.js` | Mobilier, piscines, hamac et pirogues |
| 11 | `resortVegetation.js`, `jungleVegetation.js` | Jardins fleuris et cocotiers |
| 12 | `resortMovement.js`, contrôleur, personnage, caméra | Nage et sorties d'eau fonctionnelles |
| 13 | `resortInteractions.js` | Repos et retour forêt sans conflit |
| 14 | `resortAtmosphere.js`, interface | Jour/coucher/nuit et lanternes |
| 15 | Tests resort, culling, README | Captures, parcours complets et mesures |

## 5. Performance et acceptation

Objectifs : 180 appels / 600 000 triangles sur une vue courante, plafond 250 / 800 000 sur les poses les plus chargées, ombres comprises. Ratio de pixels ≤1,5. Sur le GPU réel : viser 45 FPS et minimum 30 FPS à 1 920 × 1 080. Le rendu logiciel Playwright ne constitue pas une mesure FPS de la machine cible.

Instancing et culling par secteur ; plantes en tuiles, tailles ajustées au budget (32–64 m). Toits détaillés près du joueur, simplifiés à distance ; mobilier masqué loin, collisions conservées. Terrain plus grossier au large, petits accessoires sans ombres, faible nombre de surfaces transparentes.

Tests : `resort_layout.mjs/.py`, `resort_walk.py`, `resort_swim.py`, `resort_interactions.py`, `resort_ui.py`, `resort_visual.py`. Vues : arrivée, lagon, massif, jardins, bungalow standard, suite/piscine et hamac, aux trois heures.

Critères : tous les bungalows atteignables ; aucun trou ou passage fermé aux raccords ; rambardes et parois solides ; piscine séparée du lagon ; nage et escaliers fonctionnels ; hamac réversible ; heure conservée ; pas d'asset absent ou erreur shader ; une seule boucle de rendu ; limites graphiques respectées. Rejouer les tests jungle et contrôler plage/paquebot après les modifications partagées.

## 6. Construction réalisée et vérification

La map est disponible à `index.html?map=resort`, depuis le menu et le sentier de la jungle. Les étapes 1 à 15 sont réalisées sans dépendance supplémentaire. La construction est procédurale et reprend les formes et l'ambiance de l'image ; les matériaux, plantes et avatar partagés restent locaux.

| Vérification effectuée | Résultat |
|---|---|
| Contrats du layout et profondeur GLSL réellement évaluée sur le GPU | Réussis ; écart maximal JS/GLSL de 0,000463 m |
| Marche sur les deux pontons, accès aux 18 bungalows et 12 escaliers du lagon | Réussis ; les murs restent bloquants |
| Nage, chute dans l'eau, plage, trois piscines et sorties | Réussies ; tête/caméra hors de l'eau, pilotis et limite du large bloquants |
| Hamac et voyage forêt/resort | Réussis ; sentier parcourable, arrivée hors du déclencheur, coucher conservé |
| Démarrage avec ambiance choisie et pause/reprise | Réussis ; captures du personnage allongé et nageant inspectées |
| Sept vues × trois ambiances à 960 × 540, rendu logiciel Chromium | Aucun asset manquant, erreur JavaScript ou shader signalé |
| Budget maximal mesuré sur ces vues, passes d'ombres comprises | **179 appels / 588 019 triangles**, sous l'objectif de vue courante |
| Régressions jungle : layout, océan, végétation, marche et cascade | Tests existants réussis |
| Menu, plage et paquebot | Lien du menu vérifié ; captures de la plage et du paquebot inspectées, sans erreur de chargement |

Les captures et le relevé `resort_performance.json` sont dans `scratch/`, qui reste hors du suivi Git. Les FPS sur le GPU réel à 1 920 × 1 080 ne sont pas mesurés : les compteurs géométriques et le rendu logiciel ne prouvent pas cet objectif matériel.
