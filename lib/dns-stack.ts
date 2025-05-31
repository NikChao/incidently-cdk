import * as cdk from "aws-cdk-lib";
import { IDistribution } from "aws-cdk-lib/aws-cloudfront";
import { ARecord, IHostedZone, RecordTarget } from "aws-cdk-lib/aws-route53";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";
import { Construct } from "constructs";

interface DnsStackProps extends cdk.StackProps {
  hostedZone: IHostedZone;
  distribution: IDistribution;
  domainNames: string[];
}

export class DnsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DnsStackProps) {
    super(scope, id, props);

    const [apexDomainName, ...domainNames] = props.domainNames;

    new ARecord(this, "ApexAliasRecord", {
      zone: props.hostedZone,
      target: RecordTarget.fromAlias(new CloudFrontTarget(props.distribution)),
      recordName: apexDomainName,
    });

    domainNames.forEach((domainName) => {
      const subDomain = domainName.split(".")[0]!;

      new ARecord(this, `${subDomain}AliasRecord`, {
        zone: props.hostedZone,
        target: RecordTarget.fromAlias(
          new CloudFrontTarget(props.distribution),
        ),
        recordName: domainName,
      });
    });
  }
}
