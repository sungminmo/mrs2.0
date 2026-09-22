#!/bin/sh
set -eu

service=${1:-}
image_tag=${2:-}

case "$service" in
  customer) tag_key=CUSTOMER_IMAGE_TAG ;;
  admin) tag_key=ADMIN_IMAGE_TAG ;;
  backend) tag_key=BACKEND_IMAGE_TAG ;;
  *) echo "Usage: $0 {customer|admin|backend} IMAGE_TAG" >&2; exit 2 ;;
esac

case "$image_tag" in
  ''|*[!A-Za-z0-9_.-]*) echo "Invalid image tag" >&2; exit 2 ;;
esac

cd "$(dirname "$0")/.."
umask 077
deploy_env=.deploy.env
[ -f "$deploy_env" ] || cp .deploy.env.example "$deploy_env"

exec 9>/tmp/mrs-deploy.lock
flock 9

current_tag=$(awk -F= -v key="$tag_key" '$1 == key { print substr($0, index($0, "=") + 1); found=1 } END { if (!found) print "main" }' "$deploy_env")

set_tag() {
  key=$1
  value=$2
  temporary=$(mktemp)
  awk -F= -v key="$key" -v value="$value" '
    $1 == key { print key "=" value; found=1; next }
    { print }
    END { if (!found) print key "=" value }
  ' "$deploy_env" > "$temporary"
  mv "$temporary" "$deploy_env"
}

compose() {
  docker compose --env-file .env --env-file "$deploy_env" "$@"
}

rollback() {
  exit_code=$?
  trap - EXIT INT TERM
  echo "Deployment failed; rolling $service back to $current_tag" >&2
  set_tag "$tag_key" "$current_tag"
  compose up -d --no-deps --wait "$service" || true
  exit "$exit_code"
}

trap rollback EXIT INT TERM
set_tag "$tag_key" "$image_tag"
compose pull "$service"

if [ "$service" = backend ]; then
  compose run --rm --no-deps backend npm run db:migrate
fi

if [ "$service" = customer ]; then
  docker ps -aq \
    --filter label=com.docker.compose.project=mrs \
    --filter label=com.docker.compose.service=frontend |
    while IFS= read -r container_id; do
      [ -z "$container_id" ] || docker rm -f "$container_id"
    done
fi

compose up -d --no-deps --wait "$service"

case "$service" in
  customer) compose exec -T customer wget --quiet --spider http://127.0.0.1/mrs2.0/ ;;
  admin) compose exec -T admin wget --quiet --spider http://127.0.0.1/admin/ ;;
  backend) compose exec -T backend node --input-type=module -e "const response = await fetch('http://127.0.0.1:3000/api/health/ready', { signal: AbortSignal.timeout(5500) }); process.exit(response.ok ? 0 : 1)" ;;
esac

trap - EXIT INT TERM
echo "Deployed $service:$image_tag"