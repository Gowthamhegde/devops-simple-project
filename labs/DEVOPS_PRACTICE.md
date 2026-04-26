# DevOps Practice Guide

This repo is meant to be a target for your own DevOps practice. The application works locally, but the delivery and operations layers are yours to build.

## Suggested order

1. Local workflow
2. Containerization
3. Docker Compose
4. CI
5. Kubernetes
6. Release automation

## 1. Local workflow

Goal: get comfortable with the app and its runtime shape.

Checklist:

- Run `npm start`
- Run `npm test`
- Inspect `.env.example`
- Call `curl http://localhost:3000/healthz`
- Call `curl http://localhost:3000/readyz`
- Call `curl http://localhost:3000/api/items`

## 2. Containerization

Goal: package the app as a container image.

Create:

- `Dockerfile`
- `.dockerignore`

Acceptance ideas:

- The image builds successfully
- The app starts with `docker run`
- `PORT` and `DATA_FILE` are configurable with `-e`
- The data file survives when mounted from the host

Stretch ideas:

- Use a non-root user
- Add a `HEALTHCHECK`
- Keep the final image small

## 3. Docker Compose

Goal: define a repeatable local runtime.

Create:

- `docker-compose.yml`

Acceptance ideas:

- The app runs with `docker compose up`
- The port is published cleanly
- A named volume or bind mount stores `DATA_FILE`
- Health status is visible from Compose

Stretch ideas:

- Add a second service such as Nginx in front of the app
- Override `ENVIRONMENT` and `RELEASE`

## 4. CI

Goal: automate checks on every push or pull request.

Create:

- `.github/workflows/ci.yml`

Acceptance ideas:

- Install the correct Node version
- Run `npm test`
- Fail on test regressions
- Optionally build the Docker image

Stretch ideas:

- Cache dependencies
- Add a matrix for multiple Node versions
- Publish the image on tagged releases

## 5. Kubernetes

Goal: deploy the app to a cluster.

Create:

- `k8s/deployment.yaml`
- `k8s/service.yaml`
- optional `k8s/configmap.yaml`
- optional `k8s/pvc.yaml`

Acceptance ideas:

- Wire `APP_NAME`, `ENVIRONMENT`, `RELEASE`, `PORT`, and `DATA_FILE`
- Use `/healthz` as liveness
- Use `/readyz` as readiness
- Expose the app with a Service
- Persist the JSON file path if you want data to survive pod restarts

Stretch ideas:

- Add an Ingress
- Add resource requests and limits
- Add a rolling update strategy

## 6. Release automation

Goal: practice the path from change to rollout.

Ideas:

- Add semantic version tagging
- Build and tag container images with the release number
- Inject `RELEASE` from CI
- Deploy to a staging namespace first
- Add a manual approval step before production

## Good verification commands

```bash
curl http://localhost:3000/healthz
curl http://localhost:3000/readyz
curl http://localhost:3000/api/info
curl http://localhost:3000/api/items
```

## Bonus challenges

- Add structured JSON logging
- Add a `/metrics` endpoint
- Add smoke tests that run after deploy
- Swap the JSON file for Redis or Postgres
- Add rate limiting or authentication
