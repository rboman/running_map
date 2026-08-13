# README_HUMANS

> [!IMPORTANT]
> Ce fichier peut être lu mais **ne doit jamais être modifié par les agents IA**. C'est le pendant "humain" de `AGENTS.md`. Les agents peuvent néanmoins attirer mon attention sur des erreurs et suggérer des modifications.



## Comment mettre à jour le site?

**Mise à jour du site web:** 9 aout 2026

* Installer/mettre à jour venv python

```
rd /Q/S .venv/
py -m venv .venv  
.venv\Scripts\activate.bat 
python.exe -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

* Ajoute les derniers runs ADEPS sur la Dropbox

```
python scripts\import_adeps_folder.py "G:\Dropbox\Mine\Sport\ADEPS" --output . --photos --force
```

* Sync les photos `photos/generated/` avec **Cloudflare R2**:

```
tools\dry_run_sync_photos_to_r2.cmd  
```
(check) puis (effectue le sync):
```
tools\sync_photos_to_r2.cmd
y      (pas "Y")
```

push le site sur github => le site web va être généré sur github pages.



---

## Autres notes

### Upload des photos RunningMap vers Cloudflare R2

Les photos ne sont pas stockées dans Git. Elles sont synchronisées vers le bucket Cloudflare R2 `runningmap-photos`.

Exemple:

URL publique (si pas de nom de domaine): https://pub-3f924d453f9647d78e861450e9ee52bf.r2.dev

Configuration RunningMap: ( `config/site-config.js` )

```
PHOTO_BASE_URL = "https://pub-3f924d453f9647d78e861450e9ee52bf.r2.dev"
```

Simulation:

```
tools\dry_run_sync_photos_to_r2.cmd
```

Synchronisation réelle:

```
tools\sync_photos_to_r2.cmd
```

Attention:

`rclone sync` supprime côté R2 les fichiers absents du dossier local `photos/`. Toujours lancer le dry-run avant le vrai sync.