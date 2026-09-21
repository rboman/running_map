# 🏃🏻‍➡️ RunningMap

Mini-site statique pour afficher des marches et courses sur une carte Leaflet.

![](screenshot-desktop.png)

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
  siteTitle: "🏃🏻‍➡️RunningMap",
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

- `PHOTO_BASE_URL` : préfixe public des photos sur HTTP/HTTPS. En `file:///`, les copies locales sont toujours utilisées, même si ce préfixe est renseigné.
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

### Configurer chaque machine

Copiez `config/local.example.ini` vers `config/local.ini`, puis renseignez le
chemin de votre dossier ADEPS, sans guillemets :

```ini
[import]
adeps_dir = G:/Dropbox/Mine/Sport/ADEPS
```

Sur Linux, utilisez par exemple `/home/roger/Dropbox/Mine/Sport/ADEPS`.
Chaque machine conserve son propre `config/local.ini`, ignoré par Git ; le
modèle reste partagé dans le dépôt. Aucune dépendance Python supplémentaire
n'est nécessaire. Cette configuration sert uniquement à l'import Python.

Depuis la racine du projet, lancez :

```text
python scripts/import_adeps_folder.py --photos --dry-run
python scripts/import_adeps_folder.py --photos --force
```

Sur Linux, utilisez `python3` si nécessaire. Le fichier INI est retrouvé à partir
de l'emplacement du script, même depuis un autre dossier. Un chemin relatif dans
l'INI est interprété depuis la racine du projet ; `~` désigne le dossier personnel.
La destination reste le dossier courant par défaut : depuis un autre dossier,
précisez `--output` avec le chemin du projet.

Le chemin source passé dans la commande reste prioritaire et permet d'importer
un autre dossier sans modifier la configuration locale. Un chemin relatif passé
en argument reste relatif au dossier courant. Si la configuration manque, est
invalide ou désigne un dossier inexistant, l'import s'arrête avec un message
d'erreur avant toute génération.

### Fournir le chemin dans la commande

Commande de base depuis Windows (toujours utilisable sans fichier INI) :

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
photos/generated/{run_id}/photo-<SHA256 du JPEG miniature>-thumb.jpg
photos/generated/{run_id}/photo-<SHA256 du JPEG web>-web.jpg
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
python scripts\import_adeps_folder.py "G:\Dropbox\Mine\Sport\ADEPS" --output . --photos --dry-run
python scripts\import_adeps_folder.py "G:\Dropbox\Mine\Sport\ADEPS" --output . --photos --force --force-photos
```

Options disponibles :

```text
source_dir (facultatif si config/local.ini est renseigné)
--output
--force
--dry-run
--year
--elevation-threshold-m
--simplify-tolerance-m
--photos / --with-photos
--photo-thumb-size
--photo-web-size
--photo-quality
--force-photos
```

Valeurs par défaut importantes :

- `--simplify-tolerance-m 5.0` ;
- `--elevation-threshold-m 3.0` ;
- miniatures de 180 px de large ;
- images web limitées à 800 px ;
- qualité JPEG 75.

L'import photo accepte `.jpg`, `.jpeg` et `.png`. Les vidéos `.mp4`, `.mov`, `.m4v` et `.avi` sont signalées comme ignorées ; les autres formats non supportés déclenchent un avertissement. Si une photo contient des coordonnées GPS EXIF, elles sont copiées dans `data/generated-runs.js` pour placer le marqueur photo sur la carte.

## Photos locales, cache et publication Cloudflare R2

Les photos portent une empreinte SHA256 de leur contenu JPEG, et non leur numéro
dans la galerie. Ajouter, supprimer ou renommer une source ne réattribue donc
jamais l'adresse d'une image à une autre. L'ordre d'affichage reste celui des noms
sources triés. Les GPS et légendes proviennent toujours de la source correspondante.

À l'ouverture par double-clic (`file:///`), le site utilise **les photos locales**.
Sur HTTP/HTTPS, il utilise `PHOTO_BASE_URL` dans `config/site-config.js`, actuellement
`https://runningmap-photos.rboman.dev`. Pas de repli automatique vers R2 si une
photo locale manque : sur un nouveau PC, il faut d'abord importer avec `--photos`.

Le cache `.cache/photo-import.json` évite de réencoder les sources inchangées.
Il dépend des octets sources, des paramètres et des versions du convertisseur,
de Pillow et de JPEG. Les fichiers réutilisés sont vérifiés par leur empreinte.
Une sortie absente ou altérée est recréée. Le cache peut être supprimé sans perte :
le prochain import sera simplement plus lent. Il reste propre à chaque machine,
ignoré par Git, et n'est jamais transféré à R2. Une version différente de Pillow
peut produire de nouvelles adresses ; elle ne peut pas mélanger les images.

