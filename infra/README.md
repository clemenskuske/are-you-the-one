# Frontend Hosting Infrastructure

This CDK app deploys the Vite frontend in `../frontend` to a private S3 bucket behind a CloudFront distribution, provisions a public-read S3 bucket for cast images, provisions a DynamoDB table for application data, and exposes a same-origin `/api/datapoints` route that reads from the table.

## What it creates

- A private S3 bucket for the built frontend assets
- A public-read S3 bucket for frontend-accessible images
- A DynamoDB table with `pk` and `sk` string keys
- A Lambda-backed `/api/datapoints` endpoint routed through CloudFront
- A CloudFront distribution with HTTPS redirects and security headers
- SPA-friendly fallback routing so deep links resolve to `index.html`
- A deployment step that builds the frontend during `cdk synth` and `cdk deploy`

## Getting started

1. Install the CDK dependencies:

   ```bash
   cd infra
   npm install
   ```

2. Bootstrap CDK in the target account and region if you have not done that yet:

   ```bash
   npx cdk bootstrap aws://ACCOUNT_ID/REGION
   ```

3. Deploy the stack:

   ```bash
   npx cdk deploy
   ```

## Useful commands

```bash
npm run synth
npm run export
npm run diff
npm run deploy
npm run destroy
```

## Export the template

If you want the synthesized CloudFormation template as a file, run:

```bash
npm run export
```

The exported template will be written to `infra/dist/<StackName>.template.json`.

## Optional context

You can override the default stack name or provide fixed resource names:

```bash
npx cdk deploy -c stackName=FrontendHostingStack -c siteBucketName=my-frontend-bucket -c imagesBucketName=my-images-bucket -c tableName=my-application-table
```

## Frontend connector

The frontend fetches datapoints from the same deployed domain at `/api/datapoints`.

For local frontend development against a deployed stack, copy `frontend/.env.example` to `frontend/.env.local` and point `VITE_API_PROXY_TARGET` at your deployed CloudFront site URL, for example:

```bash
VITE_API_PROXY_TARGET=https://your-cloudfront-domain
```

Then restart `npm run dev`. The Vite dev server will proxy local `/api/*` requests to the deployed CloudFront distribution, which avoids the `404` you saw from the local dev server and keeps the browser request path the same as production.

## Stored add-to-match moves

Uneven seasons can persist the extra contestant as an `added-to-match` DynamoDB datapoint. The item stores `added-person`, `target-left`, `target-right`, and the `matching-night` from which the move is known. The frontend loads the move automatically once that cutoff is reached.

Seed source files use `data/<season>/added_to_matches.json`. Each entry contains `person`, `targetLeft`, `targetRight`, and `matchingNight`; `infra/scripts/build-dynamodb-seed.mjs` converts these entries to DynamoDB items.
