import * as cdk from "aws-cdk-lib";
import {
  Certificate,
  DnsValidatedCertificate,
} from "aws-cdk-lib/aws-certificatemanager";
import { HostedZone, IHostedZone } from "aws-cdk-lib/aws-route53";
import { Construct } from "constructs";

interface CertificateStackProps extends cdk.StackProps {
  domainName: string;
  hostedZoneId: string;
}

export class CertificateStack extends cdk.Stack {
  public certificate: Certificate;
  public hostedZone: IHostedZone;

  constructor(scope: Construct, id: string, props: CertificateStackProps) {
    super(scope, id, props);

    this.hostedZone = HostedZone.fromHostedZoneAttributes(this, "HostedZone", {
      zoneName: props.domainName,
      hostedZoneId: props.hostedZoneId,
    });

    // Deprecated, should use Certificate instead
    this.certificate = new DnsValidatedCertificate(this, "SiteCertificate", {
      domainName: props.domainName,
      hostedZone: this.hostedZone,
      // https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cnames-and-https-requirements.html
      // To use a certificate in AWS Certificate Manager (ACM) to require HTTPS between viewers and CloudFront,
      // make sure you request (or import) the certificate in the US East (N. Virginia) Region (us-east-1).
      region: "us-east-1",
    });
  }
}
