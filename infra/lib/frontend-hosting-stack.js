const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const cdk = require('aws-cdk-lib');
const cloudfront = require('aws-cdk-lib/aws-cloudfront');
const origins = require('aws-cdk-lib/aws-cloudfront-origins');
const dynamodb = require('aws-cdk-lib/aws-dynamodb');
const lambda = require('aws-cdk-lib/aws-lambda');
const s3 = require('aws-cdk-lib/aws-s3');
const s3deploy = require('aws-cdk-lib/aws-s3-deployment');

const FRONTEND_PATH = path.resolve(__dirname, '../../frontend');
const FRONTEND_BUILD_PATH = path.join(FRONTEND_PATH, 'dist');

function ensureFrontendExists() {
  const frontendPackageJson = path.join(FRONTEND_PATH, 'package.json');

  if (!fs.existsSync(frontendPackageJson)) {
    throw new Error(
      `Could not find the frontend package at ${frontendPackageJson}.`
    );
  }
}

function installFrontendDependenciesIfNeeded() {
  const nodeModulesPath = path.join(FRONTEND_PATH, 'node_modules');

  if (!fs.existsSync(nodeModulesPath)) {
    execSync('npm ci', {
      cwd: FRONTEND_PATH,
      stdio: 'inherit',
    });
  }
}

function copyDirectoryContents(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      fs.cpSync(sourcePath, targetPath, { recursive: true });
      continue;
    }

    fs.copyFileSync(sourcePath, targetPath);
  }
}

function buildFrontend(outputDir) {
  ensureFrontendExists();
  installFrontendDependenciesIfNeeded();

  execSync('npm run build', {
    cwd: FRONTEND_PATH,
    stdio: 'inherit',
  });

  if (!fs.existsSync(FRONTEND_BUILD_PATH)) {
    throw new Error(
      `Expected the frontend build output at ${FRONTEND_BUILD_PATH}, but it was not created.`
    );
  }

  copyDirectoryContents(FRONTEND_BUILD_PATH, outputDir);
}

class FrontendHostingStack extends cdk.Stack {
  constructor(scope, id, props = {}) {
    super(scope, id, props);

    const applicationTable = new dynamodb.Table(this, 'ApplicationTable', {
      tableName: props.tableName,
      partitionKey: {
        name: 'pk',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'sk',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const datapointsApi = new lambda.Function(this, 'DatapointsApi', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset(
        path.resolve(__dirname, '../lambda/datapoints-api')
      ),
      environment: {
        TABLE_NAME: applicationTable.tableName,
      },
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
    });

    applicationTable.grantReadData(datapointsApi);

  const datapointsApiUrl = datapointsApi.addFunctionUrl({
    authType: lambda.FunctionUrlAuthType.NONE,
    cors: {
      allowedOrigins: ['*'],
      allowedMethods: [lambda.HttpMethod.GET],
      allowedHeaders: ['content-type'],
    },
  });

    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      bucketName: props.siteBucketName,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });

    const imagesBucket = new s3.Bucket(this, 'ImagesBucket', {
      bucketName: props.imagesBucketName,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS_ONLY,
      publicReadAccess: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });

    const distribution = new cloudfront.Distribution(
      this,
      'SiteDistribution',
      {
        defaultRootObject: 'index.html',
        minimumProtocolVersion:
          cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
        httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
        enableIpv6: true,
        defaultBehavior: {
          origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          compress: true,
          responseHeadersPolicy:
            cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
        errorResponses: [
          {
            httpStatus: 403,
            responseHttpStatus: 200,
            responsePagePath: '/index.html',
            ttl: cdk.Duration.minutes(1),
          },
          {
            httpStatus: 404,
            responseHttpStatus: 200,
            responsePagePath: '/index.html',
            ttl: cdk.Duration.minutes(1),
          },
        ],
        additionalBehaviors: {
          '/api/*': {
            origin: new origins.FunctionUrlOrigin(datapointsApiUrl),
            allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
            cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
            compress: true,
            originRequestPolicy:
              cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
            responseHeadersPolicy:
              cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
            viewerProtocolPolicy:
              cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          },
        },
      }
    );

    new s3deploy.BucketDeployment(this, 'DeployFrontend', {
      sources: [
        s3deploy.Source.asset(FRONTEND_PATH, {
          exclude: ['dist', 'node_modules'],
          assetHashType: cdk.AssetHashType.OUTPUT,
          bundling: {
            image: cdk.DockerImage.fromRegistry('node:20'),
            local: {
              tryBundle(outputDir) {
                buildFrontend(outputDir);
                return true;
              },
            },
            command: [
              'bash',
              '-c',
              [
                'npm ci',
                'npm run build',
                'cp -r dist/* /asset-output/',
              ].join(' && '),
            ],
          },
        }),
      ],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*'],
      prune: true,
      retainOnDelete: false,
    });

    new cdk.CfnOutput(this, 'SiteBucketName', {
      value: siteBucket.bucketName,
    });

    new cdk.CfnOutput(this, 'ImagesBucketName', {
      value: imagesBucket.bucketName,
    });

    new cdk.CfnOutput(this, 'ImagesBucketArn', {
      value: imagesBucket.bucketArn,
    });

    new cdk.CfnOutput(this, 'ApplicationTableName', {
      value: applicationTable.tableName,
    });

    new cdk.CfnOutput(this, 'ApplicationTableArn', {
      value: applicationTable.tableArn,
    });

    new cdk.CfnOutput(this, 'DatapointsApiPath', {
      value: '/api/datapoints',
    });

    new cdk.CfnOutput(this, 'DistributionId', {
      value: distribution.distributionId,
    });

    new cdk.CfnOutput(this, 'SiteUrl', {
      value: `https://${distribution.domainName}`,
    });
  }
}

module.exports = { FrontendHostingStack };
