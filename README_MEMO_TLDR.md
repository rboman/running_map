# TLDR - mémo humain



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
