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
`jungleOcean.js`, `jungleWaterfall.js`, `jungleVegetation.js`. Tests :
`tests/jungle_layout.py`, `tests/jungle_walk.py`, `tests/cruise_island_prompt.py`.

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
