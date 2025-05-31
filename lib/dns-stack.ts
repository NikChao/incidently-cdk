import * as cdk from "aws-cdk-lib";
import { IDistribution } from "aws-cdk-lib/aws-cloudfront";
import { ARecord, IHostedZone, RecordTarget } from "aws-cdk-lib/aws-route53";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";
import { Construct } from "constructs";

interface DnsStackProps extends cdk.StackProps {
  hostedZone: IHostedZone;
  distribution: IDistribution;
  splashDistribution: IDistribution;
  domainNames: string[];
  splashDomainNames: string[];
}

export class DnsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DnsStackProps) {
    super(scope, id, props);

    props.domainNames.forEach((domainName) => {
      const subDomain = domainName.split(".")[0]!;

      new ARecord(this, `${subDomain}AliasRecord`, {
        zone: props.hostedZone,
        target: RecordTarget.fromAlias(
          new CloudFrontTarget(props.distribution),
        ),
        recordName: domainName,
      });
    });

    props.splashDomainNames.forEach((domainName) => {
      const subDomain = domainName.split(".")[0]!;

      new ARecord(this, `${subDomain}AliasRecord`, {
        zone: props.hostedZone,
        target: RecordTarget.fromAlias(
          new CloudFrontTarget(props.splashDistribution),
        ),
        recordName: domainName,
      });
    });
  }
}
