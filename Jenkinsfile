pipeline {
  agent any

  options {
    ansiColor('xterm')
    buildDiscarder(logRotator(numToKeepStr: '20'))
    disableConcurrentBuilds()
    skipDefaultCheckout(true)
    timestamps()
  }

  parameters {
    booleanParam(name: 'DEPLOY_TO_K8S', defaultValue: true, description: 'Deploy main/master builds to Kubernetes after pushing the image.')
    string(name: 'DOCKER_REGISTRY', defaultValue: 'docker.io', description: 'Container registry host, without protocol.')
    string(name: 'IMAGE_REPOSITORY', defaultValue: 'gowtham/release-board-lab', description: 'Repository path inside the registry.')
    string(name: 'KUBE_NAMESPACE', defaultValue: 'release-board', description: 'Kubernetes namespace for the application.')
    string(name: 'KUBE_CONTEXT', defaultValue: '', description: 'Optional kubeconfig context name. Leave blank to use the kubeconfig default.')
  }

  environment {
    APP_DEPLOYMENT = 'release-board-deployment'
    APP_CONTAINER = 'release-board'
    APP_SERVICE = 'release-board-service'
    LB_DEPLOYMENT = 'nginx-lb'
    LB_SERVICE = 'nginx-lb-service'
    DOCKER_CREDENTIALS_ID = 'docker-registry-creds'
    KUBECONFIG_CREDENTIALS_ID = 'release-board-kubeconfig'
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Prepare Metadata') {
      steps {
        script {
          env.GIT_SHA = sh(script: "git rev-parse --short=12 HEAD", returnStdout: true).trim()
          env.BRANCH_SLUG = (env.BRANCH_NAME ?: sh(script: "git rev-parse --abbrev-ref HEAD", returnStdout: true).trim())
            .replaceAll(/[^A-Za-z0-9_.-]+/, '-')
            .toLowerCase()
          env.IMAGE_TAG = "${env.BRANCH_SLUG}-${env.BUILD_NUMBER}-${env.GIT_SHA}"
          env.FULL_IMAGE = "${params.DOCKER_REGISTRY}/${params.IMAGE_REPOSITORY}:${env.IMAGE_TAG}"
          env.LATEST_IMAGE = "${params.DOCKER_REGISTRY}/${params.IMAGE_REPOSITORY}:latest"
        }

        sh '''
          echo "Branch: ${BRANCH_NAME:-local}"
          echo "Commit: ${GIT_SHA}"
          echo "Image:  ${FULL_IMAGE}"
        '''
      }
    }

    stage('Install Dependencies') {
      steps {
        sh 'npm ci'
      }
    }

    stage('Unit Tests') {
      steps {
        sh 'npm test'
      }
    }

    stage('Build Image') {
      steps {
        sh '''
          docker build \
            --pull \
            --tag "${FULL_IMAGE}" \
            --tag "${LATEST_IMAGE}" \
            .
        '''
      }
    }

    stage('Push Image') {
      steps {
        withCredentials([usernamePassword(
          credentialsId: env.DOCKER_CREDENTIALS_ID,
          usernameVariable: 'DOCKER_USERNAME',
          passwordVariable: 'DOCKER_PASSWORD'
        )]) {
          sh '''
            printf '%s' "${DOCKER_PASSWORD}" | docker login "${DOCKER_REGISTRY}" --username "${DOCKER_USERNAME}" --password-stdin
            docker push "${FULL_IMAGE}"

            if [ "${BRANCH_NAME:-}" = "main" ] || [ "${BRANCH_NAME:-}" = "master" ]; then
              docker push "${LATEST_IMAGE}"
            fi

            docker logout "${DOCKER_REGISTRY}"
          '''
        }
      }
    }

    stage('Deploy To Kubernetes') {
      when {
        expression {
          def branch = env.BRANCH_NAME ?: env.BRANCH_SLUG ?: ''
          return params.DEPLOY_TO_K8S && (branch == 'main' || branch == 'master')
        }
      }
      steps {
        input message: 'Push this build to Kubernetes?', ok: 'Deploy'

        withCredentials([file(credentialsId: env.KUBECONFIG_CREDENTIALS_ID, variable: 'KUBECONFIG')]) {
          sh '''
            set -eu

            if [ -n "${KUBE_CONTEXT}" ]; then
              kubectl config use-context "${KUBE_CONTEXT}"
            fi

            kubectl apply -f k8s/namespace.yaml
            kubectl apply -f k8s/service.yaml
            kubectl apply -f k8s/deployment.yaml
            kubectl apply -f k8s/nginx-config.yaml
            kubectl apply -f k8s/nginx-deployment.yaml
            kubectl apply -f k8s/nginx-service.yaml

            kubectl delete pod release-board-pod -n "${KUBE_NAMESPACE}" --ignore-not-found=true

            kubectl set image deployment/"${APP_DEPLOYMENT}" \
              "${APP_CONTAINER}"="${FULL_IMAGE}" \
              -n "${KUBE_NAMESPACE}"

            kubectl set env deployment/"${APP_DEPLOYMENT}" \
              RELEASE="${IMAGE_TAG}" \
              -n "${KUBE_NAMESPACE}"

            kubectl annotate deployment/"${APP_DEPLOYMENT}" \
              -n "${KUBE_NAMESPACE}" \
              ci.jenkins/build-number="${BUILD_NUMBER}" \
              ci.jenkins/git-sha="${GIT_SHA}" \
              ci.jenkins/job-name="${JOB_NAME}" \
              --overwrite

            kubectl rollout status deployment/"${APP_DEPLOYMENT}" -n "${KUBE_NAMESPACE}" --timeout=180s
            kubectl rollout restart deployment/"${LB_DEPLOYMENT}" -n "${KUBE_NAMESPACE}"
            kubectl rollout status deployment/"${LB_DEPLOYMENT}" -n "${KUBE_NAMESPACE}" --timeout=180s
          '''
        }
      }
    }

    stage('Smoke Test') {
      when {
        expression {
          def branch = env.BRANCH_NAME ?: env.BRANCH_SLUG ?: ''
          return params.DEPLOY_TO_K8S && (branch == 'main' || branch == 'master')
        }
      }
      steps {
        withCredentials([file(credentialsId: env.KUBECONFIG_CREDENTIALS_ID, variable: 'KUBECONFIG')]) {
          sh '''
            set -eu

            if [ -n "${KUBE_CONTEXT}" ]; then
              kubectl config use-context "${KUBE_CONTEXT}"
            fi

            kubectl port-forward svc/"${LB_SERVICE}" 18080:80 -n "${KUBE_NAMESPACE}" >/tmp/release-board-port-forward.log 2>&1 &
            PF_PID=$!

            cleanup() {
              kill "${PF_PID}" >/dev/null 2>&1 || true
              wait "${PF_PID}" 2>/dev/null || true
            }

            trap cleanup EXIT
            sleep 5

            curl --fail --silent --show-error http://127.0.0.1:18080/healthz
            curl --fail --silent --show-error http://127.0.0.1:18080/readyz
            curl --fail --silent --show-error http://127.0.0.1:18080/api/info
          '''
        }
      }
    }
  }

  post {
    always {
      sh '''
        docker image rm "${FULL_IMAGE}" "${LATEST_IMAGE}" >/dev/null 2>&1 || true
        docker logout "${DOCKER_REGISTRY}" >/dev/null 2>&1 || true
      '''
      cleanWs(deleteDirs: true, disableDeferredWipeout: true)
    }
  }
}
