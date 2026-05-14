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

## Pourquoi pas `fetch()`, modules, npm ou serveur local ?

Cette V1 cible un usage pédagogique et un démarrage par double-clic. Certains navigateurs limitent les chargements de fichiers locaux avec `fetch()` depuis `file:///`. Les modules JavaScript peuvent aussi introduire des contraintes de chargement selon le contexte local.

Le projet utilise donc uniquement des scripts classiques qui définissent des variables globales sur `window`. Cela rend l'ordre de chargement explicite, facile à comprendre, et compatible avec un simple fichier `index.html` ouvert localement.
