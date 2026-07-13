import React from 'react'
import { Breadcrumb } from 'antd'

interface PageContainerProps {
  title: string
  breadcrumb?: { title: string; path?: string }[]
  extra?: React.ReactNode
  children: React.ReactNode
}

// 通用页面容器：标题 + 面包屑 + 操作区 + 内容区
const PageContainer: React.FC<PageContainerProps> = ({
  title,
  breadcrumb,
  extra,
  children,
}) => {
  return (
    <div style={{ padding: 24, background: '#f5f7fa', minHeight: '100%' }}>
      {breadcrumb && (
        <Breadcrumb
          style={{ marginBottom: 12 }}
          items={breadcrumb.map((b) => ({ title: b.title }))}
        />
      )}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: '#1e293b' }}>
          {title}
        </h2>
        <div>{extra}</div>
      </div>
      <div>{children}</div>
    </div>
  )
}

export default PageContainer
