# Release Board Lab

`Release Board Lab` is a small app you can run locally and then use as your own DevOps practice target.

It already gives you:

- a working web app
- a JSON-backed API
- environment-variable configuration
- health and readiness endpoints
- automated tests

The DevOps work is intentionally left for you. The practice path lives in [labs/DEVOPS_PRACTICE.md](/home/gowtham/Desktop/Devops-project/labs/DEVOPS_PRACTICE.md).

## Run locally

```bash
npm start
```

Then open `http://localhost:3000`.

## Test

```bash
npm test
```

## Environment variables

Copy values from `.env.example` if you want to customize the app:

- `APP_NAME`
- `ENVIRONMENT`
- `RELEASE`
- `PORT`
- `DATA_FILE`

## API

- `GET /api/info`
- `GET /api/items`
- `POST /api/items`
- `PATCH /api/items/:id`
- `DELETE /api/items/:id`
- `GET /healthz`
- `GET /readyz`
