# 🏃🏻‍➡️ RunningMap

Un site statique pour afficher des parcours GPX et leurs photos sur une carte.
Il s'ouvre par double-clic sur `index.html`, sans serveur ni compilation.

[Voir le site](https://runningmap.rboman.dev/) · [Maintenance avancée](docs/maintenance.md) · [Adapter ou développer le projet](docs/developpement.md)

## 1. Installer sur un nouveau PC

Prévoir **Git, Python 3.9 ou plus récent**, et une copie locale complète des sources
ADEPS (GPX et photos, par exemple synchronisés par Dropbox). Cloner
[ce dépôt](https://github.com/rboman/running_map) ou son fork, puis ouvrir un terminal
à la racine du projet.

### Préparer Python

Sur **Ubuntu** :

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

Si la création du venv échoue faute de module `venv`, installer `python3-venv`
avec `sudo apt install python3-venv`, puis réessayer.

Sur **Windows, dans l'invite de commandes (`cmd`)** :

```bat
py -m venv .venv
.venv\Scripts\activate.bat
python -m pip install -r requirements.txt
```

Dans chaque nouveau terminal, réactiver le venv avec la commande d'activation
correspondante. Les commandes suivantes s'exécutent depuis la racine du projet.

### Indiquer les sources de cette machine

Copier [config/local.example.ini](config/local.example.ini) vers `config/local.ini`
et renseigner le chemin **sans guillemets** :

```ini
[import]
adeps_dir = /chemin/vers/Dropbox/Mine/Sport/ADEPS
```

Sous Windows, utiliser par exemple `G:/Dropbox/Mine/Sport/ADEPS`.
Chaque PC garde son propre `local.ini` et son propre venv ; ils ne sont pas dans Git.

### Préparer la publication des photos

```bash
python scripts/install_rclone.py
```

L'exécutable est installé dans `.tools/rclone/` et utilisé automatiquement.
Si le remote `r2-runningmap` n'est pas déjà configuré sur ce PC, suivre
[la configuration R2](docs/maintenance.md#configurer-r2-sur-une-machine).
Cette étape n'est nécessaire que pour publier, pas pour consulter le site local.
Pour créer ton propre site, [adapter aussi les destinations](docs/developpement.md#créer-son-propre-site) :
les commandes ci-dessous utilisent le bucket et le domaine de ce dépôt.

## 2. Générer et vérifier localement

Récupérer les changements Git **avant l'import**, puis attendre la fin de la
synchronisation Dropbox. Les dossiers sources suivent ce modèle :

```text
ADEPS/2026/2026-09-20 - Stembert/track.gpx
ADEPS/2026/2026-09-20 - Stembert/photos/...
```

```bash
git pull --ff-only
python scripts/import_adeps_folder.py --photos --force
python scripts/manage_photos.py verify-local
```

L'import met à jour les parcours et crée les copies web des photos, sans toucher
aux originaux. Les photos inchangées sont réutilisées après vérification.
Pour simuler l'import avant toute génération : ajouter `--dry-run`.

**Ouvrir `index.html` par double-clic**, puis vérifier une galerie, les légendes
et les marqueurs GPS. En `file:///`, les photos sont locales ; le fond de carte
nécessite Internet. Une URL HTTP, même `localhost`, utilise la base photo publique
configurée. Ne pas utiliser `--year` pour préparer une publication complète.

## 3. Publier le site et les photos

**Les images d'abord, les données du site ensuite.** Ne pas publier depuis deux
PC en même temps. Si `verify-local` échoue, consulter le
[dépannage](docs/maintenance.md#dépannage) avant de continuer.

```bash
python scripts/manage_photos.py copy --dry-run
python scripts/manage_photos.py copy
```

`copy` transfère les images référencées, **ne supprime rien**, puis compare tous
les contenus distants aux copies locales. Attendre sa réussite avant de publier :

```bash
git status
git add data/generated-runs.js tracks/generated-tracks.js
git commit -m "Mettre à jour les parcours"
git push origin main
```

Si le code ou la configuration ont aussi changé, examiner et inclure ces fichiers
dans le commit. Dans ce dépôt, GitHub Pages publie la racine de `main`.
Attendre la fin du déploiement dans GitHub **Actions**, puis lancer :

```bash
python scripts/manage_photos.py verify-public
```

Ouvrir le [site public](https://runningmap.rboman.dev/) et contrôler le dernier
parcours. Le [nettoyage des anciennes photos R2](docs/maintenance.md#nettoyer-les-anciennes-photos-r2)
est une opération séparée et facultative, avec sauvegarde préalable.

## Pour aller plus loin

- [Maintenance avancée](docs/maintenance.md) : R2, dépannage, sauvegarde et restauration.
- [Adapter ou développer](docs/developpement.md) : personnalisation, import GPX, architecture et tests.
- [AGENTS.md](AGENTS.md) : consignes pour les agents de développement.

Les procédures de ce README font référence pour la maintenance. Les
[notes personnelles](README_HUMANS.md) complètent ce guide.
