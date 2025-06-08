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
  public readonly smtpSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: NotificationStackProps) {
    super(scope, id, props);

    const sesDomainIdentity = new ses.CfnEmailIdentity(this, "SESIdentity", {
      emailIdentity: `alerts@${props.domainName}`,
    });

    // Add TXT Record for Verification
    new route53.TxtRecord(this, "SESDomainVerificationRecord", {
      zone: props.hostedZone,
      recordName: `_amazonses.${props.domainName}`,
      values: [sesDomainIdentity.attrDkimDnsTokenName1],
      ttl: cdk.Duration.minutes(5),
    });

    // Add DKIM Records (3 CNAMEs)
    for (let i = 1; i <= 3; i++) {
      new route53.CnameRecord(this, `SESDkimRecord${i}`, {
        zone: props.hostedZone,
        recordName: cdk.Fn.getAtt("SESIdentity", `DkimDnsTokenName${i}`)
          .toString(),
        domainName: cdk.Fn.getAtt("SESIdentity", `DkimDnsTokenValue${i}`)
          .toString(),
        ttl: cdk.Duration.minutes(5),
      });
    }

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

    const smtpAccessKey = new iam.AccessKey(this, "SesSmtpAccessKey", {
      user: smtpUser,
    });

    this.smtpSecret = new secretsmanager.Secret(this, "SesSmtpSecret", {
      secretName: "ses-smtp-credentials",
      secretObjectValue: {
        SES_SMTP_USERNAME: cdk.SecretValue.unsafePlainText(
          smtpAccessKey.accessKeyId,
        ),
        SES_SMTP_PASSWORD: smtpAccessKey.secretAccessKey,
      },
    });
  }
}
