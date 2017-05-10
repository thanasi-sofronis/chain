import { AssetAliasInput, AddressInput } from '../inputs/types';
import { getItemMap } from '../assets/selectors';
import { getItem } from '../accounts/selectors';
export const CREATE_CONTRACT = 'contracts/CREATE_CONTRACT'
export const UPDATE_INPUT = 'contracts/UPDATE_INPUT'
import { push } from 'react-router-redux'
import {
  getClauseParameterIds,
  getClauseDataParameterIds,
  getInputMap,
  getParameterData,
  getContractValue,
  getSelectedTemplate,
  getSpendContractId,
  getClauseWitnessComponents,
  getSpendContractSelectedClauseIndex,
  getClauseOutputActions,
  getClauseValues,
  getClauseReturnAction,
  getClauseMintimes,
  getClauseMaxtimes,
} from './selectors';

import { getPromisedInputMap } from '../inputs/data'

import {
  WitnessComponent,
  KeyId,
  DataWitness,
  SignatureWitness,
  Receiver,
  SpendUnspentOutput,
  ControlWithAccount,
  ControlWithReceiver,
  Action
} from '../transactions/types'
import { createFundingTx, createSpendingTx } from '../transactions'
import { client, prefixRoute } from '../util'

export const SELECT_TEMPLATE = 'contracts/SELECT_TEMPLATE'
export const SET_CLAUSE_INDEX = 'contracts/SET_CLAUSE_INDEX'
export const SPEND = 'contracts/SPEND'
export const SHOW_ERRORS = 'contracts/SHOW_ERRORS'

import { getItemMap as getTemplateMap } from '../templates/selectors'
import { getSpendContract } from './selectors'

import { InputMap } from '../inputs/types'

export const showErrors = () => {
  return {
    type: SHOW_ERRORS
  }
}

export const create = () => {
  return (dispatch, getState) => {
    let state = getState()
    let inputMap = getInputMap(state)
    let promisedInputMap = getPromisedInputMap(inputMap)
    promisedInputMap.then((inputMap) => {
      const args = getParameterData(state, inputMap).map(param => {
        if (param instanceof Buffer) {
          return { "string": param.toString('hex') }
        }

        if (typeof param === 'string') {
          return { "string": param }
        }

        if (typeof param === 'number') {
          return { "integer": param }
        }

        if (typeof param === 'boolean') {
          return { 'boolean': param }
        }
        throw 'unsupported argument type ' + (typeof param)
      })
      const template = getSelectedTemplate(state)
      client.ivy.compile({ contract: template.source, args: args }).then(contract => {
        let controlProgram = contract.program
        let spendFromAccount = getContractValue(state)
        if (spendFromAccount === undefined) throw "spendFromAccount should not be undefined here"
        let assetId = spendFromAccount.assetId
        let amount = spendFromAccount.amount
        let receiver: Receiver = {
          controlProgram: controlProgram,
          expiresAt: "2017-06-25T00:00:00.000Z" // TODO
        }
        let controlWithReceiver: ControlWithReceiver = {
          type: "controlWithReceiver",
          receiver,
          assetId,
          amount
        }
        let actions: Action[] = [spendFromAccount, controlWithReceiver]
        return createFundingTx(actions).then(utxo => {
          dispatch({
            type: CREATE_CONTRACT,
            controlProgram,
            template,
            inputMap,
            utxo
          })
          dispatch(push(prefixRoute('/spend')))
        })
      })
    }).catch(err => {
      console.log("error found", err)
      dispatch(showErrors())
    })
  }
}

export const SPEND_CONTRACT = "contracts/SPEND_CONTRACT"

export const spend = () => {
  return(dispatch, getState) => {
    const state = getState()
    const contract = getSpendContract(state)
    const clauseIndex = getSpendContractSelectedClauseIndex(state)
    const outputId = contract.outputId
    const spendContractAction: SpendUnspentOutput = {
      type: "spendUnspentOutput",
      outputId
    }

    const clauseOutputActions: Action[] = getClauseOutputActions(state)
    const clauseValues = getClauseValues(state)
    const actions: Action[] = [spendContractAction, ...clauseOutputActions, ...clauseValues]
    const returnAction = getClauseReturnAction(state)
    if (returnAction !== undefined) {
      actions.push(returnAction)
    }

    const clauseParams = getClauseParameterIds(state)
    const clauseDataParams = getClauseDataParameterIds(state)
    const witness: WitnessComponent[] = getClauseWitnessComponents(getState())
    const mintimes = getClauseMintimes(getState())
    const maxtimes = getClauseMaxtimes(getState())
    createSpendingTx(actions, witness, mintimes, maxtimes).then((result) => {
      dispatch({
        type: SPEND_CONTRACT,
        id: contract.id
      })
      dispatch(push(prefixRoute('/spend')))
    })
  }
}

export const setClauseIndex = (selectedClauseIndex: number) => {
  return {
    type: SET_CLAUSE_INDEX,
    selectedClauseIndex: selectedClauseIndex
  }
}

export const selectTemplate = (templateId: string) => {
  return(dispatch, getState) => {
    let templateMap = getTemplateMap(getState())
    dispatch({
      type: SELECT_TEMPLATE,
      template: templateMap[templateId],
      templateId
    })
  }
}

export function updateInput(name: string, newValue: string) {
  return {
    type: UPDATE_INPUT,
    name: name,
    newValue: newValue
  }
}

export const UPDATE_CLAUSE_INPUT = 'UPDATE_CLAUSE_INPUT'

export function updateClauseInput(name: string, newValue: string) {
  return (dispatch, getState) => {
    let state = getState()
    let contractId = getSpendContractId(state)
    dispatch({
      type: UPDATE_CLAUSE_INPUT,
      contractId: contractId,
      name: name,
      newValue: newValue
    })
  }
}
