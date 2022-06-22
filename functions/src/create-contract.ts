import * as admin from 'firebase-admin'
import { z } from 'zod'

import {
  CPMMBinaryContract,
  Contract,
  FreeResponseContract,
  MAX_DESCRIPTION_LENGTH,
  MAX_QUESTION_LENGTH,
  MAX_TAG_LENGTH,
  NumericContract,
  OUTCOME_TYPES,
} from '../../common/contract'
import { slugify } from '../../common/util/slugify'
import { randomString } from '../../common/util/random'

import { chargeUser } from './utils'
import { APIError, newEndpoint, validate, zTimestamp } from './api'

import {
  FIXED_ANTE,
  getCpmmInitialLiquidity,
  getFreeAnswerAnte,
  getNumericAnte,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from '../../common/antes'
import { getNoneAnswer } from '../../common/answer'
import { getNewContract } from '../../common/new-contract'
import { NUMERIC_BUCKET_COUNT } from '../../common/numeric-constants'
import { User } from '../../common/user'
import { Group, MAX_ID_LENGTH } from '../../common/group'

const bodySchema = z.object({
  question: z.string().min(1).max(MAX_QUESTION_LENGTH),
  description: z.string().max(MAX_DESCRIPTION_LENGTH),
  tags: z.array(z.string().min(1).max(MAX_TAG_LENGTH)).optional(),
  closeTime: zTimestamp().refine(
    (date) => date.getTime() > new Date().getTime(),
    'Close time must be in the future.'
  ),
  outcomeType: z.enum(OUTCOME_TYPES),
  groupId: z.string().min(1).max(MAX_ID_LENGTH).optional(),
})

const binarySchema = z.object({
  initialProb: z.number().min(1).max(99),
})

const numericSchema = z.object({
  min: z.number(),
  max: z.number(),
})

export const createmarket = newEndpoint(['POST'], async (req, auth) => {
  const { question, description, tags, closeTime, outcomeType, groupId } =
    validate(bodySchema, req.body)

  let min, max, initialProb
  if (outcomeType === 'NUMERIC') {
    ;({ min, max } = validate(numericSchema, req.body))
    if (max - min <= 0.01) throw new APIError(400, 'Invalid range.')
  }
  if (outcomeType === 'BINARY') {
    ;({ initialProb } = validate(binarySchema, req.body))
  }

  // Uses utc time on server:
  const today = new Date()
  let freeMarketResetTime = new Date().setUTCHours(16, 0, 0, 0)
  if (today.getTime() < freeMarketResetTime) {
    freeMarketResetTime = freeMarketResetTime - 24 * 60 * 60 * 1000
  }

  const userDoc = await firestore.collection('users').doc(auth.uid).get()
  if (!userDoc.exists) {
    throw new APIError(400, 'No user exists with the authenticated user ID.')
  }
  const user = userDoc.data() as User

  let group = null
  if (groupId) {
    const groupDoc = await firestore.collection('groups').doc(groupId).get()
    if (!groupDoc.exists) {
      throw new APIError(400, 'No group exists with the given group ID.')
    }

    group = groupDoc.data() as Group
    if (!group.memberIds.includes(user.id)) {
      throw new APIError(400, 'User is not a member of the group.')
    }
  }

  const userContractsCreatedTodaySnapshot = await firestore
    .collection(`contracts`)
    .where('creatorId', '==', auth.uid)
    .where('createdTime', '>=', freeMarketResetTime)
    .get()
  console.log('free market reset time: ', freeMarketResetTime)
  const isFree = userContractsCreatedTodaySnapshot.size === 0

  const ante = FIXED_ANTE

  // TODO: this is broken because it's not in a transaction
  if (ante > user.balance && !isFree)
    throw new APIError(400, `Balance must be at least ${ante}.`)

  console.log(
    'creating contract for',
    user.username,
    'on',
    question,
    'ante:',
    ante || 0
  )

  const slug = await getSlug(question)
  const contractRef = firestore.collection('contracts').doc()
  const contract = getNewContract(
    contractRef.id,
    slug,
    user,
    question,
    outcomeType,
    description,
    initialProb ?? 0,
    ante,
    closeTime.getTime(),
    tags ?? [],
    NUMERIC_BUCKET_COUNT,
    min ?? 0,
    max ?? 0,
    group
      ? {
          groupId: group.id,
          groupName: group.name,
          groupSlug: group.slug,
        }
      : undefined
  )

  if (!isFree && ante) await chargeUser(user.id, ante, true)

  await contractRef.create(contract)

  const providerId = isFree ? HOUSE_LIQUIDITY_PROVIDER_ID : user.id

  if (outcomeType === 'BINARY') {
    const liquidityDoc = firestore
      .collection(`contracts/${contract.id}/liquidity`)
      .doc()

    const lp = getCpmmInitialLiquidity(
      providerId,
      contract as CPMMBinaryContract,
      liquidityDoc.id,
      ante
    )

    await liquidityDoc.set(lp)
  } else if (outcomeType === 'FREE_RESPONSE') {
    const noneAnswerDoc = firestore
      .collection(`contracts/${contract.id}/answers`)
      .doc('0')

    const noneAnswer = getNoneAnswer(contract.id, user)
    await noneAnswerDoc.set(noneAnswer)

    const anteBetDoc = firestore
      .collection(`contracts/${contract.id}/bets`)
      .doc()

    const anteBet = getFreeAnswerAnte(
      providerId,
      contract as FreeResponseContract,
      anteBetDoc.id
    )
    await anteBetDoc.set(anteBet)
  } else if (outcomeType === 'NUMERIC') {
    const anteBetDoc = firestore
      .collection(`contracts/${contract.id}/bets`)
      .doc()

    const anteBet = getNumericAnte(
      providerId,
      contract as NumericContract,
      ante,
      anteBetDoc.id
    )

    await anteBetDoc.set(anteBet)
  }

  return contract
})

const getSlug = async (question: string) => {
  const proposedSlug = slugify(question)

  const preexistingContract = await getContractFromSlug(proposedSlug)

  return preexistingContract
    ? proposedSlug + '-' + randomString()
    : proposedSlug
}

const firestore = admin.firestore()

export async function getContractFromSlug(slug: string) {
  const snap = await firestore
    .collection('contracts')
    .where('slug', '==', slug)
    .get()

  return snap.empty ? undefined : (snap.docs[0].data() as Contract)
}
