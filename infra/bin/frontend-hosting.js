#!/usr/bin/env node

const cdk = require('aws-cdk-lib');
const { FrontendHostingStack } = require('../lib/frontend-hosting-stack');

const app = new cdk.App();

new FrontendHostingStack(
  app,
  app.node.tryGetContext('stackName') || 'FrontendHostingStack',
  {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION,
    },
    siteBucketName: app.node.tryGetContext('siteBucketName'),
    tableName: app.node.tryGetContext('tableName'),
    imagesBucketName:
      app.node.tryGetContext('imagesBucketName') || 'ayto-images',
  }
);
