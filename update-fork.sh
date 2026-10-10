#!/bin/sh
# update-fork.sh — update openfox fork from upstream without losing local patches.
# Rebase local commits onto upstream/develop. Never force. Abort+report on conflict.
set -e
cd ~/openfox

git fetch upstream --quiet
git fetch origin --quiet

AHEAD=$(git rev-list --count upstream/develop..HEAD)
BEHIND=$(git rev-list --count HEAD..upstream/develop)

if [ "$BEHIND" = "0" ]; then
  echo "deja a jour (0 commit upstream en retard)"
  exit 0
fi

echo "update: $BEHIND nouveaux commits upstream, $AHEAD commits locaux a rebaser"

if ! git rebase upstream/develop; then
  echo "CONFLIT: rebase abandonne, fork inchange. Resoudre a la main (git status)." >&2
  git rebase --abort
  exit 1
fi

npm run build >/tmp/openfox-update-build.log 2>&1 || {
  echo "BUILD FAILED, voir /tmp/openfox-update-build.log" >&2
  exit 1
}

sudo systemctl restart openfox
echo "OK: fork mis a jour sur upstream/develop ($BEHIND commits), patches locales preservees, service redemarre"
