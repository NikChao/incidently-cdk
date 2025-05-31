import * as cdk from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as certificatemanager from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";

export interface SplashPageStackProps extends cdk.StackProps {
  certificate: certificatemanager.ICertificate;
  hostedZone: route53.IHostedZone;
  domainNames: string[];
}

export class SplashPageStack extends cdk.Stack {
  public readonly bucket: s3.Bucket;
  public readonly distribution: cloudfront.IDistribution;

  constructor(scope: Construct, id: string, props: SplashPageStackProps) {
    super(scope, id, props);
    const { domainNames, certificate } = props;

    // Create S3 bucket for hosting static website
    this.bucket = new s3.Bucket(this, "WebsiteBucket", {
      bucketName: `${domainNames[0].replace(/\./g, "-")}-spa-bucket`,
      websiteIndexDocument: "index.html",
      websiteErrorDocument: "index.html", // SPA routing - redirect errors to index.html
      publicReadAccess: true,
      blockPublicAccess: {
        blockPublicAcls: false,
        blockPublicPolicy: false,
        ignorePublicAcls: false,
        restrictPublicBuckets: false,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Add bucket policy for public read access
    this.bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.AnyPrincipal()],
        actions: ["s3:GetObject"],
        resources: [`${this.bucket.bucketArn}/*`],
      }),
    );

    // Create CloudFront distribution
    this.distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultBehavior: {
        origin: new origins.S3StaticWebsiteOrigin(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
        compress: true,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      defaultRootObject: "index.html",
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: cdk.Duration.minutes(30),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: cdk.Duration.minutes(30),
        },
      ],
      domainNames,
      certificate: certificate,
      comment: `CloudFront distribution for ${domainNames[0]}`,
    });

    // Deploy the splash page
    new s3deploy.BucketDeployment(this, "DeployWebsite", {
      sources: [s3deploy.Source.asset("../incidently/splash")],
      destinationBucket: this.bucket,
      distribution: this.distribution,
      distributionPaths: ["/*"],
    });
  }
}
