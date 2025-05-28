import * as cdk from "aws-cdk-lib";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as ecs_patterns from "aws-cdk-lib/aws-ecs-patterns";
import { Construct } from "constructs";

export interface InfraStackProps extends cdk.StackProps {
  repository: ecr.IRepository;
}

export class InfraStack extends cdk.Stack {
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

    // Create subnet group for RDS (private subnets only)
    const subnetGroup = new rds.SubnetGroup(this, "DatabaseSubnetGroup", {
      vpc: vpc,
      description: "Subnet group for PostgreSQL RDS",
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
    });

    // Create RDS PostgreSQL instance (minimum spec)
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
      allocatedStorage: 20, // Minimum for PostgreSQL
      storageType: rds.StorageType.GP2,
      deleteAutomatedBackups: true,
      backupRetention: cdk.Duration.days(1), // Minimum backup retention
      deletionProtection: false, // Set to true for production
      storageEncrypted: true,
      monitoringInterval: cdk.Duration.seconds(0), // Disable enhanced monitoring for cost savings
      enablePerformanceInsights: false, // Disable for cost savings
      autoMinorVersionUpgrade: true,
      allowMajorVersionUpgrade: false,
      databaseName: "incidently_production",
      port: 5432,
    });

    // Output the database endpoint and secret ARN
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

    const container = taskDefinition.addContainer("IncidentlyRailsContainer", {
      image: ecs.ContainerImage.fromEcrRepository(props.repository),
      logging: ecs.LogDriver.awsLogs({ streamPrefix: "IncidentlyRails" }),
      environment: {
        RAILS_ENV: "production",
        RAILS_LOG_TO_STDOUT: "1",
      },
    });

    // Add database connection if provided
    container.addSecret(
      "DATABASE_URL",
      ecs.Secret.fromSecretsManager(
        databaseSecret,
        "engine",
      ),
    );

    container.addSecret(
      "DB_PASSWORD",
      ecs.Secret.fromSecretsManager(
        databaseSecret,
        "password",
      ),
    );
    container.addSecret(
      "DB_USERNAME",
      ecs.Secret.fromSecretsManager(
        databaseSecret,
        "username",
      ),
    );
    container.addEnvironment(
      "DB_HOST",
      database.instanceEndpoint.hostname,
    );
    container.addEnvironment(
      "DB_PORT",
      database.instanceEndpoint.port.toString(),
    );
    container.addEnvironment("DB_NAME", "incidently_production");

    container.addPortMappings({
      containerPort: 80, // Changed from 8080 to match your Dockerfile EXPOSE 80
    });

    // Create Fargate Service
    const fargateService = new ecs_patterns
      .ApplicationLoadBalancedFargateService(
        this,
        "IncidentlyRailsService",
        {
          cluster,
          taskDefinition: taskDefinition,
          desiredCount: 1,
          publicLoadBalancer: true,
          /** Uncomment these if you're using a domain name! */
          // redirectHTTP: true,
          // protocol: ApplicationProtocol.HTTPS,
          // domainZone: props.hostedZoneId,
          // domainName: props.domainName,
          // certificate: props.certificate,
          healthCheck: {
            command: ["CMD-SHELL", "exit 0"],
            timeout: cdk.Duration.minutes(10),
            interval: cdk.Duration.seconds(10),
          },
        },
      );

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

    // Optional: Define Auto Scaling policies
    const scaling = fargateService.service.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 1,
    });

    scaling.scaleOnCpuUtilization("CpuScaling", {
      targetUtilizationPercent: 50,
    });

    scaling.scaleOnMemoryUtilization("MemoryScaling", {
      targetUtilizationPercent: 50,
    });

    new cdk.CfnOutput(this, "LoadBalancerDNS", {
      value: fargateService.loadBalancer.loadBalancerDnsName,
    });
  }
}
