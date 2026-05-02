#!/usr/bin/env bash
# Crée le dépôt GitHub, ajoute origin et pousse la branche courante.
# Prérequis : `brew install gh` puis `gh auth login` (une fois).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

REPO_NAME="${1:-satisfactory-remodeller}"

if ! command -v gh >/dev/null 2>&1; then
  echo "Installez GitHub CLI : brew install gh"
  exit 1
fi

if ! gh auth status &>/dev/null; then
  echo "Connectez-vous d’abord à GitHub dans ce terminal :"
  echo "  gh auth login"
  echo "Choisissez GitHub.com, HTTPS, et authentifiez-vous (navigateur ou token)."
  exit 1
fi

if git remote get-url origin &>/dev/null; then
  echo "Le remote « origin » existe déjà :"
  git remote -v
  echo "Pour pousser : git push -u origin \"$(git branch --show-current)\""
  exit 0
fi

echo "Création du dépôt « ${REPO_NAME} » sur votre compte et push…"
gh repo create "$REPO_NAME" --public --source=. --remote=origin --push

LOGIN="$(gh api user -q .login)"
echo "Terminé — dépôt : https://github.com/${LOGIN}/${REPO_NAME}"
