# running-map

Mini-site statique pour afficher des marches et courses sur une carte Leaflet.

Le projet reste volontairement simple : un fichier `index.html`, du CSS, du JavaScript classique, des données chargées par balises `<script>`, et quelques scripts Python utilitaires pour générer les fichiers statiques à partir de traces GPX.

Il n'y a pas de build, pas de serveur local obligatoire, pas de `fetch()` pour les données locales, pas de framework front-end.

## État actuel

Le site affiche aujourd'hui une carte de marches ADEPS importées depuis des dossiers GPX, avec :

- une carte Leaflet et des tuiles OpenStreetMap ou OpenTopoMap ;
- une liste latérale avec recherche, filtre par année, compteur et totaux ;
- un panneau de détails pour la course sélectionnée ;
- une sélection unique, avec trace mise en évidence, autres traces atténuées, marqueurs de départ/arrivée et flèches de direction ;
- des photos par parcours, sous forme de galerie, marqueurs GPS sur la carte, popup et lightbox ;
- une configuration statique dans `config/site-config.js` ;
- des fichiers générés séparés pour les traces et les métadonnées importées.

Dans ce clone, les fichiers générés actuels contiennent 62 parcours importés :

```text
data/generated-runs.js
tracks/generated-tracks.js
```

Les exemples pédagogiques historiques existent encore dans `data/runs.js` et `tracks/demo-*.geojson.js`, mais ils sont commentés dans `index.html` et `data/runs.js`.

## Ouvrir le site localement

Ouvrez directement `index.html` dans un navigateur, par exemple par double-clic.

Le site est prévu pour fonctionner avec une URL locale de ce type :

```text
file:///.../running_map/index.html
```

Leaflet est fourni localement dans `vendor/leaflet/`. Les tuiles de fond de carte viennent d'Internet : sans connexion, l'interface, les traces et les données restent chargées, mais le fond cartographique peut être absent.

## Arborescence utile

```text
index.html                 Page principale, ordre des scripts
style.css                  Mise en page et styles de l'application
app.js                     Logique Leaflet et interactions
config/site-config.js      Configuration statique du site
data/runs.js               Données manuelles ou démos
data/generated-runs.js     Courses importées, généré par script
tracks/*.geojson.js        Traces manuelles ou démos
tracks/generated-tracks.js Traces importées, généré par script
photos/                    Photos locales ou générées
scripts/                   Outils Python GPX/ADEPS/photos
tools/                     Commandes rclone pour Cloudflare R2
vendor/leaflet/            Leaflet vendored, sans CDN
```

Les fichiers `data/generated-runs.js` et `tracks/generated-tracks.js` sont des artefacts générés. Évitez de les modifier à la main : modifiez plutôt les GPX, les dossiers sources ou les scripts, puis régénérez.

## Chargement des données

Le site utilise uniquement des scripts classiques et des variables globales :

```js
window.RUNS
window.GENERATED_TRACKS
window.GENERATED_RUNS
window.RUNNING_MAP_CONFIG
```

L'ordre de chargement dans `index.html` est important :

```html
<script src="./vendor/leaflet/leaflet.js"></script>
<script src="./data/runs.js"></script>
<script src="./tracks/generated-tracks.js"></script>
<script src="./data/generated-runs.js"></script>
<script src="./config/site-config.js"></script>
<script src="./app.js"></script>
```

Si vous réactivez des traces manuelles dans `tracks/*.geojson.js`, chargez-les avant `data/runs.js`, car les entrées de `window.RUNS` référencent directement les variables `window.TRACK_*`.

## Configuration

La configuration du site se trouve dans :

```text
config/site-config.js
```

Ce fichier définit `window.RUNNING_MAP_CONFIG`. Il est chargé par une balise `<script>` classique, donc compatible avec `file:///`.

Configuration actuelle :

```js
window.RUNNING_MAP_CONFIG = {
  PHOTO_BASE_URL: "https://runningmap-photos.rboman.dev",
  siteTitle: "🏃🏻‍➡️running-map",
  siteSubtitle: "Mes marches ADEPS",
  tracks: {
    defaultOpacity: 0.85,
    defaultWeight: 5
  },
  photos: {
    enabled: true,
    showPhotoGallery: true,
    showPhotoMarkers: true,
    maxPhotosInPanel: 12
  },
  selection: {
    selectedColor: null,
    selectedWeight: 8,
    selectedOpacity: 1.0,
    dimOtherRuns: true,
    dimmedOpacity: 0.45
  }
};
```

Options principales :

