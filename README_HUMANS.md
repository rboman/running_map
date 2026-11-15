# README_HUMANS

> [!IMPORTANT]
> Ce fichier peut être lu mais **ne doit jamais être modifié par les agents IA**. C'est le pendant "humain" de `AGENTS.md`. Les agents peuvent néanmoins attirer mon attention sur des erreurs et suggérer des modifications.



## Comment mettre à jour le site?

**Procédure mise à jour :** 21 septembre 2026

* Installer/mettre à jour venv python

```
rd /Q/S .venv/
py -m venv .venv  
.venv\Scripts\activate.bat 
python.exe -m pip install --upgrade pip
python -m pip install -r requirements.txt
```
Linux:
```
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```


* Ajoute les derniers runs ADEPS sur la Dropbox

```
python scripts\import_adeps_folder.py "G:\Dropbox\Mine\Sport\ADEPS" --output . --photos --force
```
Linux:
```
python scripts/import_adeps_folder.py --photos --dry-run
python scripts/import_adeps_folder.py --output . --photos --force
```


* Copier les photos référencées vers **Cloudflare R2**, sans suppression :

```
tools\dry_run_sync_photos_to_r2.cmd  
```
(vérifier la simulation) puis (copier et vérifier le contenu distant) :
```
tools\sync_photos_to_r2.cmd
```

Ces commandes ne demandent plus de confirmation `y`.

Après réussite de la copie et de la vérification, commit puis push des données générées sur GitHub => le site web va être généré sur GitHub Pages.



---

## Autres notes

### Upload des photos RunningMap vers Cloudflare R2

Les photos ne sont pas stockées dans Git. Les images référencées par le manifeste local sont copiées et vérifiées dans le bucket Cloudflare R2 `runningmap-photos`.

Exemple:

URL publique (si pas de nom de domaine): https://pub-3f924d453f9647d78e861450e9ee52bf.r2.dev

Configuration actuelle RunningMap : champ de `window.RUNNING_MAP_CONFIG` dans `config/site-config.js` :

```
PHOTO_BASE_URL: "https://runningmap-photos.rboman.dev",
```

Simulation:

```
tools\dry_run_sync_photos_to_r2.cmd
```

Copie réelle et vérification du contenu distant :

```
tools\sync_photos_to_r2.cmd
```

Attention:

Malgré leur nom « sync », ces lanceurs utilisent désormais `manage_photos.py copy` : ils ne suppriment aucun fichier sur R2. Toujours lancer le dry-run avant la copie. Le nettoyage est une opération séparée, avec sauvegarde préalable, décrite dans [la documentation de maintenance](docs/maintenance.md#nettoyer-les-anciennes-photos-r2).
