import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { InfraStack } from "../lib/infra-stack";
import { EcrStack } from "../lib/ecr-stack";
import { CertificateStack } from "../lib/certificate-stack";
import { DnsStack } from "../lib/dns-stack";
import { CdnStack } from "../lib/cdn-stack";

const rootDomainName = "pingln.com";
const domainNames = [
  rootDomainName,
  "www.pingln.com",
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

const { loadBalancer } = new InfraStack(app, "IncidentlyRailsStack", {
  env,
  repository,
});

const { distribution } = new CdnStack(app, "IncidentlyCdnStack", {
  env,
  hostedZone,
  certificate,
  domainNames,
  loadBalancer,
});

new DnsStack(app, "IncidentlyDnsStack", {
  env,
  hostedZone,
  domainNames,
  distribution,
});
