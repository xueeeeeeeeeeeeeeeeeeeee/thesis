import React from 'react'

// 状态点：绿/黄/红/灰
export type StatusColor = 'green' | 'yellow' | 'red' | 'gray' | 'blue'

interface StatusDotProps {
  color?: StatusColor
  text?: string
  pulse?: boolean
}

const COLOR_MAP: Record<StatusColor, string> = {
  green: '#16a34a',
  yellow: '#ca8a04',
  red: '#dc2626',
  gray: '#94a3b8',
  blue: '#2563eb',
}

const StatusDot: React.FC<StatusDotProps> = ({
  color = 'green',
  text,
  pulse = false,
}) => {
  const bg = COLOR_MAP[color]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 13,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: bg,
          display: 'inline-block',
          boxShadow: pulse ? `0 0 0 0 ${bg}` : 'none',
          animation: pulse ? 'rap-pulse 1.6s infinite' : 'none',
        }}
      />
      {text}
      <style>{`
        @keyframes rap-pulse {
          0% { box-shadow: 0 0 0 0 rgba(22,163,74,0.5); }
          70% { box-shadow: 0 0 0 6px rgba(22,163,74,0); }
          100% { box-shadow: 0 0 0 0 rgba(22,163,74,0); }
        }
      `}</style>
    </span>
  )
}

export default StatusDot
