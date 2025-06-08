import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { InfraStack } from "../lib/infra-stack";
import { EcrStack } from "../lib/ecr-stack";
import { CertificateStack } from "../lib/certificate-stack";
import { DnsStack } from "../lib/dns-stack";
import { CdnStack } from "../lib/cdn-stack";
import { SplashPageStack } from "../lib/splash-page-stack";
import { NotificationStack } from "../lib/notification-stack";

const rootDomainName = "pingln.com";
const splashDomainNames = [
  rootDomainName,
  "www.pingln.com",
];
const appDomainNames = [
  "app.pingln.com",
];

const hostedZoneId = "Z03098722RNSY0BV6773E";

const app = new cdk.App();
const env = { account: "692859939927", region: "ap-southeast-2" };

const { repository } = new EcrStack(app, "IncidentlyRailsRepo", { env });

const { hostedZone, certificate } = new CertificateStack(
  app,
  "IncidentlyCertificateStack",
  {
    env,
    hostedZoneId,
    domainName: rootDomainName,
  },
);

const { smtpSecret } = new NotificationStack(
  app,
  "IncidentlyNotificationStack",
  {
    env,
    hostedZone,
    domainName: rootDomainName,
  },
);

const { loadBalancer } = new InfraStack(app, "IncidentlyRailsStack", {
  env,
  repository,
  smtpSecret,
});

const { distribution: splashDistribution } = new SplashPageStack(
  app,
  "IncidentlySplashPageStack",
  {
    env,
    hostedZone,
    certificate,
    domainNames: splashDomainNames,
  },
);

const { distribution: appDistribution } = new CdnStack(
  app,
  "IncidentlyCdnStack",
  {
    env,
    hostedZone,
    certificate,
    domainNames: appDomainNames,
    loadBalancer,
  },
);

new DnsStack(app, "IncidentlyDnsStack", {
  env,
  hostedZone,
  domainNames: appDomainNames,
  distribution: appDistribution,
  splashDistribution: splashDistribution,
  splashDomainNames: splashDomainNames,
});
