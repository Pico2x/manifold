export type Manalink = {
  // The link to send: https://manifold.markets/send/{slug}
  // Also functions as the unique id for the link.
  slug: string

  // Note: we assume both fromId and toId are of SourceType 'USER'
  fromId: string

  // How much to send with the link
  amount: number
  token: 'M$' // TODO: could send eg YES shares too??

  createdTime: number
  // If set to Infinity, the link is valid forever
  expiresTime: number
  // If set to Infinity, the link can be used infinitely
  maxUses: number

  // Successful redemptions of the link
  successes: Claim[]
  // Failed redemptions of the link
  failures: Claim[]
}

type Claim = {
  toId: string

  claimedTime: number
}
