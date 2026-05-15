# running-map

Mini-site statique pédagogique pour afficher des parcours de course à pied sur une carte Leaflet.

Cette V1 est volontairement simple : HTML, CSS et JavaScript classiques, sans backend, sans build system et sans serveur local obligatoire.

## Ouvrir le site localement

Depuis un clone local, ouvrez directement `index.html` dans votre navigateur, par exemple par double-clic.

Le site est prévu pour fonctionner avec une URL du type :

```text
file:///.../running-map/index.html
```

La carte utilise Leaflet en local depuis `vendor/leaflet/`. Le fond de carte OpenStreetMap vient d'Internet : sans connexion, l'interface et les traces restent chargées, mais les tuiles de fond peuvent ne pas apparaître.

## Configuration statique

Les reglages simples du site peuvent etre ajustes dans :

```text
config/site-config.js
```

Ce fichier est charge par une balise `<script>` classique avant `app.js`, ce qui
garde le fonctionnement par double-clic sur `index.html`. Il ne s'agit pas d'un
fichier JSON : aucun `fetch()` n'est necessaire.

Configuration minimale pour garder les valeurs par defaut :

```js
window.RUNNING_MAP_CONFIG = {};
```

Exemple de configuration :

```js
window.RUNNING_MAP_CONFIG = {
  siteTitle: "Mes parcours",
  map: {
    initialCenter: [50.53, 5.75],
    initialZoom: 10,
    tileLayer: "osm",
    defaultFitPadding: [36, 36]
  },
  tracks: {
    defaultOpacity: 0.9,
    defaultWeight: 5
  },
  sidebar: {
    showDemoRuns: true,
    showGeneratedRuns: true
  },
  photos: {
    enabled: true,
    showPhotoGallery: true,
    showPhotoMarkers: true,
    maxPhotosInPanel: 12,
    maxPhotoMarkers: 20
  }
};
```

`map.tileLayer` accepte actuellement `osm` et `opentopomap`. Une valeur inconnue
retombe sur `osm`. La configuration `photos` concerne uniquement l'affichage
dans le navigateur. Les tailles et la qualite des images generees se reglent
avec les options CLI de `scripts/import_adeps_folder.py`.

## Fichiers Leaflet vendored

Les fichiers Leaflet 1.9.4 sont placés dans :

```text
vendor/leaflet/leaflet.css
vendor/leaflet/leaflet.js
vendor/leaflet/images/marker-icon.png
vendor/leaflet/images/marker-icon-2x.png
vendor/leaflet/images/marker-shadow.png
```

Si vous devez les remplacer plus tard, gardez la même structure. `index.html` ne charge pas Leaflet depuis un CDN.

## Publier sur GitLab Pages

Pour GitLab Pages, publiez le dossier tel quel comme contenu statique. Une configuration minimale peut copier tout le contenu du projet dans le dossier `public/` du job Pages.

Exemple d'idée de déploiement :

```yaml
pages:
  stage: deploy
  script:
    - mkdir public
    - cp -r index.html style.css app.js data tracks photos vendor public/
  artifacts:
    paths:
      - public
  only:
    - main
```

## Intégrer dans un site Hugo

Pour intégrer cette carte dans Hugo, copiez le dossier dans :

```text
static/running-map/
```

Le site sera alors accessible à l'URL :

```text
/running-map/index.html
```

Gardez les chemins relatifs existants. Ils fonctionnent aussi bien depuis `file:///` que depuis un dossier statique publié.

## Ajouter une nouvelle course

1. Créez un fichier de trace dans `tracks/`, par exemple `tracks/demo-namur.geojson.js`.
2. Définissez une variable globale :

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

3. Ajoutez ce script dans `index.html` avant `data/runs.js`.
4. Ajoutez une entrée dans `data/runs.js` :

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

5. Ajoutez éventuellement des miniatures SVG dans `photos/demo-namur/`, puis référencez-les avec un chemin relatif comme `./photos/demo-namur/photo-001-thumb.svg`.

## Convertir un GPX manuellement

Un script Python peut convertir une trace GPX en fichier JavaScript compatible avec le site :

```bash
python scripts/gpx_to_geojson_js.py input.gpx \
  --id sortie-test \
  --title "Sortie test" \
  --date 2026-05-14 \
  --var-name TRACK_SORTIE_TEST \
  --output tracks/sortie-test.geojson.js
```

Le script crée un fichier `tracks/*.geojson.js` qui définit une variable globale `window.*`, puis affiche un résumé et un snippet à copier manuellement dans `data/runs.js`.

