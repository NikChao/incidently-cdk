import * as cdk from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as certificatemanager from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import { Construct } from "constructs";
import { ApplicationLoadBalancer } from "aws-cdk-lib/aws-elasticloadbalancingv2";

export interface CdnStackProps extends cdk.StackProps {
  loadBalancer: ApplicationLoadBalancer;
  certificate: certificatemanager.ICertificate;
  hostedZone: route53.IHostedZone;
  domainNames: string[];
}

export class CdnStack extends cdk.Stack {
  public readonly distribution: cloudfront.IDistribution;

  constructor(scope: Construct, id: string, props: CdnStackProps) {
    super(scope, id, props);

    const originRequestPolicy = new cloudfront.OriginRequestPolicy(
      this,
      "RailsOriginRequestPolicy",
      {
        originRequestPolicyName: "RailsOriginRequestPolicy",
        comment: "Forward all headers, cookies, and query strings to Rails",
        cookieBehavior: cloudfront.OriginRequestCookieBehavior.all(),
        headerBehavior: cloudfront.OriginRequestHeaderBehavior.all(),
        queryStringBehavior: cloudfront.OriginRequestQueryStringBehavior.all(),
      },
    );

    const noCachePolicy = new cloudfront.CachePolicy(this, "NoCachePolicy", {
      cachePolicyName: "RailsNoCachePolicy",
      comment: "No caching - forward everything to Rails",
      defaultTtl: cdk.Duration.seconds(0),
      maxTtl: cdk.Duration.seconds(1),
      minTtl: cdk.Duration.seconds(0),
      cookieBehavior: cloudfront.CacheCookieBehavior.all(),
      headerBehavior: cloudfront.CacheHeaderBehavior.allowList(
        "Authorization",
        "Host",
      ),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    this.distribution = new cloudfront.Distribution(this, "Distribution", {
      comment: "Rails application distribution",
      domainNames: props.domainNames,
      certificate: props.certificate,
      defaultBehavior: {
        origin: new origins.LoadBalancerV2Origin(props.loadBalancer, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
          httpPort: 80,
        }),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: noCachePolicy,
        originRequestPolicy: originRequestPolicy,
        compress: true,
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
    });

    new cdk.CfnOutput(this, "CloudFrontDistributionId", {
      value: this.distribution.distributionId,
      description: "CloudFront Distribution ID",
    });

    new cdk.CfnOutput(this, "CloudFrontDomainName", {
      value: this.distribution.distributionDomainName,
      description: "CloudFront Distribution Domain Name",
    });
  }
}
