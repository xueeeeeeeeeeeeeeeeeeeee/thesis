import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Spin } from 'antd'
import { useAuthStore } from '@/store/authStore'

// 路由守卫：未登录跳转到 /login，并记录来源页面
const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, initialized } = useAuthStore()
  const location = useLocation()

  if (!initialized) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Spin size="large" tip="正在加载…" />
      </div>
    )
  }

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}

export default RequireAuth
