# Adapter ou développer RunningMap

[Retour au mode d'emploi](../README.md) · [Maintenance avancée](maintenance.md)

## Architecture et repères

Le navigateur charge du HTML, du CSS et du JavaScript classique. Python prépare
les données avant publication ; il n'intervient pas pendant la consultation.
Il n'y a ni compilation, ni serveur requis, ni chargement asynchrone des données
locales. Cette architecture permet l'ouverture directe en `file:///`.

| Fichier ou dossier | Rôle |
| --- | --- |
| `index.html`, `style.css`, `app.js` | Interface, styles, carte Leaflet et interactions. |
| `vendor/leaflet/` | Leaflet fourni localement ; les tuiles de fond viennent d'Internet. |
| `config/site-config.js` | Configuration du site, partagée par Git. |
| `config/local.ini` | Chemin des sources propre au PC, ignoré par Git. |
| `data/runs.js`, `tracks/*.geojson.js` | Parcours ajoutés manuellement et exemples. |
| `data/generated-runs.js`, `tracks/generated-tracks.js` | Données produites par l'import, suivies dans Git. |
| `photos/generated/` | Copies web et miniatures ; ignorées par Git, publiées sur R2. |
| `scripts/` | Import, conversion GPX, cache, publication et installation locale de rclone. |
| `tests/` | Tests Python sans accès réseau réel. |
| `.cache/`, `.tools/`, `backups/`, `.venv/` | État local ignoré par Git ; ne pas déployer ces dossiers. |

L'ordre des scripts dans `index.html` est : Leaflet, `data/runs.js`,
`tracks/generated-tracks.js`, `data/generated-runs.js`, `config/site-config.js`,
puis `app.js`. Les données utilisent `window.RUNS`, `window.GENERATED_TRACKS`,
`window.GENERATED_RUNS` et `window.RUNNING_MAP_CONFIG`.

Une trace manuelle référencée par `data/runs.js` doit être chargée **avant** ce fichier.
Les exemples de Liège et Stavelot sont disponibles mais désactivés par commentaires.

## Personnaliser le site

Modifier [config/site-config.js](../config/site-config.js), qui définit
`window.RUNNING_MAP_CONFIG`. Les valeurs non renseignées viennent de
`DEFAULT_CONFIG` dans [app.js](../app.js).

| Option | Effet |
| --- | --- |
| `siteTitle`, `siteSubtitle` | Textes de l'en-tête. |
| `PHOTO_BASE_URL` | Base des photos sur HTTP/HTTPS. Vide : chemins relatifs. Ignorée en `file:///` pour les images relatives. |
| `map.initialCenter`, `map.initialZoom`, `map.tileLayer` | Vue initiale ; fonds `osm` ou `opentopomap`. |
| `tracks.defaultOpacity`, `tracks.defaultWeight` | Apparence des traces. |
| `sidebar.showDemoRuns`, `sidebar.showGeneratedRuns` | Inclusion des parcours manuels et importés. |
| `photos.enabled`, `photos.showPhotoGallery`, `photos.showPhotoMarkers`, `photos.maxPhotosInPanel` | Affichage des photos et limite initiale de la galerie. |
| `selection.selectedColor`, `selection.selectedWeight`, `selection.selectedOpacity`, `selection.dimOtherRuns`, `selection.dimmedOpacity` | Apparence de la sélection et atténuation des autres traces. |

La sélection est unique. Les filtres de la liste ne doivent ni masquer les traces
sur la carte ni effacer implicitement la sélection. Visibilité et sélection
restent deux états distincts.

## Détails de l'import ADEPS

Le script recherche récursivement les dossiers `YYYY-MM-DD - Lieu`. Il utilise
`track.gpx` en priorité, sinon l'unique fichier `.gpx` du dossier. Un GPX absent
ou ambigu provoque un avertissement et le dossier est ignoré.

La distance et le dénivelé sont calculés sur la trace complète, puis la géométrie
est simplifiée par Douglas-Peucker. Le dénivelé reste une estimation : les petites
hausses sont filtrées selon le seuil configuré.

Le chemin passé en argument est prioritaire sur `config/local.ini`. Dans l'INI,
`~` désigne le dossier personnel et un chemin relatif part de la racine du projet.
Un chemin relatif passé en argument part du dossier courant. L'INI est trouvé
à partir du script, mais **la destination d'import est le dossier courant** par
défaut : préciser `--output` si l'on lance la commande ailleurs.

| Option | Usage / valeur par défaut |
| --- | --- |
| `--output` | Racine du site à générer ; `.` par défaut. |
| `--force` | Autorise le remplacement des fichiers JavaScript générés. |
| `--photos` / `--with-photos` | Importe les photos ; désactivé par défaut. |
| `--dry-run` | Calcule le résultat sans écrire images, données, cache ni manifeste. |
| `--year` | Limite l'import à une année ; produit un jeu partiel, pas une mise à jour cumulative. |
| `--simplify-tolerance-m` | Tolérance de simplification : `5.0` m. |
| `--elevation-threshold-m` | Seuil du calcul de dénivelé : `3.0` m. |
| `--photo-thumb-size` | Largeur des miniatures : `180` px ; hauteur proportionnelle à `112/180`, avec recadrage. |
| `--photo-web-size` | Plus grand côté des images web : `800` px au maximum, sans agrandissement. |
| `--photo-quality` | Qualité JPEG : `75`. |
| `--force-photos` | Recalcule les JPEG même si le cache est valide. |

Les photos `.jpg`, `.jpeg` et `.png` sont lues dans le sous-dossier `photos/`
de chaque parcours. Les vidéos `.mp4`, `.mov`, `.m4v` et `.avi` sont signalées
comme ignorées ; les autres formats non supportés déclenchent un avertissement.
L'orientation EXIF est appliquée. Les GPS présents sont copiés dans les données
JavaScript ; une photo sans GPS reste dans la galerie sans marqueur. Les JPEG
produits ne conservent pas les EXIF. Les sources restent toujours intactes.

Pour consulter les interfaces complètes :

```bash
python scripts/import_adeps_folder.py --help
python scripts/gpx_to_geojson_js.py --help
python scripts/manage_photos.py --help
python scripts/install_rclone.py --help
```

## Identité des photos et publication

Les sorties suivent `photos/generated/{run_id}/photo-{sha256}-{thumb|web}.jpg`.
L'empreinte porte sur les octets du JPEG produit, séparément pour chaque variante.
L'ordre d'affichage dépend des noms sources triés (minuscules, puis nom exact),
mais **ne détermine jamais l'identité d'une image**. Une modification peut créer
une nouvelle adresse ; les anciennes images restent disponibles jusqu'au nettoyage.

Le cache `.cache/photo-import.json` dépend du contenu source, des paramètres,
de la version de l'algorithme et des versions Pillow/JPEG. Une sortie n'est
réutilisée que si elle existe et que son empreinte et ses dimensions concordent.
Changer de version de Pillow peut produire de nouvelles adresses sans mélanger
les images. Supprimer le cache ne perd pas de sources : le prochain import
recalcule les sorties. Les fichiers sont écrits par remplacement atomique individuel.

Le manifeste `.cache/photo-manifest.json` associe les images référencées à leurs
empreintes et à celles des deux fichiers JavaScript générés. L'outil de publication
refuse les données modifiées après import, les images altérées, les imports
partiels ou sans photos, les avertissements et les dossiers ignorés. La publication
R2 exige au moins une image référencée. Ni cache ni manifeste ne sont lus par
le navigateur ou transférés sur R2.

La copie utilise `--s3-acl private`, `--s3-no-check-bucket` et `--s3-no-head`.
La dernière option évite une requête HEAD avec `versionId` refusée par R2 dans
certaines combinaisons de versions ; une **comparaison complète par téléchargement**
est obligatoire après la copie. Ne pas supprimer ce contrôle. L'inventaire du
nettoyage ne lit ni dates ni types MIME, pour éviter une requête par objet.

## Ajouter un GPX manuellement

Pour un parcours hors de l'import ADEPS, lancer depuis la racine :

```bash
python scripts/gpx_to_geojson_js.py input.gpx --id sortie-test --title "Sortie test" --date 2026-05-14 --var-name TRACK_SORTIE_TEST --output tracks/sortie-test.geojson.js
```

Ajouter `--force` si la sortie existe déjà. Charger le script obtenu dans
`index.html` **avant `data/runs.js`**, puis insérer le bloc affiché par le convertisseur
dans le tableau `window.RUNS` de `data/runs.js` (hors des commentaires d'exemple).

Les photos manuelles peuvent être ajoutées dans le tableau `photos` du parcours :

```js
{
  thumb: "./photos/sortie-test/miniature.jpg",
  web: "./photos/sortie-test/photo.jpg",
  caption: "Départ",
  lat: 50.46,
  lon: 4.86
}
```

Omettre `lat` et `lon` si la position est inconnue. Le gestionnaire R2 ne transfère
pas ces photos manuelles : les héberger séparément et vérifier leurs URL.

## Créer son propre site

Forker le dépôt, configurer ses sources locales et adapter le titre et les photos
dans `config/site-config.js`. Remplacer ou retirer `CNAME` selon son domaine.
Adapter aussi `PROJECT_GITHUB_URL` dans `app.js` si le lien du projet doit pointer
vers le nouveau dépôt.

Pour utiliser un autre bucket ou site, passer les options suivantes à chaque
commande concernée de `manage_photos.py` :

```bash
python scripts/manage_photos.py copy --remote mon-r2:mon-bucket --dry-run
python scripts/manage_photos.py verify-public --site-url https://mon-site.example
python scripts/manage_photos.py cleanup --remote mon-r2:mon-bucket --site-url https://mon-site.example --dry-run
```

`--remote` désigne la racine du bucket : l'outil ajoute `/photos/generated`.
`--site-url` désigne la racine du site publié. `--root` change le dossier local
à vérifier. Ces paramètres ne modifient pas `PHOTO_BASE_URL` : le renseigner
séparément avec la base publique qui dessert les mêmes images.

Sur un nouveau dépôt GitHub, configurer Pages pour publier `main`, dossier `/`
(racine). Pour un autre hébergeur statique, publier `index.html`, `style.css`,
`app.js`, `favicon.png`, `config/site-config.js`, `data/`, `tracks/` et `vendor/`
en conservant leur disposition. Ajouter les photos si elles sont hébergées avec
le site et laisser `PHOTO_BASE_URL` vide dans ce cas. Ne pas publier
`config/local.ini`, les sources, le venv, les caches, les exécutables ni les sauvegardes.
Les commandes R2 ne sont alors pas nécessaires si les photos sont servies par
cet autre hébergement.

## Vérifier une modification

Avec le venv activé :

```bash
python -m unittest discover -s tests -v
```

Si Node est déjà installé, `node --check app.js` permet une vérification syntaxique
sans npm. Ce n'est pas une dépendance de consultation ou de publication.

Vérification manuelle après une modification du site : ouvrir `index.html` en
`file:///`, chercher un lieu, filtrer une année, sélectionner un parcours,
vérifier sa trace et ses détails, puis ouvrir une photo avec GPS et une sans GPS.
Contrôler les légendes, les marqueurs, la vue agrandie et la console. Après
publication, vérifier aussi l'affichage des images distantes.

Un contrôle syntaxique ou une comparaison de fichiers ne remplace pas un test
visuel. Si l'outil navigateur ne permet pas les URL locales, conserver la procédure
par double-clic et signaler le test manuel restant.
