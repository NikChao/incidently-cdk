import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ecr from "aws-cdk-lib/aws-ecr";

export class EcrStack extends cdk.Stack {
  repository: ecr.IRepository;

  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    this.repository = ecr.Repository.fromRepositoryName(
      this,
      "IncidentlyEcrRepo",
      "incidently-rails",
    );
  }
}
