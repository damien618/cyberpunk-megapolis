Jeu proposé par Kimi corrigé par Kimi K3 puis GPT5.6 SOL puis par Opus 5. En effet, le joueur tombait parfois dans le béton. 

Nouveau paysage : LA par Opus 5.

Nouveau paysage : Zoo par Opus 5.

Nouveau paysage : Croisière de luxe par Opus 5. On l'atteint depuis la plage de L.A. : la boutique L.A. HARBOR CRUISES, au bout de la promenade après la grande roue, où le vendeur demande « Voulez-vous partir en croisière ? ». Le paquebot a un pont promenade, un casino, un atrium, la cabine 214, une salle de bal et un pont piscine. Pour débarquer, s'allonger sur le lit de la cabine 214 et choisir : retour à la plage de L.A., ou se relever à bord de jour ou de nuit.

Extension culturelle de Cruise : l’atrium a un second escalier, à l’opposé de
celui des cabines — tribord avant, sous le casino — signalé « ↓ Nymphéas ·
Grand Opéra ». Il descend d’une seule volée, à travers le pont, dans la cale :
les deux salles y sont creusées à l’échelle du navire, sans fondu ni téléport,
et l’on voit la galerie dès la troisième marche. Huit reproductions de Monet,
puis un petit hall doré, puis la salle : un opéra de paquebot de 30 m sur 22,
inspiré du Palais Garnier — damas cramoisi entre des pilastres, fauteuils
capitonnés sur piètements dorés tournés vers la scène, un balcon en fer à
cheval bordé de loges, une arche dorée sur le manteau d’Arlequin et un plafond
peint sous le lustre. Pour revenir à bord, reprendre l’escalier ou la sortie
« Atrium · Cabines » à l’entrée de la galerie. Sources et licences :
[crédits de la galerie](textures/cruise-monet/CREDITS.md).

