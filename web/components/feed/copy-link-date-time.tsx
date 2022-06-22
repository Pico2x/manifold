import React, { useState } from 'react'
import { ENV_CONFIG } from 'common/envs/constants'
import { copyToClipboard } from 'web/lib/util/copy'
import { DateTimeTooltip } from 'web/components/datetime-tooltip'
import Link from 'next/link'
import { fromNow } from 'web/lib/util/time'
import { ToastClipboard } from 'web/components/toast-clipboard'
import { LinkIcon } from '@heroicons/react/outline'
import clsx from 'clsx'

export function CopyLinkDateTimeComponent(props: {
  prefix: string
  slug: string
  createdTime: number
  elementId: string
  className?: string
}) {
  const { prefix, slug, elementId, createdTime, className } = props
  const [showToast, setShowToast] = useState(false)

  function copyLinkToComment(
    event: React.MouseEvent<HTMLAnchorElement, MouseEvent>
  ) {
    event.preventDefault()
    const elementLocation = `https://${ENV_CONFIG.domain}/${prefix}/${slug}#${elementId}`

    copyToClipboard(elementLocation)
    setShowToast(true)
    setTimeout(() => setShowToast(false), 2000)
  }
  return (
    <div className={clsx('inline', className)}>
      <DateTimeTooltip time={createdTime}>
        <Link href={`/${prefix}/${slug}#${elementId}`} passHref={true}>
          <a
            onClick={(event) => copyLinkToComment(event)}
            className={'mx-1 cursor-pointer'}
          >
            <span className="whitespace-nowrap rounded-sm px-1 text-gray-400 hover:bg-gray-100 ">
              {fromNow(createdTime)}
              {showToast && (
                <ToastClipboard className={'left-24 sm:-left-16'} />
              )}
              <LinkIcon
                className="ml-1 mb-0.5 inline-block text-gray-400"
                height={13}
              />
            </span>
          </a>
        </Link>
      </DateTimeTooltip>
    </div>
  )
}
