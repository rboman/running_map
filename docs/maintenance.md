# Maintenance avancée

[Retour au mode d'emploi](../README.md)

Exécuter les commandes depuis la racine du projet, avec le venv activé.
Le cycle habituel est décrit dans le README ; cette page couvre la configuration
initiale de R2 et les opérations occasionnelles.

## Configurer R2 sur une machine

Le script `install_rclone.py` installe une version précise de rclone depuis le
site officiel, après vérification de `SHA256SUMS`. La version par défaut est
celle de `DEFAULT_VERSION` dans [le script](../scripts/install_rclone.py).
Pour en choisir une autre : `python scripts/install_rclone.py --version X.Y.Z`.
L'installation locale, ignorée par Git, doit être refaite sur chaque PC.

Sur Ubuntu :

```bash
.tools/rclone/rclone version
.tools/rclone/rclone listremotes
.tools/rclone/rclone config
```

Sous Windows (`cmd`), utiliser `.tools\rclone\rclone.exe` à la place de
`.tools/rclone/rclone` dans les commandes rclone de cette page.

Si `r2-runningmap:` apparaît déjà dans `listremotes`, la configuration existe.
Sinon, créer ce remote en suivant le [guide officiel Cloudflare](https://developers.cloudflare.com/r2/examples/rclone/), avec :

| Réglage | Valeur |
| --- | --- |
| Nom du remote | `r2-runningmap` |
| Type de stockage | S3 |
| Fournisseur | Cloudflare |
| Endpoint | L'endpoint S3 indiqué par Cloudflare pour ton compte R2 |
| Identifiants | Access Key ID et Secret Access Key autorisés sur le bucket |
| Bucket existant utilisé par le projet | `runningmap-photos` |

Il faut pouvoir lire et écrire les objets, et les supprimer si l'on utilise
`cleanup`. Les identifiants restent dans la configuration utilisateur de rclone,
jamais dans Git. L'outil réutilise cette configuration même avec l'exécutable local.

Pour lire l'inventaire sans modifier R2 :

```bash
.tools/rclone/rclone lsf r2-runningmap:runningmap-photos/photos/generated --dirs-only
```

L'outil préfère `.tools/rclone/rclone` (ou `rclone.exe` sous Windows) ; à défaut,
il utilise `rclone` dans le PATH. Il affiche l'exécutable choisi à chaque opération.

## Commandes de contrôle

| Commande | Contrôle effectué |
| --- | --- |
| `python scripts/manage_photos.py verify-local` | Images locales, manifeste et données générées concordent. |
| `python scripts/manage_photos.py copy --dry-run` | Simulation des transferts, sans changement sur R2. |
| `python scripts/manage_photos.py copy` | Copie sans suppression, suivie d'une comparaison complète des contenus distants. |
| `python scripts/manage_photos.py verify-remote` | Répète uniquement cette comparaison avec R2. |
| `python scripts/manage_photos.py verify-public` | Compare les deux fichiers de données, `app.js`, `config/site-config.js`, `index.html` et `style.css` au site publié, en tolérant les fins de ligne Windows. |

`verify-public` ne remplace pas le contrôle visuel ni la vérification des images
sur leur domaine public. Les utilitaires R2 ne traitent que `photos/generated/` ;
les photos ajoutées manuellement ailleurs doivent être publiées séparément.

Les lanceurs `tools/dry_run_sync_photos_to_r2.cmd`, `tools/sync_photos_to_r2.cmd`
et `tools/upload_photos_to_r2.cmd` appellent cet outil. Le premier simule la copie ;
les deux autres copient et vérifient. Ils ne demandent pas de confirmation `y`
et ne suppriment pas de fichiers distants malgré le nom « sync ».

## Nettoyer les anciennes photos R2

À faire **après publication et contrôle du site**, depuis le PC qui possède
l'import complet correspondant. Garder de la place pour la sauvegarde locale.

```bash
python scripts/manage_photos.py cleanup --dry-run
python scripts/manage_photos.py cleanup
```

La simulation affiche la liste des objets inutilisés. La commande réelle :

1. Vérifie le site public et les images actuelles sur R2.
2. Liste les objets de `photos/generated/` absents du manifeste publié.
3. Les copie dans `backups/r2-<date UTC>/photos/generated/` et vérifie les contenus.
4. Revérifie le manifeste et le site, puis supprime uniquement la liste inventoriée.
5. Vérifie de nouveau les images actuelles sur R2.

L'import et `copy` ne déclenchent jamais ce nettoyage. Les autres chemins du
bucket restent intacts. Les anciens onglets ou versions du site peuvent perdre
leurs images après suppression ; conserver la sauvegarde si un retour arrière
reste utile. Les anciennes copies locales de `photos/generated/` ne sont pas
supprimées par cet outil.

## Restaurer une sauvegarde

Le dossier daté contient `cleanup.json` (destination et inventaire) et
`obsolete.txt` (liste des objets sauvegardés). Lire cet inventaire avant restauration.
Remplacer `DATE_UTC` ci-dessous par le nom de la sauvegarde choisie :

```bash
.tools/rclone/rclone copy backups/r2-DATE_UTC/photos/generated r2-runningmap:runningmap-photos/photos/generated --checksum --s3-no-head --s3-acl private --s3-no-check-bucket
.tools/rclone/rclone check backups/r2-DATE_UTC/photos/generated r2-runningmap:runningmap-photos/photos/generated --download --one-way
```

Ces commandes restaurent les images sans supprimer les fichiers actuels.
Revenir à une ancienne version des données ou du code du site est une opération
Git distincte ; la restauration des photos seule ne modifie pas le site.

## Dépannage

| Symptôme | Action |
| --- | --- |
| Source ADEPS introuvable | Vérifier `config/local.ini`, le montage du disque et la fin de la synchronisation Dropbox. |
| Photos manquantes en local | Réimporter avec `--photos` et ouvrir `index.html` en `file:///`. Les photos générées ne viennent pas avec le clone Git. |
| Anciennes images en aperçu HTTP local | Une URL HTTP utilise `PHOTO_BASE_URL`. Ouvrir le fichier par double-clic pour contrôler les copies locales. |
| Manifeste absent ou périmé | Relancer `python scripts/import_adeps_folder.py --photos --force`, puis `verify-local`. |
| Publication refusée après import | Examiner les avertissements et dossiers ignorés ; importer tous les parcours avec photos, sans `--year`. Il faut au moins une photo référencée pour utiliser l'outil R2. |
| Image générée absente ou altérée | Un nouvel import la recrée. `--force-photos` force le recalcul de toutes les photos. |
| `verify-public` signale une différence | Attendre le déploiement GitHub Pages ; vérifier la branche publiée, les fichiers committés et l'URL du site. Ne pas nettoyer R2 tant que ce contrôle échoue. |
| Remote inconnu ou accès refusé | Vérifier `listremotes`, les identifiants et leurs droits sur le bucket de cette machine. |
| Erreur rclone `501 Not Implemented` après un transfert | Utiliser `manage_photos.py`, qui évite la requête HEAD versionnée incompatible et vérifie les contenus par téléchargement ; installer la version locale avec `install_rclone.py`. |

La configuration et les limites du cache sont décrites dans la
[référence technique](developpement.md#identité-des-photos-et-publication).
