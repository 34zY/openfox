# OpenFox — Roadmap features (monstre)

Décisions validées: ordre **Chat → Discord → Remote**; chat = **read-only optionnel**; bridge **Discord d'abord**; **plugins quand possible**.
openfox: TS/Node, service systemd `openfox`, `src/server` (tools spawn+fs, agents=`.agent.md`, skills portables), `src/web` React, dispatch par `session.mode` (=agent id), config `~/.config/openfox`, build `npm run build` (tsup+vite), ports 10469 dev / 10369 prod.

---

## Feature 1 — Mode Chat simple [BACKEND FAIT · frontend restant]

But: parler/converser sans planifier ni build. Outils read-only optionnels.

- [x] **Agent `chat`** créé: `~/.config/openfox/agents/chat.agent.md` (id chat, prompt conversationnel, allowedTools read-only: read_file/describe_image/web_fetch/web_search/load_skill/ask_user/session_metadata — pas de write/edit/run_command/tasks). Découvert par registry (user agents), **sans rebuild**. Dispatch générique le gère (tout sauf `builder`).
- [ ] **Frontend**: option "Chat" à la création de session (mode='chat'); quand `session.mode==='chat'` → vue messages seule (masquer panneaux plan/criteria/tasks). Fichiers: composant new-session + vue session principale (`web/src/components/...`).
- [ ] Build web (vite) + restart service + test navigateur.
- Vérif: créer session Chat → convo pure, aucun plan/criteria, peut lire un fichier si demandé, refuse d'éditer.

## Feature 2 — Bridge Discord (plugin) [À FAIRE]

But: piloter/suivre les sessions openfox à distance depuis Discord.

- Impl en **plugin openfox** (`docs/PLUGIN-ARCHITECTURE.md`, `src/server/plugins`) = non-invasif, survit aux updates.
- Bot discord.js, **restreint à ton user id**. Commandes: list/create/select session, envoyer message, statut; **stream** des updates agent (tool calls, résultats, questions `ask`) en DM.
- Point d'intégration: API/WebSocket openfox (le plugin s'abonne aux events de session et relaie).
- Secrets: token bot + user id autorisé dans la config du plugin (pas en dur).
- Phase 2: Signal (signal-cli + device lié).
- Vérif: depuis Discord, créer une session, lui parler, recevoir le flux; une question `ask` de l'agent arrive en DM et ta réponse est réinjectée.

## Feature 3 — Remote workspace (SSH) [PLAN]

But: ouvrir dans openfox/monstre un projet qui vit sur Windows; openfox agit dessus via SSH.

- **Abstraction `WorkspaceBackend`** (local | ssh). Aujourd'hui tout est local: `spawnShellProcess(cmd,cwd)` + node fs (read/write/edit/file-tracker) contre `workspaceRootDir`.
- Projet gagne un config `remote {host,user,keyPath,remoteRoot,shell}` (étend la table projects qui a déjà `workspaceRootDir`).
- Router `shell.ts`/`read.ts`/`write.ts`/`edit.ts`/`file-tracker` via le backend:
  - **exec**: `ssh2` connexion persistante (ou `ssh` système + ControlMaster) → `cd remoteRoot/cwd && cmd`.
  - **fichiers**: **SFTP** (ssh2-sftp-client) pour read/write/edit/stat/list.
- **LSP/diagnostics/camofox = local-only** → désactivés (avec avis clair) pour un projet remote au MVP. Phase 2: LSP distant via tunnel.
- **Cible Windows**: OpenSSH Server + un **bash** côté Windows (Git Bash ou WSL) car l'agent émet des commandes POSIX; mapping chemins `D:\proj` ↔ `/d/proj` (ou chemin WSL). Alternative: shell `powershell` par projet + traduction (plus lourd).
- Effort: moyen-gros (touche toute la couche exec/fs). MVP = exec + fichiers en remote, LSP off.
- Vérif: projet remote pointant un dossier Windows → `run_command` s'exécute sur Windows via SSH, edit d'un fichier via SFTP visible côté Windows, diff/commit git OK.

---

## État global (session 2026-09-30)

- Ling-3.0-flash (124B/5.1B, MIT, agentique): download GGUF Q5_K_M en cours (~85G) → à câbler dans llama-swap + bench après.
- Wiggle: 40 skills installés dans `~/.config/openfox/skills/{public,examples}` (portable, sans conversion).
- Optim inférence: plan `~/monstrectl/INFERENCE_OPTIMIZATION_PLAN.md` (corrigé: q8 KV = 0 gain sur le fork actuel, vérifié bench; vrai levier = fork Nathanw + fixes FA).

---

## MAJ 2026-09-30 (fin de session)

- Ling-3.0-flash: RESOLU + cable. Cause = GGUF AtomicChat casse (manquait tensors SSM/KDA `ssm_f_a`). Fix = GGUF reference bloomer010 UD-Q4_K_XL + build llama.cpp upstream (~/llama.cpp-upstream, bailingmoe3). Cable dans llama-swap `ling3-flash` (binaire upstream + `--spec-type draft-mtp`), ~40 t/s, visible monstrectl.
- Chat mode: BUILD + DEPLOYE (agent chat + polish vue sidebar). Bug typecheck pre-existant `Mode` (run-headless.ts) repare.
- Bridge multi-canal: monstrectl panneau "bridge distant" (config partagee `~/.config/monstre-bridge/config.json`, token masque chmod600) FAIT + teste. Plugin openfox `~/.config/openfox/plugins/monstre-bridge/` INSTALLE (discord.js, node --check OK) — a ACTIVER (Plugins tab + token dans monstrectl). Outbound=hooks, inbound=API HTTP openfox (besoin token API). Signal inbound=phase2.
- RESTE: remote workspace (non commence); Signal inbound; verifier champs inbound au 1er test live Discord.

## MAJ remote workspace (2026-09-30)

- openfox shell.ts: remote-routing GATED ajoute (wrapRemote/remoteRoute) + injecte avant executeCommand. Local INCHANGE (47 tests verts, typecheck clean, build+deploy OK). Config `~/.config/openfox/remote-map.json` (vide = passthrough). Fichiers via sshfs; commandes via SSH vers Windows.
- RESTE cote user: Windows OpenSSH Server + WSL (admin), sshfs mount box->Windows, remplir remote-map.json. Guide: ~/openfox/REMOTE_WORKSPACE.md. Non testable sans le SSHD Windows.