Par défaut, le dénivelé positif ignore les hausses de moins de 3 m pour limiter le bruit GPS. Vous pouvez ajuster ce seuil avec `--elevation-threshold-m`. Si le fichier de sortie existe déjà, ajoutez `--force` pour l'écraser.

## Import massif depuis le dossier ADEPS

Le script `scripts/import_adeps_folder.py` scanne récursivement un dossier source
ADEPS et détecte les dossiers nommés avec la convention :

```text
YYYY-MM-DD - Lieu
```

Exemples :

```text
2026-05-10 - Spa
2026-03-08 - Oneux (Comblain au pont)
2025\2025-01-19 - Aywaille
```

Commande Windows depuis `cmd.exe` :

```cmd
python scripts\import_adeps_folder.py "G:\Dropbox\Mine\Sport\ADEPS" --output . --force
python scripts\import_adeps_folder.py "G:\Dropbox\Mine\Sport\ADEPS" --output . --photos --force
```

Le script ne modifie jamais le dossier source : il lit les GPX et génère seulement
ces fichiers dans le projet :

```text
tracks\generated-tracks.js
data\generated-runs.js
```

Avec `--photos`, il lit aussi les dossiers `photos\` presents dans les dossiers
de course et genere des copies web legeres, nettoyees de leurs metadonnees, dans :

```text
photos\generated\{run_id}\photo-001-thumb.jpg
photos\generated\{run_id}\photo-001-web.jpg
```

Les originaux Dropbox ne sont jamais modifies, deplaces ou supprimes. Aucun
nettoyage automatique des anciennes photos generees n'est effectue dans cette V1.
Les images generees servent a la consultation web dans la carte, pas a
l'archivage haute qualite. Les originaux restent la reference dans Dropbox.

Les démos pédagogiques restent dans `data\runs.js`. Les courses importées sont
ajoutées séparément via `window.GENERATED_RUNS`, et leurs traces via
`window.GENERATED_TRACKS`.

Choix du GPX dans chaque dossier de course :

1. `track.gpx` s'il existe ;
2. sinon l'unique fichier `.gpx` du dossier ;
3. sinon le dossier est ignoré avec un avertissement clair.

La distance et le dénivelé positif approximatif sont calculés sur la trace GPX
complète. Ensuite seulement, la géométrie exportée est simplifiée pour réduire
la taille de `generated-tracks.js`.

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

Par défaut, `--default-visible` vaut `false` pour éviter d'afficher trop de
traces importées d'un coup. La tolérance de simplification vaut `5.0` mètres.
Le dénivelé positif reste approximatif, car les altitudes GPS peuvent être
bruitées.

L'import photo V1 accepte uniquement `.jpg`, `.jpeg` et `.png`. Les autres
formats sont ignores avec un avertissement. Les coordonnees GPS EXIF, si elles
existent, sont copiees dans `data/generated-runs.js`; les fichiers JPEG publies
ne conservent pas les EXIF. Sans `--force-photos`, les fichiers thumb/web deja
presents ne sont pas reecrits, mais les metadonnees photo sont tout de meme
regenerees dans `generated-runs.js`.

Par defaut, les miniatures sont generees en `180x112`, soit la taille affichee
dans les popups photo de la carte. Les images web font au maximum 800 px, avec
une qualite JPEG de 75. Ces valeurs privilegient un site leger et beaucoup de
photos visibles plutot qu'une restitution haute resolution. Elles peuvent etre
ajustees avec `--photo-thumb-size`, `--photo-web-size` et `--photo-quality`.

## Pourquoi pas `fetch()`, modules, npm ou serveur local ?

Cette V1 cible un usage pédagogique et un démarrage par double-clic. Certains navigateurs limitent les chargements de fichiers locaux avec `fetch()` depuis `file:///`. Les modules JavaScript peuvent aussi introduire des contraintes de chargement selon le contexte local.

Le projet utilise donc uniquement des scripts classiques qui définissent des variables globales sur `window`. Cela rend l'ordre de chargement explicite, facile à comprendre, et compatible avec un simple fichier `index.html` ouvert localement.



---

# Notes diverses manuelles

## commandes exécutées 
...pour convertir les fichiers Dropbox

```
python -B scripts\import_adeps_folder.py "G:\Dropbox\Mine\Sport\ADEPS" --output . --force
```
output:
```
Tolérance simplification : 5 m
Courses importées : 62
Points source : 500488
Points exportés : 16143
generated-tracks.js : ~428 Ko
```
