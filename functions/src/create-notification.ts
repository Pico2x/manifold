import * as admin from 'firebase-admin'
import {
  Notification,
  notification_reason_types,
  notification_source_update_types,
  notification_source_types,
} from '../../common/notification'
import { User } from '../../common/user'
import { Contract } from '../../common/contract'
import { getUserByUsername, getValues } from './utils'
import { Comment } from '../../common/comment'
import { uniq } from 'lodash'
import { Bet } from '../../common/bet'
import { Answer } from '../../common/answer'
import { getContractBetMetrics } from '../../common/calculate'
import { removeUndefinedProps } from '../../common/util/object'
const firestore = admin.firestore()

type user_to_reason_texts = {
  [userId: string]: { reason: notification_reason_types }
}

export const createNotification = async (
  sourceId: string,
  sourceType: notification_source_types,
  sourceUpdateType: notification_source_update_types,
  sourceUser: User,
  idempotencyKey: string,
  sourceText: string,
  sourceContract?: Contract,
  relatedSourceType?: notification_source_types,
  relatedUserId?: string,
  sourceSlug?: string,
  sourceTitle?: string
) => {
  const shouldGetNotification = (
    userId: string,
    userToReasonTexts: user_to_reason_texts
  ) => {
    return (
      sourceUser.id != userId &&
      !Object.keys(userToReasonTexts).includes(userId)
    )
  }

  const createUsersNotifications = async (
    userToReasonTexts: user_to_reason_texts
  ) => {
    await Promise.all(
      Object.keys(userToReasonTexts).map(async (userId) => {
        const notificationRef = firestore
          .collection(`/users/${userId}/notifications`)
          .doc(idempotencyKey)
        const notification: Notification = {
          id: idempotencyKey,
          userId,
          reason: userToReasonTexts[userId].reason,
          createdTime: Date.now(),
          isSeen: false,
          sourceId,
          sourceType,
          sourceUpdateType,
          sourceContractId: sourceContract?.id,
          sourceUserName: sourceUser.name,
          sourceUserUsername: sourceUser.username,
          sourceUserAvatarUrl: sourceUser.avatarUrl,
          sourceText,
          sourceContractCreatorUsername: sourceContract?.creatorUsername,
          // TODO: move away from sourceContractTitle to sourceTitle
          sourceContractTitle: sourceContract?.question,
          sourceContractSlug: sourceContract?.slug,
          sourceSlug: sourceSlug ? sourceSlug : sourceContract?.slug,
          sourceTitle: sourceTitle ? sourceTitle : sourceContract?.question,
        }
        await notificationRef.set(removeUndefinedProps(notification))
      })
    )
  }

  const notifyLiquidityProviders = async (
    userToReasonTexts: user_to_reason_texts,
    contract: Contract
  ) => {
    const liquidityProviders = await firestore
      .collection(`contracts/${contract.id}/liquidity`)
      .get()
    const liquidityProvidersIds = uniq(
      liquidityProviders.docs.map((doc) => doc.data().userId)
    )
    liquidityProvidersIds.forEach((userId) => {
      if (!shouldGetNotification(userId, userToReasonTexts)) return
      userToReasonTexts[userId] = {
        reason: 'on_contract_with_users_shares_in',
      }
    })
  }

  const notifyUsersFollowers = async (
    userToReasonTexts: user_to_reason_texts
  ) => {
    const followers = await firestore
      .collectionGroup('follows')
      .where('userId', '==', sourceUser.id)
      .get()

    followers.docs.forEach((doc) => {
      const followerUserId = doc.ref.parent.parent?.id
      if (
        followerUserId &&
        shouldGetNotification(followerUserId, userToReasonTexts)
      ) {
        userToReasonTexts[followerUserId] = {
          reason: 'you_follow_user',
        }
      }
    })
  }

  const notifyRepliedUsers = async (
    userToReasonTexts: user_to_reason_texts,
    relatedUserId: string,
    relatedSourceType: notification_source_types
  ) => {
    if (!shouldGetNotification(relatedUserId, userToReasonTexts)) return
    if (relatedSourceType === 'comment') {
      userToReasonTexts[relatedUserId] = {
        reason: 'reply_to_users_comment',
      }
    } else if (relatedSourceType === 'answer') {
      userToReasonTexts[relatedUserId] = {
        reason: 'reply_to_users_answer',
      }
    }
  }

  const notifyFollowedUser = async (
    userToReasonTexts: user_to_reason_texts,
    followedUserId: string
  ) => {
    if (shouldGetNotification(followedUserId, userToReasonTexts))
      userToReasonTexts[followedUserId] = {
        reason: 'on_new_follow',
      }
  }

  const notifyTaggedUsers = async (
    userToReasonTexts: user_to_reason_texts,
    sourceText: string
  ) => {
    const taggedUsers = sourceText.match(/@\w+/g)
    if (!taggedUsers) return
    // await all get tagged users:
    const users = await Promise.all(
      taggedUsers.map(async (username) => {
        return await getUserByUsername(username.slice(1))
      })
    )
    users.forEach((taggedUser) => {
      if (taggedUser && shouldGetNotification(taggedUser.id, userToReasonTexts))
        userToReasonTexts[taggedUser.id] = {
          reason: 'tagged_user',
        }
    })
  }

  const notifyContractCreator = async (
    userToReasonTexts: user_to_reason_texts,
    sourceContract: Contract,
    options?: { force: boolean }
  ) => {
    if (
      options?.force ||
      shouldGetNotification(sourceContract.creatorId, userToReasonTexts)
    )
      userToReasonTexts[sourceContract.creatorId] = {
        reason: 'on_users_contract',
      }
  }

  const notifyOtherAnswerersOnContract = async (
    userToReasonTexts: user_to_reason_texts,
    sourceContract: Contract
  ) => {
    const answers = await getValues<Answer>(
      firestore
        .collection('contracts')
        .doc(sourceContract.id)
        .collection('answers')
    )
    const recipientUserIds = uniq(answers.map((answer) => answer.userId))
    recipientUserIds.forEach((userId) => {
      if (shouldGetNotification(userId, userToReasonTexts))
        userToReasonTexts[userId] = {
          reason: 'on_contract_with_users_answer',
        }
    })
  }

  const notifyOtherCommentersOnContract = async (
    userToReasonTexts: user_to_reason_texts,
    sourceContract: Contract
  ) => {
    const comments = await getValues<Comment>(
      firestore
        .collection('contracts')
        .doc(sourceContract.id)
        .collection('comments')
    )
    const recipientUserIds = uniq(comments.map((comment) => comment.userId))
    recipientUserIds.forEach((userId) => {
      if (shouldGetNotification(userId, userToReasonTexts))
        userToReasonTexts[userId] = {
          reason: 'on_contract_with_users_comment',
        }
    })
  }

  const notifyBettorsOnContract = async (
    userToReasonTexts: user_to_reason_texts,
    sourceContract: Contract
  ) => {
    const betsSnap = await firestore
      .collection(`contracts/${sourceContract.id}/bets`)
      .get()
    const bets = betsSnap.docs.map((doc) => doc.data() as Bet)
    // filter bets for only users that have an amount invested still
    const recipientUserIds = uniq(bets.map((bet) => bet.userId)).filter(
      (userId) => {
        return (
          getContractBetMetrics(
            sourceContract,
            bets.filter((bet) => bet.userId === userId)
          ).invested > 0
        )
      }
    )
    recipientUserIds.forEach((userId) => {
      if (shouldGetNotification(userId, userToReasonTexts))
        userToReasonTexts[userId] = {
          reason: 'on_contract_with_users_shares_in',
        }
    })
  }

  const notifyUserAddedToGroup = async (
    userToReasonTexts: user_to_reason_texts,
    relatedUserId: string
  ) => {
    if (shouldGetNotification(relatedUserId, userToReasonTexts))
      userToReasonTexts[relatedUserId] = {
        reason: 'added_you_to_group',
      }
  }

  const getUsersToNotify = async () => {
    const userToReasonTexts: user_to_reason_texts = {}
    // The following functions modify the userToReasonTexts object in place.
    if (sourceContract) {
      if (
        sourceType === 'comment' ||
        sourceType === 'answer' ||
        (sourceType === 'contract' &&
          (sourceUpdateType === 'updated' || sourceUpdateType === 'resolved'))
      ) {
        if (sourceType === 'comment') {
          if (relatedUserId && relatedSourceType)
            await notifyRepliedUsers(
              userToReasonTexts,
              relatedUserId,
              relatedSourceType
            )
          if (sourceText) await notifyTaggedUsers(userToReasonTexts, sourceText)
        }
        await notifyContractCreator(userToReasonTexts, sourceContract)
        await notifyOtherAnswerersOnContract(userToReasonTexts, sourceContract)
        await notifyLiquidityProviders(userToReasonTexts, sourceContract)
        await notifyBettorsOnContract(userToReasonTexts, sourceContract)
        await notifyOtherCommentersOnContract(userToReasonTexts, sourceContract)
      } else if (sourceType === 'contract' && sourceUpdateType === 'created') {
        await notifyUsersFollowers(userToReasonTexts)
      } else if (sourceType === 'contract' && sourceUpdateType === 'closed') {
        await notifyContractCreator(userToReasonTexts, sourceContract, {
          force: true,
        })
      } else if (sourceType === 'liquidity' && sourceUpdateType === 'created') {
        await notifyContractCreator(userToReasonTexts, sourceContract)
      }
    } else if (sourceType === 'follow' && relatedUserId) {
      await notifyFollowedUser(userToReasonTexts, relatedUserId)
    } else if (sourceType === 'group' && relatedUserId) {
      if (sourceUpdateType === 'created')
        await notifyUserAddedToGroup(userToReasonTexts, relatedUserId)
    }
    return userToReasonTexts
  }

  const userToReasonTexts = await getUsersToNotify()
  await createUsersNotifications(userToReasonTexts)
}
