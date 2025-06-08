import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";

export class SmsStack extends cdk.Stack {
  public readonly smsPolicy: iam.ManagedPolicy;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.smsPolicy = new iam.ManagedPolicy(this, "SnsSmsPolicy", {
      statements: [
        new iam.PolicyStatement({
          actions: ["sns:Publish"],
          resources: ["*"],
        }),
      ],
    });
  }
}