`--force` autorise le remplacement des données JavaScript ; `--force-photos`
force le recalcul des JPEG. `--dry-run` ne modifie ni images, ni données, ni cache
(même s'il doit calculer en mémoire des images encore inconnues).

### Procédure habituelle, Ubuntu et Windows

Sur Ubuntu, activer l'environnement avec `source .venv/bin/activate` ; sur Windows,
avec `.venv\Scripts\activate.bat`. Exécuter depuis la racine du projet :

1. Attendre la synchronisation complète des sources Dropbox. Ne pas publier
   simultanément depuis deux PC.
2. Importer **tous** les parcours et leurs photos, sans `--year` :

   ```text
   python scripts/import_adeps_folder.py --photos --force
   python scripts/manage_photos.py verify-local
   ```

3. Examiner le bilan (aucun avertissement ni dossier ignoré), puis ouvrir
   `index.html`. Vérifier les galeries, légendes et marqueurs GPS.
4. Simuler puis copier seulement les images référencées, sans suppression :

   ```text
   python scripts/manage_photos.py copy --dry-run
   python scripts/manage_photos.py copy
   ```

5. Une fois la vérification réussie, committer et pousser les modifications du
   site, y compris les deux fichiers JavaScript générés. Attendre GitHub Pages.
6. Vérifier que la version publique correspond exactement à la version locale :

   ```text
   python scripts/manage_photos.py verify-public
   ```

L'utilitaire utilise `rclone`, configuré sur chaque PC avec le remote
`r2-runningmap`. Il accepte `--root`, `--remote` (défaut :
`r2-runningmap:runningmap-photos`) et `--site-url` (défaut :
`https://runningmap.rboman.dev`). `verify-remote` compare les contenus téléchargés,
pas seulement leurs tailles ; cette vérification est aussi exécutée automatiquement
à la fin de `copy`. Les opérations distantes restent confinées à
`photos/generated/` dans le bucket.

L'outil passe explicitement `--s3-acl private --s3-no-check-bucket`, conformément
à la [configuration R2 de rclone](https://developers.cloudflare.com/r2/examples/rclone/).
L'accès public reste celui du domaine R2 configuré sur le bucket ; ces options
ne changent pas cette configuration.

La copie utilise également `--s3-no-head` pour éviter une requête HEAD avec
`versionId` émise par l'ancien rclone Ubuntu après un upload : R2 la refuse avec
`501 Not Implemented`, même quand le fichier a bien été reçu. Cette vérification
est remplacée par **la comparaison obligatoire de tous les contenus téléchargés**
avant que `copy` ne termine avec succès. La commande `verify-remote` permet de
répéter ce contrôle indépendamment.

L'import crée `.cache/photo-manifest.json`, qui relie les images référencées aux
empreintes des deux fichiers JavaScript. Une modification ultérieure des données,
un import partiel ou des images altérées empêchent la publication par cet outil.
Relancer un import complet pour reconstruire le manifeste. Le manifeste reste
local ; il ne sert pas au chargement du site.

Les anciens lanceurs Windows `tools/dry_run_sync_photos_to_r2.cmd`,
`tools/sync_photos_to_r2.cmd` et `tools/upload_photos_to_r2.cmd` utilisent désormais
cet outil. Malgré le nom historique « sync », **ils ne suppriment plus rien**.

### Nettoyer les anciennes images séparément

Après publication et contrôle visuel du site :

```text
python scripts/manage_photos.py cleanup --dry-run
python scripts/manage_photos.py cleanup
```

Le nettoyage exige que le site public corresponde aux fichiers locaux et vérifie
les images actuelles sur R2. Il inventorie seulement les objets de
`photos/generated/` absents du manifeste publié, les sauvegarde dans
`backups/r2-<date UTC>/photos/generated/`, vérifie cette copie, puis supprime
uniquement la liste inventoriée. Aucun nettoyage n'a lieu pendant l'import.

Le dossier de sauvegarde, ignoré par Git, contient `cleanup.json` et `obsolete.txt`.
Pour restaurer une sauvegarde, remplacer `<date UTC>` dans cette commande :

```text
rclone copy backups/r2-<date UTC>/photos/generated r2-runningmap:runningmap-photos/photos/generated --checksum --s3-no-head --s3-acl private --s3-no-check-bucket
rclone check backups/r2-<date UTC>/photos/generated r2-runningmap:runningmap-photos/photos/generated --download --one-way
```

Conserver cette sauvegarde tant qu'un retour à une ancienne version du site reste
utile : les anciennes pages ou les onglets non rechargés peuvent sinon référencer
des images supprimées. Les fichiers hors de `photos/generated/` restent intacts.

## Vérifications des utilitaires

```text
python -m unittest discover -s tests -v
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
