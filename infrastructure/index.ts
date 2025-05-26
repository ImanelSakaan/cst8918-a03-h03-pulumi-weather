import * as pulumi from "@pulumi/pulumi";
import * as resources from '@pulumi/azure-native/resources'
import * as containerregistry from '@pulumi/azure-native/containerregistry'
import * as dockerBuild from "@pulumi/docker-build";
import * as containerinstance from '@pulumi/azure-native/containerinstance'
// import * as cache from '@pulumi/azure-native/cache'
// import * as azure_native from '@pulumi/azure-native';
import * as azure_native from '@pulumi/azure-native';
import * as redis from '@pulumi/azure-native/redis';


// Import the configuration settings for the current stack.
const config = new pulumi.Config()
// const appPath = config.require('appPath')
// const prefixName = config.require('prefixName')
// const imageName = prefixName
// const imageTag = config.require('imageTag')
// Azure container instances (ACI) service does not yet support port mapping
// so, the containerPort and publicPort must be the same
// const containerPort = config.requireNumber('containerPort')
// const publicPort = config.requireNumber('publicPort')
// const cpu = config.requireNumber('cpu')
//// const memory = config.requireNumber('memory')


const appPath = '../'
const prefixName = 'cst8918-a03-elsa0105'  
const imageName = prefixName
const imageTag = 'v0.2.0'

// Azure container instances (ACI) service does not yet support port mapping
// so, the containerPort and publicPort must be the same
const containerPort = 80
const publicPort = 80
const cpu = 1
const memory = 2

// Create a resource group.
const resourceGroup = new resources.ResourceGroup(`${prefixName}-rg`)


// const redis = new azure_native.cache.Redis(`${prefixName}-redis`, {

// Create a managed Redis service
// const redisService = new redis.Redis(`${prefixName}-redis`, {

const redisService = new redis.Redis("weather-redis", {
  name: `${prefixName}-weather-cache`,
  location: 'westus3',
  resourceGroupName: resourceGroup.name,
  enableNonSslPort: true,
  redisVersion: 'Latest',
  minimumTlsVersion: '1.2',
  redisConfiguration: {
    maxmemoryPolicy: 'allkeys-lru',
  },
  sku: {
    name: 'Basic',
    family: 'C',
    capacity: 0,
  },
})


// const redisAccessKey = azure_native.cache.listRedisKeysOutput({


// ✅ Extract the Redis access key
const redisAccessKey = redis.listRedisKeysOutput({
  name: redisService.name,
  resourceGroupName: resourceGroup.name,
}).apply((keys: { primaryKey: string }) => keys.primaryKey);

// }).apply((keys) => keys.primaryKey);

// ✅ Extract the Redis access key
//const redisAccessKey = cache.listRedisKeysOutput({
//  name: redis.name,
//  resourceGroupName: resourceGroup.name,
// }).apply((keys) => keys.primaryKey);


// ✅ Build the Redis connection string
// const redisConnectionString = pulumi.all([redisAccessKey, redis.hostName]).apply(
//  ([key, host]) => `redis://:${key}@${host}:6379`
//);

const redisConnectionString = pulumi.interpolate`rediss://:${redisAccessKey}@${redisService.hostName}:${redisService.sslPort}`;

// const redisConnectionString = pulumi.interpolate`rediss://:${redisAccessKey}@${redis.hostName}:${redis.sslPort}`;


// ✅ Now use `redisConnectionString` in your container definition:
const containerEnv = [
  {
    name: "REDIS_URL",
    value: redisConnectionString,
  },
  {
    name: "WEATHER_API_KEY",
    value: config.requireSecret("weatherApiKey"),
  },
];



// Create the container registry.


const registryName = `${prefixName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}acr`;


// Get the authentication credentials for the container registry.

const registry = new containerregistry.Registry(registryName, {
  resourceGroupName: resourceGroup.name,
  adminUserEnabled: true,
  sku: {
    name: containerregistry.SkuName.Basic,
  },
});

// Get the authentication credentials for the container registry.
const registryCredentials = containerregistry
  .listRegistryCredentialsOutput({
    resourceGroupName: resourceGroup.name,
    registryName: registry.name,
  })
  .apply((creds) => {
    return {
      username: creds.username!,
      password: creds.passwords![0].value!,
    }
  })

  
    //export const acrServer = registry.loginServer
    //export const acrUsername = registryCredentials.username

 // Define the container image for the service.
const image = new dockerBuild.Image(`${prefixName}-image`, {
  tags: [pulumi.interpolate`${registry.loginServer}/${imageName}:${imageTag}`],
  context: { location: appPath },
  dockerfile: { location: `${appPath}/Dockerfile` },
  target: 'production',
  platforms: ['linux/amd64', 'linux/arm64'],
  push: true,
  registries: [
    {
      address: registry.loginServer,
      username: registryCredentials.username,
      password: registryCredentials.password,
    },
  ],
})



// Create a container group in the Azure Container App service and make it publicly accessible.
const containerGroup = new containerinstance.ContainerGroup(
  `${prefixName}-container-group`,
  {
    resourceGroupName: resourceGroup.name,
    osType: 'linux',
    restartPolicy: 'always',
    imageRegistryCredentials: [
      {
        server: registry.loginServer,
        username: registryCredentials.username,
        password: registryCredentials.password,
      },
    ],
    containers: [
      {
        name: imageName,
        image: image.ref,
        ports: [
          {
            port: containerPort,
            protocol: 'tcp',
          },
        ],
        environmentVariables: [
          {
            name: 'PORT',
            value: containerPort.toString(),
          },
          {
            name: 'WEATHER_API_KEY',
            // value: '<your-secret-key>',
            value: config.requireSecret('weatherApiKey')
          },
        ],
        resources: {
          requests: {
            cpu: cpu,
            memoryInGB: memory,
          },
        },
      },
    ],
    ipAddress: {
      type: containerinstance.ContainerGroupIpAddressType.Public,
      dnsNameLabel: `${imageName}`,
      ports: [
        {
          port: publicPort,
          protocol: 'tcp',
        },
      ],
    },
  },
)