- `PHOTO_BASE_URL` : préfixe public pour les photos. Vide, les chemins `./photos/...` restent locaux.
- `siteTitle` et `siteSubtitle` : texte de l'en-tête latéral.
- `map.initialCenter`, `map.initialZoom`, `map.tileLayer` : réglages initiaux de carte.
- `map.tileLayer` : accepte `osm` ou `opentopomap`.
- `tracks.defaultOpacity`, `tracks.defaultWeight` : style standard des traces.
- `sidebar.showDemoRuns`, `sidebar.showGeneratedRuns` : activation des données manuelles ou générées.
- `photos.enabled`, `photos.showPhotoGallery`, `photos.showPhotoMarkers` : affichage des photos.
- `photos.maxPhotosInPanel` : nombre de miniatures affichées avant le bouton d'extension.
- `selection.*` : style de la trace sélectionnée et atténuation des autres traces.

## Ajouter une course manuellement

Pour un ajout ponctuel sans passer par l'import ADEPS :

1. Créez un fichier de trace dans `tracks/`, par exemple `tracks/demo-namur.geojson.js`.

```js
window.TRACK_DEMO_NAMUR = {
  type: "Feature",
  geometry: {
    type: "LineString",
    coordinates: [
      [4.86, 50.46],
      [4.87, 50.47]
    ]
  },
  properties: {}
};
```

2. Chargez ce fichier dans `index.html` avant `data/runs.js`.

3. Ajoutez une entrée dans `data/runs.js`.

```js
{
  id: "demo-namur",
  title: "Démo Namur",
  date: "2026-05-16",
  distanceKm: 8.2,
  elevationGainM: 140,
  color: "#6a3d9a",
  visible: true,
  track: window.TRACK_DEMO_NAMUR,
  photos: []
}
```

4. Ajoutez éventuellement des photos dans `photos/demo-namur/` et référencez-les avec des chemins relatifs.

```js
photos: [
  {
    lat: 50.46,
    lon: 4.86,
    thumb: "./photos/demo-namur/photo-001-thumb.jpg",
    web: "./photos/demo-namur/photo-001-web.jpg",
    caption: "Départ"
  }
]
```

## Convertir un GPX isolé

Le script `scripts/gpx_to_geojson_js.py` convertit un GPX en fichier JavaScript contenant une variable globale `window.*`.

```cmd
python scripts\gpx_to_geojson_js.py input.gpx ^
  --id sortie-test ^
  --title "Sortie test" ^
  --date 2026-05-14 ^
  --var-name TRACK_SORTIE_TEST ^
  --output tracks\sortie-test.geojson.js
```

Le script affiche ensuite un résumé et un bloc à copier dans `data/runs.js`.

Le dénivelé positif est approximatif : par défaut, les petites hausses de moins de 3 m sont ignorées pour limiter le bruit GPS. Ajustez ce seuil avec `--elevation-threshold-m`.

Ajoutez `--force` si le fichier de sortie existe déjà.

## Import massif ADEPS

Le script principal est :

```text
scripts/import_adeps_folder.py
```

Il scanne récursivement un dossier source ADEPS et détecte les dossiers dont le nom suit cette convention :

```text
YYYY-MM-DD - Lieu
```

Exemples :

```text
2026-05-10 - Spa
2026-03-08 - Oneux (Comblain au pont)
2025\2025-01-19 - Aywaille
```

Commande de base depuis Windows :

```cmd
python scripts\import_adeps_folder.py "G:\Dropbox\Mine\Sport\ADEPS" --output . --force
```

Avec photos :

```cmd
python scripts\import_adeps_folder.py "G:\Dropbox\Mine\Sport\ADEPS" --output . --photos --force
```

Le dossier Dropbox source est lu comme entrée. Le script ne le modifie pas, ne déplace rien et ne supprime rien.

Fichiers générés dans le projet :

```text
tracks\generated-tracks.js
data\generated-runs.js
```

