# Remote workspace (openfox sur monstre -> projet sur Windows via SSH)

Le code openfox est modifie (gated): quand le repertoire de travail d'une commande tombe
sous un montage configure, la commande est re-executee sur la machine distante via SSH
dans le chemin mappe. **Sans montage configure, le comportement local est inchange** (teste,
47 tests verts). Les fichiers passent par un montage sshfs (read/write/edit openfox marchent
tels quels). Les commandes (build/npm/git) tournent sur Windows.

## 1. Windows : OpenSSH Server + WSL (admin, une fois)

```powershell
# PowerShell admin sur le PC Windows :
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
Start-Service sshd; Set-Service sshd -StartupType Automatic
New-NetFirewallRule -Name sshd -DisplayName 'OpenSSH Server' -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22 -RemoteAddress 192.168.1.0/24
```

Shell POSIX cote Windows (openfox emet des commandes bash). Le plus simple = **WSL** :
les commandes tourneront via `wsl bash -l`, ou `D:\proj` est vu comme `/mnt/d/proj`.
(WSL doit etre installe : `wsl --install` si absent.)

Cle publique de la box autorisee cote Windows : ajoute la cle publique
`~/.ssh/monstre_key.pub` (de la box) dans `C:\Users\<toi>\.ssh\authorized_keys` (ou WSL
`~/.ssh/authorized_keys` selon le shell cible), pour un SSH sans mot de passe box->Windows.

## 2. Box : montage sshfs du projet Windows

```bash
# sur la box (installer sshfs si besoin : sudo apt install sshfs)
mkdir -p ~/remote/winproj
sshfs <toi>@192.168.1.42:/mnt/d/proj ~/remote/winproj \
  -o idmap=user,reconnect,ServerAliveInterval=15
# (chemin distant en notation du shell cible : /mnt/d/proj pour WSL)
```

## 3. Box : declarer le mapping pour openfox

`~/.config/openfox/remote-map.json` :

```json
[
  {
    "mountPath": "/home/monstre/remote/winproj",
    "host": "192.168.1.42",
    "user": "<toi>",
    "remotePath": "/mnt/d/proj",
    "key": "/home/monstre/.ssh/monstre_key",
    "shell": "wsl bash -l"
  }
]
```

- `mountPath` = ou le projet est monte sur la box (= workdir du projet openfox).
- `remotePath` = meme dossier vu par le shell distant (WSL : `/mnt/d/...`).
- `shell` = `wsl bash -l` (WSL) ou `bash -l` (Git Bash comme shell SSH par defaut).
- Modifiable a chaud : openfox recharge le fichier a chaque commande (mtime).

## 4. Dans openfox

Cree un projet dont le **workspace** pointe sur `~/remote/winproj`. Desormais :

- read/write/edit -> agissent sur les fichiers Windows (via sshfs).
- run_command -> s'execute **sur Windows** dans `/mnt/d/proj` (via SSH).

## Limites (MVP)

- LSP / diagnostics / camofox restent locaux (peu utiles en remote) — non route.
- Latence sshfs sur gros arbres ; garde le projet raisonnable.
- Teste le 1er `run_command` (ex: `pwd`, `ls`) pour valider le mapping avant du lourd.
- Verifie que la cle box est bien autorisee cote Windows (SSH sans mot de passe).

```

```
