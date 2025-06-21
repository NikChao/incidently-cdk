import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as ses from "aws-cdk-lib/aws-ses";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";

interface NotificationStackProps extends cdk.StackProps {
  domainName: string;
  hostedZone: route53.IHostedZone;
}

export class NotificationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: NotificationStackProps) {
    super(scope, id, props);

    const sesDomainIdentity = new ses.CfnEmailIdentity(this, "SESIdentity", {
      emailIdentity: props.domainName,
    });

    // Add TXT Record for Verification
    new route53.TxtRecord(this, "SESDomainVerificationRecord", {
      zone: props.hostedZone,
      recordName: `_amazonses.${props.domainName}`,
      values: [sesDomainIdentity.attrDkimDnsTokenName1],
      ttl: cdk.Duration.minutes(5),
    });

    // Add DKIM Records (3 CNAMEs)
    new route53.CnameRecord(this, `SESDkimRecord1`, {
      zone: props.hostedZone,
      recordName: "jpjhp46wvwbzr6sxtvlnnx4z3ws2v6xy._domainkey.pingln.com",
      domainName: "jpjhp46wvwbzr6sxtvlnnx4z3ws2v6xy.dkim.amazonses.com",
      ttl: cdk.Duration.minutes(5),
    });

    new route53.CnameRecord(this, `SESDkimRecord2`, {
      zone: props.hostedZone,
      recordName: "wr3btbi5o7w6h2gruj3evsq7irrjbkae._domainkey.pingln.com",
      domainName: "wr3btbi5o7w6h2gruj3evsq7irrjbkae.dkim.amazonses.com",
      ttl: cdk.Duration.minutes(5),
    });

    new route53.CnameRecord(this, `SESDkimRecord3`, {
      zone: props.hostedZone,
      recordName: "ybtl46bupbgvhsc2ew26q3wq6yha2mkp._domainkey.pingln.com",
      domainName: "ybtl46bupbgvhsc2ew26q3wq6yha2mkp.dkim.amazonses.com",
      ttl: cdk.Duration.minutes(5),
    });

    // Optionally create IAM SMTP user
    const smtpUser = new iam.User(this, "SESSMTPUser", {
      userName: "ses-smtp-user",
    });

    smtpUser.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ses:SendEmail", "ses:SendRawEmail"],
        resources: ["*"],
      }),
    );
  }
}