Avec `--photos`, le script lit les sous-dossiers `photos\` présents dans chaque dossier de course et génère des copies web légères dans :

```text
photos\generated\{run_id}\photo-001-thumb.jpg
photos\generated\{run_id}\photo-001-web.jpg
```

Les originaux restent la référence dans Dropbox. Les JPEG générés sont destinés à la consultation web et ne conservent pas les EXIF.

Choix du GPX dans un dossier de course :

1. `track.gpx` s'il existe ;
2. sinon l'unique fichier `.gpx` du dossier ;
3. sinon le dossier est ignoré avec un avertissement.

La distance et le dénivelé sont calculés sur la trace GPX complète. La géométrie exportée est ensuite simplifiée avec Douglas-Peucker pour garder `generated-tracks.js` raisonnable.

Options utiles :

```cmd
python scripts\import_adeps_folder.py "G:\Dropbox\Mine\Sport\ADEPS" --output . --dry-run
python scripts\import_adeps_folder.py "G:\Dropbox\Mine\Sport\ADEPS" --output . --year 2026 --force
python scripts\import_adeps_folder.py "G:\Dropbox\Mine\Sport\ADEPS" --output . --simplify-tolerance-m 10 --force
python scripts\import_adeps_folder.py "G:\Dropbox\Mine\Sport\ADEPS" --output . --default-visible true --force
python scripts\import_adeps_folder.py "G:\Dropbox\Mine\Sport\ADEPS" --output . --photos --dry-run
python scripts\import_adeps_folder.py "G:\Dropbox\Mine\Sport\ADEPS" --output . --photos --force --force-photos
```

Options disponibles :

```text
source_dir
--output
--force
--dry-run
--year
--elevation-threshold-m
--simplify-tolerance-m
--default-visible true|false
--photos / --with-photos
--photo-thumb-size
--photo-web-size
--photo-quality
--force-photos
```

Valeurs par défaut importantes :

- `--default-visible false` pour éviter d'afficher trop de traces dès l'ouverture ;
- `--simplify-tolerance-m 5.0` ;
- `--elevation-threshold-m 3.0` ;
- miniatures de 180 px de large ;
- images web limitées à 800 px ;
- qualité JPEG 75.

L'import photo accepte `.jpg`, `.jpeg` et `.png`. Les formats non supportés sont ignorés avec avertissement. Si une photo contient des coordonnées GPS EXIF, elles sont copiées dans `data/generated-runs.js` pour placer le marqueur photo sur la carte.

## Photos et Cloudflare R2

Les photos générées peuvent fonctionner localement avec les chemins `./photos/...`, mais le site peut aussi utiliser une base publique via :

```js
PHOTO_BASE_URL: "https://runningmap-photos.rboman.dev"
```

Dans ce mode, l'application préfixe les chemins photo relatifs. Par exemple :

```text
./photos/generated/2025-01-19-aywaille/photo-001-web.jpg
```

devient :

```text
https://runningmap-photos.rboman.dev/photos/generated/2025-01-19-aywaille/photo-001-web.jpg
```

Les commandes rclone sont dans `tools/` :

```cmd
tools\dry_run_sync_photos_to_r2.cmd
tools\sync_photos_to_r2.cmd
tools\upload_photos_to_r2.cmd
```

Utilisez toujours le dry-run avant `sync`, car `rclone sync` peut supprimer côté R2 les fichiers absents du dossier local `photos/`.

Les photos générées sont ignorées par Git via `.gitignore` :

```text
photos/generated/
```

## Dépendances Python

Les scripts GPX utilisent la bibliothèque standard Python.

Pillow est nécessaire uniquement pour l'option `--photos` :

```cmd
python -m pip install -r requirements.txt
```

## Publier le site

Le projet se publie comme un dossier statique. Il suffit de servir les fichiers tels quels, en conservant les chemins relatifs.

Pour GitLab Pages, une idée minimale :

```yaml
pages:
  stage: deploy
  script:
    - mkdir public
    - cp -r index.html style.css app.js CNAME config data tracks vendor public/
  artifacts:
    paths:
      - public
  only:
    - main
```

Ajoutez `photos/` seulement si vous voulez publier les photos dans le même site. Si les photos sont servies par R2, gardez plutôt `PHOTO_BASE_URL`.

Pour intégrer dans Hugo, copiez le dossier dans :

```text
static/running-map/
```

Le site sera accessible via :

```text
/running-map/index.html
```

## Pourquoi cette architecture ?

Le projet est fait pour rester inspectable et lançable par double-clic.

Certaines APIs comme `fetch()` ou les modules JavaScript peuvent devenir pénibles depuis `file:///`, selon le navigateur et le contexte de sécurité. Ici, les données sont donc chargées par scripts classiques, ce qui rend l'ordre explicite et compatible avec :

- `file:///` ;
- un hébergement statique simple ;
- GitLab Pages ;
- une intégration dans un dossier statique Hugo.

## Checklist avant de conclure un changement

- `index.html` s'ouvre toujours directement par double-clic.
- Aucun `fetch()` n'a été ajouté pour charger les données locales.
- Aucun module JavaScript, bundler, npm ou serveur obligatoire n'a été ajouté.
- L'ordre des scripts reste cohérent.
- Les fichiers générés ne sont pas modifiés à la main sans raison explicite.
- Les photos Dropbox sources ne sont jamais modifiées automatiquement.
- Si les scripts Python changent, lancer au minimum une vérification syntaxique.
- Si le navigateur n'est pas testé automatiquement, faire une vérification manuelle.

## Vérification manuelle rapide

1. Ouvrir `index.html` directement dans le navigateur.
2. Vérifier que la carte se charge.
3. Vérifier que la liste affiche les parcours importés.
4. Chercher un lieu, puis filtrer par année.
5. Sélectionner un parcours et vérifier le panneau de détails.
6. Vérifier la mise en évidence de la trace sélectionnée.
7. Ouvrir une photo depuis la galerie ou un marqueur, puis tester la lightbox.
8. Vérifier la console du navigateur.
