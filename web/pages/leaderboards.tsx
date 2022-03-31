import _ from 'lodash'

import { Col } from '../components/layout/col'
import { Leaderboard } from '../components/leaderboard'
import { Page } from '../components/page'
import { getTopCreators, getTopTraders, User } from '../lib/firebase/users'
import { formatMoney } from '../../common/util/format'
import { fromPropz, usePropz } from '../hooks/use-propz'
import { Manaboard } from '../components/manaboard'

export const getStaticProps = fromPropz(getStaticPropz)
export async function getStaticPropz() {
  const [topTraders, topCreators] = await Promise.all([
    getTopTraders().catch((_) => {}),
    getTopCreators().catch((_) => {}),
  ])

  return {
    props: {
      topTraders,
      topCreators,
    },

    revalidate: 60, // regenerate after a minute
  }
}

function Leaderboards(props: { topTraders: User[]; topCreators: User[] }) {
  props = usePropz(props, getStaticPropz) ?? {
    topTraders: [],
    topCreators: [],
  }
  const { topTraders, topCreators } = props

  return (
    <Page margin>
      <Col className="items-center gap-10 lg:flex-row">
        <Leaderboard
          title="🏅 Top traders"
          users={topTraders}
          columns={[
            {
              header: 'Total profit',
              renderCell: (user) => formatMoney(user.totalPnLCached),
            },
          ]}
        />
        <Leaderboard
          title="🏅 Top creators"
          users={topCreators}
          columns={[
            {
              header: 'Market volume',
              renderCell: (user) => formatMoney(user.creatorVolumeCached),
            },
          ]}
        />
      </Col>
    </Page>
  )
}

export default function Manaboards(props: {
  topTraders: User[]
  topCreators: User[]
}) {
  props = usePropz(props, getStaticPropz) ?? {
    topTraders: [],
    topCreators: [],
  }
  const { topTraders, topCreators } = props

  return (
    <Page margin>
      <Col className="items-center gap-10 lg:flex-row">
        <Manaboard title="🏅 Top traders" users={topTraders} />
        <Manaboard title="🏅 Top creators" users={topCreators} />
      </Col>
    </Page>
  )
}
