import {
  client,
  signer
} from '../util'

import {
  Action,
  DataWitness,
  WitnessComponent
} from './types'

export function createFundingTx(actions: Action[]): Promise<Object> {
  return client.transactions.build(builder => {
    actions.forEach(action => {
      switch (action.type) {
        case "spendFromAccount":
          builder.spendFromAccount(action)
          break
        case "controlWithReceiver":
          builder.controlWithReceiver(action)
          break
        default:
          break
      }
    })
  }).then((tpl) => {
    tpl.signingInstructions.forEach((instruction) => {
      instruction.witnessComponents.forEach((component) => {
        component.keys.forEach((key) => {
          signer.addKey(key.xpub, client.mockHsm.signerConnection)
        })
      })
    })
    return signer.sign(tpl)
  }).then((tpl) => {
    return client.transactions.submit(tpl)
  }).then((tx) => {
    return client.unspentOutputs.query({"filter": "transaction_id=$1", "filterParams": [tx.id]})
  }).then((utxos) => {
    return utxos.items.find(utxo => utxo.purpose !== 'change')
  })
}

export const createSpendingTx = (actions: Action[], witness: WitnessComponent[], mintimes, maxtimes): Promise<Object> => {
  return client.transactions.build(builder => {
    actions.forEach(action => {
      switch (action.type) {
        case "spendFromAccount":
          builder.spendFromAccount(action)
          break
        case "controlWithReceiver":
          builder.controlWithReceiver(action)
          break
        case "controlWithAccount":
          builder.controlWithAccount(action)
          break
        case "spendUnspentOutput":
          builder.spendAnyUnspentOutput(action)
          break
        default:
          break
      }
    })
    if (mintimes.length > 0) {
      const max = mintimes.reduce((currMax, currVal) => {
        if (currVal.getTime() > currMax.getTime()) {
          return currVal
        }
        return currMax
      }, mintimes[0])
      const mintime = new Date(max)
      builder.minTime = mintime.setSeconds(mintime.getSeconds() + 1)
    }
    if (maxtimes.length > 0) {
      const min = maxtimes.reduce((currMin, currVal) => {
        if (currVal.getTime() < currMin.getTime()) {
          return currVal
        }
        return currMin
      }, maxtimes[0])
      const maxtime = new Date(min)
      builder.maxTime = maxtime.setSeconds(maxtime.getSeconds() - 1)
    }
  }).then((tpl) => {
    // there should only be one
    tpl.includesContract = true
    tpl.signingInstructions[0].witnessComponents = witness
    tpl.signingInstructions.forEach((instruction, idx) => {
      instruction.witnessComponents.forEach((component) => {
        if (component.keys === undefined) {
          return
        }
        component.keys.forEach((key) => {
          signer.addKey(key.xpub, client.mockHsm.signerConnection)
        })
      })
    })
    return signer.sign(tpl)
  }).then((tpl) => {
    witness = tpl.signingInstructions[0].witnessComponents
    if (witness !== undefined) {
      tpl.signingInstructions[0].witnessComponents = witness.map(component => {
        switch(component.type) {
          case "raw_tx_signature":
            return {
              type: "data",
              value: component.signatures[0]
            } as DataWitness
          default:
            return component
        }
      })
    }
    return client.transactions.submit(tpl)
  })
}