Nouveau paysage : Promenade tropicale — la cascade, par Opus 5.
C'est l'île que longe le paquebot : sur le pont, regardez-la un instant et le
bord propose « Débarquer dans la forêt tropicale ? ». La chaloupe vous dépose
au ponton d'une anse; un sentier monte à travers la forêt jusqu'à une cascade
qui tombe dans un bassin. Pour rentrer, retournez au bout du ponton. Code :
`main-JUNGLE.js` (coquille) et un module par élément — `jungleLayout.js`
(plan, fonctions pures : relief, rivage, plage, falaise, bassin, sentier, et
l'API du sol `terrainSlope`/`terrainNormal`/`terrainMasks`/`soilAt` que tout
le monde consomme — maillage, végétation, tests), `jungleTerrain.js`
(matériau procédural : peinture par masques + micro-détail shader),
`jungleOcean.js`, `jungleWaterfall.js`, `jungleVegetation.js`,
`jungleTender.js` (le bateau-taxi du ponton : coque loftée, auvent, hors-bord,
amarres — il flotte sur `waterHeightAt`), `jungleLiner.js` (le paquebot au
mouillage à l'horizon, même silhouette et même livrée que celui de `main-CRUISE.js`). Tests :
`tests/jungle_layout.py`, `tests/jungle_walk.py`, `tests/cruise_island_prompt.py`,
`tests/jungle_tender_shot.py`.

Cascade raffinée (toujours l'anse) : le rideau d'eau tombe en chute libre,
dégagé de la paroi, sur une trajectoire définie une seule fois dans le layout
(`fallsSheetZ`) — les rochers de la falaise s'en écartent (`clearOfFalls`) et
seuls ceux entièrement derrière lui restent, visibles à travers l'eau — et se
dessine en cordes : gros cordon blanc opaque au centre,
voiles fins sur les bords, aération croissante vers le pied. Un filet d'eau
amont naît dans le lit de la alcôve derrière la lèvre (fin de fondu amont,
donc l'eau « arrive » au lieu d'apparaître). Au pied : écume en dôme qui
brande (déplacement vertex) avec anneaux déchiquetés filant vers l'extérieur,
plus ~90 gouttelettes balistiques pilotées dans le vertex shader. Brume
paramétrable (alpha + nombre actif via draw range, taille de sprite plafonnée
pour l'overdraw). Le bassin et le ruisseau sont la même eau douce : même
matériau éclairé, même rampe vert d'eau (`freshShallow`/`freshDeep`), et
chacun connaît le lit réel sous chaque sommet (chenal de sortie compris), si
bien que l'eau s'arrête sur les berges et que le bassin se déverse dans le
ruisseau sans couture. Des anneaux partent de l'impact, et un courant visible
glisse vers l'exutoire puis descend le ruisseau au même rythme. Le module est réutilisable à l'échelle de
l'île comme l'océan : `createJungleWaterfall({ scene, waterNormal, preset,
spec })` prend un `preset` sur `CASCADE_PRESET` (flow, foam, splash, mist,
ripples, couleurs) et une `spec` de géométrie (lèvre, dénivelé, largeur) —
une autre cascade ou une rivière des villages sera une autre spec/preset, pas
une copie. Aucune passe de rendu en plus, aucun CPU par particule ;
`update(t)` ne pose que des uniforms. Le son est préparé, pas implémenté :
`falls.audioAnchor` (Object3D à l'impact) attend un `PositionalAudio` (recette
dans l'en-tête de `jungleWaterfall.js`, pattern `main-CRUISE.js`). Tests :
`tests/jungle_waterfall.py` (+ `.mjs`) — le rideau ne passe ni dans le sol
ni derrière un rocher, le filet amont suit le lit, le preset atteint les
uniforms.

Océan raffiné (toujours l'anse) : houle de Gerstner modérée qui se lève puis
meurt sur les hauts-fonds d'après la profondeur réelle d'eau — le lit est lu
dans le shader via `SEA_BED_GLSL` (jumeau shader des fonctions du layout),
sans texture ni passe de rendu en plus —, turquoise par profondeur (sable
visible en eau claire), brisantes qui suivent leurs lignes de profondeur,
swash qui monte sur le sable, reflet du dôme de ciel par fresnel et
spéculaire du soleil, et bande de sable mouillé raccordée à la portée du
swash. Les maths vivent dans `oceanSurface.js` (pur, testé par
`tests/jungle_ocean.py`, captures par `tests/jungle_ocean_shot.py`). Le
module océan est réutilisable à l'échelle de l'île pour les deux villages à
venir : il reçoit le layout d'une map (`layout`) et un `preset` (vagues,
couleurs, écume), et expose `ocean.waterHeightAt(x, z, t)` pour tout ce qui
flottera ou pataugera plus tard.

Végétation raffinée (toujours l'anse) : neuf espèces au lieu de cinq —
palmiers en trois présentations (dressé, penché vers la mer, tordu de côté),
géants de la pluie en deux statures (sous-étage de 6–9 m, dominants de 14–26 m)
et deux morphologies de couronne (boule de lobes ou disque plat plus large,
pour que la silhouette ne se répète jamais), jeunes pousses de palmier en
rosettes, deux fougères (plume et dressée), deux plantes à larges feuilles
(bananier déchiré et monstera fendu), buissons pleins qui portent l'ombre, et
des touffes d'herbe sans texture. Le placement suit des règles, plus des
coordonnées tirées : anneau luxuriant sur les berges du ruisseau et du bassin
(l'ancien scatter laissait un cercle nu), buissons en lisière et dans les
clairières, herbe sur les épaules du sentier en laissant le passe-pied nu,
rien à moins de 1,2 m du fil et aucun collider dessus, rien dans l'eau ni sur
le sol bâti (ponton, bassin). Les lignes de vue voulues par le layout
(`SIGHTLINES` — dernier virage du sentier vers la cascade, anse vers le
paquebot) éclaircissent les troncs mais laissent le sous-étage dense : on voit
la cascade à travers une trouée, pas une allée tondue. Le vent plie le feuillage
dans le vertex shader — un seul uniform de temps partagé, phase par instance
gratuite, amplitude par espèce (herbe 0.06, fougères 0.03–0.04, palmes 0.02,
lianes 0.012) — et le dessous des feuilles coupées s'assombrit. Le sol de
forêt reçoit des taches de lumière lentes qui errent (dapple dans le shader
du terrain, piloté par le masque de sol de forêt : aucune passe de rendu en
plus), et le brouillard/hémisphérique forêt se resserrent. Le module est
réutilisable à l'échelle de l'île comme l'océan et la cascade :
`buildJungleVegetation({ scene, rnd, maxAniso, layout, rules })` — `layout`
pour le relief d'une autre map, `rules` pour `keepOffBuilt` (les villages
dégageront leurs places) et des densités par espèce. Pire pose mesurée :
170 draw calls / 636 k triangles (budget 180 / 650 k), culling par tuiles et
à distance pour le sous-étage. Tests : `tests/jungle_vegetation.py` (+
`.mjs`) — rien dans l'eau, rien sur le sentier ni le sol bâti, palmiers
penchés vers la mer, anneau humide garni, sightlines plus clairsemées que la
forêt ouverte ; captures et mesure par `tests/jungle_vegetation_shot.py` à
sept poses.


Village touristique polynésien : `index.html?map=resort`. Douze bungalows sur
pilotis (dont trois suites avec piscine privée), six bungalows-jardin,
accueil/restaurant/bar, deux pontons courbes, lagon corallien et hamac.
Accès aussi depuis le sentier signalé à l'ouest de la plage de la jungle :
**E** pour changer de map, avec fondu et conservation de l'heure. Les trois
ambiances jour/coucher/nuit se choisissent dans l'écran d'accueil et les
boutons en bas à gauche. **WASD** marche/nage, souris ou flèches pour regarder,
**E** pour le hamac ou le retour à la forêt, **R** pour revenir à l'accueil.
Les pirogues et les transats sont décoratifs ; la nage reste en surface.

Architecture : `main-RESORT.js` assemble les modules `resort*` ;
`resortLayout.js` est le contrat analytique partagé par sol/eau/collisions.
Le chaume et les fleurs sont procéduraux ; le bois, l'eau, les plantes et le
personnage réutilisent les ressources existantes. Les defaults des autres maps
sont conservés. Aucun paquet supplémentaire n'est nécessaire.
Plan et choix de construction : [PLAN_VILLAGE_TOURISTIQUE.md](PLAN_VILLAGE_TOURISTIQUE.md).

Vérification locale (après `python3 serve.py 8000`) :

```sh
.venv/bin/python tests/resort_layout.py
.venv/bin/python tests/resort_walk.py
.venv/bin/python tests/resort_swim.py
.venv/bin/python tests/resort_interactions.py
.venv/bin/python tests/resort_ui.py
.venv/bin/python tests/resort_visual.py
```

Les captures et mesures sont enregistrées dans `scratch/resort_*`.
Le plafond vérifié est de 250 appels de rendu / 800 000 triangles par vue,
ombres compris. Les FPS doivent être mesurés sur le GPU réel ; le navigateur
logiciel utilisé par les tests ne constitue pas un benchmark matériel.
Sur les sept vues aux trois ambiances, le maximum observé est de
179 appels / 588 019 triangles (960 × 540, passes d'ombres comprises).



---



Doc Github : 

- pour récupérer : 
  - git status
  - git pull
- pour envoyer : 
  - git status
  - git add -A
  - git commit -m "Texte"
  - git push
