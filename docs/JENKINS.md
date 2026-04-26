# Jenkins CI/CD for Release Board Lab

This project now includes a `Jenkinsfile` that covers the full path from validation to Kubernetes rollout.

## What the pipeline does

1. Checks out the repository
2. Installs dependencies with `npm ci`
3. Runs the Node test suite with `npm test`
4. Builds a Docker image tagged with branch, build number, and commit SHA
5. Pushes the image to your registry
6. On `main` or `master`, pauses for approval before deploying to Kubernetes
7. Updates the app Deployment image and waits for rollout
8. Runs a smoke test against the deployed service

## Jenkins credentials you need

Create these credentials in Jenkins:

- `docker-registry-creds`
  - Type: `Username with password`
  - Value: registry username and password or access token

- `release-board-kubeconfig`
  - Type: `Secret file`
  - Value: a kubeconfig file that can deploy into the target cluster

## Recommended Jenkins tools on the agent

Your Jenkins agent should have:

- Node.js 20+
- Docker CLI with permission to build and push images
- `kubectl`
- network access to your container registry and Kubernetes cluster

## Suggested job configuration

Use a Pipeline job pointing at this repository, or a Multibranch Pipeline if you want branch-aware behavior.

Recommended defaults:

- Build on every branch push
- Allow deploys only from `main` or `master`
- Keep the manual approval step enabled for production-style safety

## Default parameters

- `DOCKER_REGISTRY`: `docker.io`
- `IMAGE_REPOSITORY`: `gowtham/release-board-lab`
- `KUBE_NAMESPACE`: `release-board`
- `KUBE_CONTEXT`: blank by default
- `DEPLOY_TO_K8S`: `true`

Adjust the image repository to match your Docker Hub org or private registry path.

## Important Kubernetes note

The repo contains both:

- `k8s/deployment.yaml`
- `k8s/pod.yaml`

The pipeline intentionally deploys only the Deployment-based resources and deletes the standalone `release-board-pod` if it exists, so your Service does not pick up an extra unmanaged backend pod.

## First-run checklist

Before the first CD run:

1. Make sure your registry repository exists
2. Push credentials into Jenkins
3. Add the kubeconfig secret file
4. Confirm the Kubernetes cluster can pull the pushed image
5. Update `IMAGE_REPOSITORY` from the Jenkins job if you are not using `gowtham/release-board-lab`

## Manual local validation

You can validate the CI parts locally with:

```bash
npm ci
npm test
docker build -t release-board-lab:test .
```
