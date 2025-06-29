import * as cdk from "aws-cdk-lib";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as rds from "aws-cdk-lib/aws-rds";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as ecs_patterns from "aws-cdk-lib/aws-ecs-patterns";
import { Construct } from "constructs";
import { ApplicationLoadBalancer } from "aws-cdk-lib/aws-elasticloadbalancingv2";

export interface InfraStackProps extends cdk.StackProps {
  repository: ecr.IRepository;
  smsPolicy: iam.ManagedPolicy;
}

export class InfraStack extends cdk.Stack {
  public readonly loadBalancer: ApplicationLoadBalancer;

  constructor(scope: Construct, id: string, props: InfraStackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, "IncidentlyAppVPC", {
      maxAzs: 2,
    });

    const databaseSecurityGroup = new ec2.SecurityGroup(
      this,
      "DatabaseSecurityGroup",
      {
        vpc: vpc,
        description: "Security group for PostgreSQL RDS instance",
        allowAllOutbound: false,
      },
    );

    const databaseSecret = new secretsmanager.Secret(
      this,
      "DatabaseCredentials",
      {
        description: "PostgreSQL database credentials",
        generateSecretString: {
          secretStringTemplate: JSON.stringify({ username: "postgres" }),
          generateStringKey: "password",
          excludeCharacters: '"@/\\',
          passwordLength: 32,
        },
      },
    );

    const subnetGroup = new rds.SubnetGroup(this, "DatabaseSubnetGroup", {
      vpc: vpc,
      description: "Subnet group for PostgreSQL RDS",
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
    });

    const database = new rds.DatabaseInstance(this, "PostgreSQLDatabase", {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_17_5,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO,
      ),
      credentials: rds.Credentials.fromSecret(databaseSecret),
      vpc: vpc,
      subnetGroup: subnetGroup,
      securityGroups: [databaseSecurityGroup],
      allocatedStorage: 20,
      storageType: rds.StorageType.GP2,
      deleteAutomatedBackups: true,
      backupRetention: cdk.Duration.days(1),
      deletionProtection: false,
      storageEncrypted: true,
      monitoringInterval: cdk.Duration.seconds(0),
      enablePerformanceInsights: false,
      autoMinorVersionUpgrade: true,
      allowMajorVersionUpgrade: false,
      databaseName: "incidently_production",
      port: 5432,
    });

    const cluster = new ecs.Cluster(this, "IncidentlyRailsCluster", {
      vpc: vpc,
    });

    const taskDefinition = new ecs.FargateTaskDefinition(
      this,
      "IncidentlyRailsTaskDef",
      {
        memoryLimitMiB: 512,
        cpu: 256,
      },
    );

    taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ssmmessages:CreateControlChannel",
          "ssmmessages:CreateDataChannel",
          "ssmmessages:OpenControlChannel",
          "ssmmessages:OpenDataChannel",
        ],
        resources: ["*"],
      }),
    );

    taskDefinition.taskRole.addManagedPolicy(props.smsPolicy);

    const container = taskDefinition.addContainer("IncidentlyRailsContainer", {
      image: ecs.ContainerImage.fromEcrRepository(props.repository),
      logging: ecs.LogDriver.awsLogs({ streamPrefix: "IncidentlyRails" }),
      portMappings: [{ containerPort: 3000 }],
      environment: {
        RAILS_ENV: "production",
        RAILS_LOG_TO_STDOUT: "1",
      },
    });

    // Database connection using individual environment variables
    container.addSecret(
      "DB_PASSWORD",
      ecs.Secret.fromSecretsManager(databaseSecret, "password"),
    );
    container.addSecret(
      "DB_USERNAME",
      ecs.Secret.fromSecretsManager(databaseSecret, "username"),
    );
    container.addEnvironment("DB_HOST", database.instanceEndpoint.hostname);
    container.addEnvironment(
      "DB_PORT",
      database.instanceEndpoint.port.toString(),
    );
    container.addEnvironment("DB_NAME", "incidently_production");

    container.addEnvironment(
      "SECRET_KEY_BASE",
      process.env.RAILS_SECRET_KEY_BASE!,
    );

    container.addEnvironment("SLACK_CLIENT_ID", process.env.SLACK_CLIENT_ID!);
    container.addEnvironment(
      "SLACK_CLIENT_SECRET",
      process.env.SLACK_CLIENT_SECRET!,
    );
    container.addEnvironment(
      "DISCORD_PUBLIC_KEY",
      process.env.DISCORD_PUBLIC_KEY!,
    );

    // TODO: Secrets plz
    container.addEnvironment(
      "SES_SMTP_USERNAME",
      process.env.SES_SMTP_USERNAME!,
    );
    container.addEnvironment(
      "SES_SMTP_PASSWORD",
      process.env.SES_SMTP_PASSWORD!,
    );

    // Create Fargate Service
    const fargateService = new ecs_patterns
      .ApplicationLoadBalancedFargateService(
      this,
      "IncidentlyRailsService",
      {
        cluster,
        enableExecuteCommand: true,
        taskDefinition: taskDefinition,
        desiredCount: 1,
        publicLoadBalancer: true,
        // Don't use HTTPS on ALB since CloudFront will handle SSL termination
        redirectHTTP: false,
        healthCheck: {
          command: ["CMD-SHELL", "exit 0"],
          timeout: cdk.Duration.minutes(10),
          interval: cdk.Duration.seconds(10),
        },
      },
    );

    this.loadBalancer = fargateService.loadBalancer;

    // Allow Fargate service to connect to database
    databaseSecurityGroup.addIngressRule(
      fargateService.service.connections.securityGroups[0],
      ec2.Port.tcp(5432),
      "Allow Fargate service to connect to PostgreSQL",
    );

    fargateService.targetGroup.configureHealthCheck({
      enabled: true,
      path: "/up",
      healthyHttpCodes: "200",
    });

    // Auto Scaling
    const scaling = fargateService.service.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 3,
    });

    scaling.scaleOnCpuUtilization("CpuScaling", {
      targetUtilizationPercent: 70,
    });

    scaling.scaleOnMemoryUtilization("MemoryScaling", {
      targetUtilizationPercent: 80,
    });

    // Create CloudFront Distribution
    // Outputs
    new cdk.CfnOutput(this, "DatabaseEndpoint", {
      value: database.instanceEndpoint.hostname,
      description: "PostgreSQL database endpoint",
    });

    new cdk.CfnOutput(this, "DatabaseSecretArn", {
      value: databaseSecret.secretArn,
      description: "ARN of the database credentials secret",
    });

    new cdk.CfnOutput(this, "DatabaseSecurityGroupId", {
      value: databaseSecurityGroup.securityGroupId,
      description: "Security Group ID for the database",
    });

    new cdk.CfnOutput(this, "LoadBalancerDNS", {
      value: fargateService.loadBalancer.loadBalancerDnsName,
    });
  }
}
