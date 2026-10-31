# Bolide Arcade

Jeu de course de monoplaces pour enfants, en 3D, jouable dans le navigateur du téléphone. Vue cockpit, rétroviseurs actifs, volant par inclinaison du téléphone.

**Jouer : https://gmtn642.github.io/Bolide_Arcade/**

## Déroulé d'une partie (moins de 3 minutes)

1. **Qualification** : un tour chrono, seul en piste (60 s maximum). Ton temps est comparé à celui des 7 adversaires et fixe ta place sur la grille.
2. **Course** : 2 tours contre 7 voitures. Les cinq feux rouges s'allument un par un, puis s'éteignent : c'est le départ. Le drapeau à damier est agité à l'arrivée.

## Commandes

| Téléphone (inclinaison) | Téléphone (boutons) | Ordinateur |
|---|---|---|
| Tenir le téléphone à l'horizontale et le tourner comme un volant | ◀ ▶ pour tourner | ← → pour tourner |
| Bouton vert ACCÉLÉRER | Bouton vert ACCÉLÉRER | ↑ |
| Bouton rouge FREINER | Bouton rouge FREINER | ↓ ou Espace |

Les vitesses passent toutes seules. Si le volant ne revient pas au centre, mets le jeu en pause puis touche « Recaler le volant ».

## Circuits

Les trois circuits figurent au calendrier 2026. Leurs tracés sont reconnaissables, mais en version raccourcie pour que la partie tienne en 3 minutes.

- **Monaco** : circuit urbain avec le tunnel, l'épingle, le port et la piscine.
- **Monza** : longues lignes droites, chicanes, Lesmo et Parabolica.
- **Silverstone** : virages rapides (Copse, Maggotts, Becketts), Stowe et Club.

## Niveaux

- **Débutant** : freinage automatique avant les virages, aide pour éviter les murs, adversaires plus lents.
- **Pilote** : freinage aidé seulement en cas de grosse erreur.
- **Champion** : aucune aide, adversaires rapides.

## Écran fixe en paysage, plein écran, pas de zoom

- **Le jeu s'affiche toujours en paysage**. Si le téléphone passe en portrait (trop braqué, ou rotation verrouillée), l'image pivote d'elle-même pour rester alignée.
- **iPhone** : Safari ne laisse pas un site bloquer la rotation. Il faut activer le **cadenas de rotation** dans le Centre de contrôle : l'écran ne pivote plus du tout, et le jeu reste en paysage.
- **iPad** : tenir l'iPad à l'horizontale, puis activer le verrouillage de la rotation (Centre de contrôle).
- **Android** : le jeu passe en plein écran et verrouille le paysage tout seul au lancement.
- **Plein écran sur iPhone/iPad** : Safari, bouton Partager, puis « Sur l'écran d'accueil ». On lance ensuite le jeu depuis l'icône, sans barre Safari.
- **Zoom** : le pincement, le double-tap et le zoom automatique de la saisie du prénom sont bloqués.
- Au premier lancement, l'iPhone demande l'accès aux « mouvements et orientation » : il faut répondre **Autoriser**.
- Sur iPhone, le son est coupé si le mode silencieux est activé.

## Technique

- Un seul fichier `index.html`, plus les modules de `js/`. Aucune image ni aucun son externe : textures et sons sont générés par le code.
- Moteur 3D : [three.js](https://threejs.org) r187 (licence MIT), embarqué dans `js/lib/`.
- Hébergement : GitHub Pages (Settings → Pages → *Deploy from a branch* → `main` / racine).

Les voitures, équipes et pilotes sont fictifs. Aucune marque ni aucun logo réel n'est utilisé.
