import * as cdk from "aws-cdk-lib";
import { IDistribution } from "aws-cdk-lib/aws-cloudfront";
import { ARecord, IHostedZone, RecordTarget } from "aws-cdk-lib/aws-route53";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";
import { Construct } from "constructs";

interface DnsStackProps extends cdk.StackProps {
  hostedZone: IHostedZone;
  distribution: IDistribution;
  domainName: string;
}

export class DnsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DnsStackProps) {
    super(scope, id, props);

    new ARecord(this, "AliasRecord", {
      zone: props.hostedZone,
      target: RecordTarget.fromAlias(new CloudFrontTarget(props.distribution)),
      recordName: props.domainName,
    });
  }
}
