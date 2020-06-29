const { Component } = require('@serverless/core')
const { Scf } = require('tencent-component-toolkit')
const { TypeError } = require('tencent-component-toolkit/src/utils/error')
const { prepareInputs } = require('./utils')
const CONFIGS = require('./config')

class ServerlessComponent extends Component {
  getCredentials() {
    const { tmpSecrets } = this.credentials.tencent

    if (!tmpSecrets || !tmpSecrets.TmpSecretId) {
      throw new TypeError(
        'CREDENTIAL',
        `Cannot get secretId/Key, your account could be sub-account and does not have the access to use SLS_QcsRole, please make sure the role exists first, then visit https://cloud.tencent.com/document/product/1154/43006, follow the instructions to bind the role to your account.`
      )
    }

    return {
      SecretId: tmpSecrets.TmpSecretId,
      SecretKey: tmpSecrets.TmpSecretKey,
      Token: tmpSecrets.Token
    }
  }

  getAppId() {
    return this.credentials.tencent.tmpSecrets.appId
  }

  getDefaultProtocol(protocols) {
    if (String(protocols).includes('https')) {
      return 'https'
    }
    return 'http'
  }

  async deploy(inputs) {
    console.log(`Deploying Tencent ${CONFIGS.componentFullname}...`)

    const credentials = this.getCredentials()
    const appId = this.getAppId()

    // 默认值
    const region = inputs.region || CONFIGS.region

    // prepare scf inputs parameters
    const { scfInputs, existApigwTrigger, triggers, useDefault } = await prepareInputs(
      this,
      credentials,
      appId,
      inputs
    )

    const scf = new Scf(credentials, region)
    const scfOutput = await scf.deploy(scfInputs)

    const outputs = {
      FunctionName: scfOutput.FunctionName,
      Description: scfOutput.Description,
      Region: scfOutput.Region,
      Namespace: scfOutput.Namespace,
      Runtime: scfOutput.Runtime,
      Handler: scfOutput.Handler,
      MemorySize: scfOutput.MemorySize
    }

    if (scfOutput.LastVersion) {
      outputs.LastVersion = scfOutput.LastVersion
      this.state.lastVersion = scfOutput.LastVersion
    }

    if (scfOutput.Traffic) {
      outputs.Traffic = scfOutput.Traffic
      this.state.functionTraffic = scfOutput.Traffic
    }

    // handle apigw event outputs
    if (existApigwTrigger) {
      const stateApigw = {}
      scfOutput.Triggers.forEach((apigwTrigger) => {
        if (apigwTrigger.serviceId) {
          stateApigw[apigwTrigger.serviceName] = apigwTrigger.serviceId
          apigwTrigger.apiList.forEach((endpoint) => {
            triggers['apigw'].push(
              `${this.getDefaultProtocol(apigwTrigger.protocols)}://${apigwTrigger.subDomain}/${
                apigwTrigger.environment
              }${endpoint.path}`
            )
          })
        }
      })
      this.state.apigw = stateApigw
    }

    outputs.triggers = triggers

    if (useDefault) {
      outputs.templateUrl = CONFIGS.templateUrl
    }

    this.state.region = region
    this.state.function = scfOutput

    // must add this property for debuging online
    this.state.lambdaArn = scfOutput.FunctionName

    await this.save()

    console.log(`Deployed Tencent ${CONFIGS.componentFullname}...`)

    return outputs
  }

  // eslint-disable-next-line
  async remove(inputs = {}) {
    const credentials = this.getCredentials()
    const { region } = this.state
    const functionInfo = this.state.function

    console.log(`Removing Tencent ${CONFIGS.componentFullname}...`)
    const scf = new Scf(credentials, region)
    if (functionInfo && functionInfo.FunctionName) {
      await scf.remove(functionInfo)
    }
    this.state = {}
    console.log(`Removed Tencent ${CONFIGS.componentFullname}`)
  }
}

module.exports = ServerlessComponent
