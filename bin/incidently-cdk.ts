import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { InfraStack } from "../lib/infra-stack";
import { EcrStack } from "../lib/ecr-stack";
import { CertificateStack } from "../lib/certificate-stack";
import { DnsStack } from "../lib/dns-stack";

/** uncomment if you have a purchased domain name on AWS! */
// const domainName = "www.domain.com";
// const hostedZoneId = "HOSTED_ZONE_ID";

const app = new cdk.App();
const env = { account: "692859939927", region: "ap-southeast-2" };

const { repository } = new EcrStack(app, "IncidentlyRailsRepo", { env });

new InfraStack(app, "IncidentlyRailsStack", {
  repository,
});

/** uncomment if you have a purchased domain name on AWS! */
// const { hostedZone } = new CertificateStack(app, 'CertificateStack', { env, hostedZoneId, domainName });

/** uncomment if you have a purchased domain name on AWS! */
// const dnsStack = new DnsStack(app, 'DnsStack', { env, hostedZone, domainName, distribution })
