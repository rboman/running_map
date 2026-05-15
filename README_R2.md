# Upload des photos RunningMap vers Cloudflare R2

Les photos ne sont pas stockées dans Git.
Elles sont synchronisées vers le bucket Cloudflare R2 `runningmap-photos`.

URL publique actuelle :
https://pub-3f924d453f9647d78e861450e9ee52bf.r2.dev

Configuration RunningMap :
config/site-config.js
PHOTO_BASE_URL = "https://pub-3f924d453f9647d78e861450e9ee52bf.r2.dev"

Simulation :
tools\dry_run_sync_photos_to_r2.cmd

Synchronisation réelle :
tools\sync_photos_to_r2.cmd

Attention :
`rclone sync` supprime côté R2 les fichiers absents du dossier local `photos/`.
Toujours lancer le dry-run avant le vrai sync.