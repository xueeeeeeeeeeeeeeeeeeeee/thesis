import React, { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { Form, Input, Button, Typography, message, Divider } from 'antd'
import { RobotOutlined, MailOutlined, LockOutlined } from '@ant-design/icons'
import { useAuthStore } from '@/store/authStore'

const { Title, Text, Paragraph } = Typography

interface LocationState {
  from?: { pathname: string }
}

const Login: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, loading } = useAuthStore()
  const [form] = Form.useForm()
  // 默认填充管理员账号，方便测试
  const [initialValues] = useState({
    email: 'admin@rap.dev',
    password: 'admin123',
  })

  const from = (location.state as LocationState)?.from?.pathname ?? '/'

  const onFinish = async (values: { email: string; password: string }) => {
    const ok = await login(values.email, values.password)
    if (ok) {
      message.success('登录成功')
      navigate(from, { replace: true })
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        background: '#f5f7fa',
      }}
    >
      {/* 左侧：渐变背景 + Logo + 标语 */}
      <div
        style={{
          flex: 1,
          background:
            'linear-gradient(135deg, #0f172a 0%, #1e3a8a 50%, #2563eb 100%)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '64px 56px',
          color: '#fff',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -80,
            right: -80,
            width: 320,
            height: 320,
            borderRadius: '50%',
            background: 'rgba(96, 165, 250, 0.15)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -120,
            left: -60,
            width: 260,
            height: 260,
            borderRadius: '50%',
            background: 'rgba(147, 51, 234, 0.12)',
          }}
        />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 480 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
            <RobotOutlined style={{ fontSize: 40, color: '#60a5fa' }} />
            <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: 2 }}>
              RAP<span style={{ color: '#60a5fa' }}>·</span>科研自动化平台
            </span>
          </div>
          <Title level={2} style={{ color: '#fff', marginBottom: 16 }}>
            Research Auto-Pilot
          </Title>
          <Paragraph style={{ color: 'rgba(255,255,255,0.85)', fontSize: 16, lineHeight: 1.8 }}>
            一站式科研自动化平台，覆盖文献检索、实验执行、论文撰写全流程，
            让研究者从重复劳动中解放，专注于真正的创新。
          </Paragraph>
          <div style={{ marginTop: 40, color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
            <div>• 8 阶段研究流水线 · 多智能体协作</div>
            <div style={{ marginTop: 4 }}>• 人审中断点（HIL）· 全程可控可回滚</div>
            <div style={{ marginTop: 4 }}>• RAG 知识库 · 自动化论文撰写</div>
          </div>
        </div>
      </div>

      {/* 右侧：登录表单 */}
      <div
        style={{
          width: 460,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fff',
        }}
      >
        <div style={{ width: '100%', maxWidth: 340, padding: '0 24px' }}>
          <Title level={3} style={{ marginBottom: 8 }}>
            欢迎回来
          </Title>
          <Text type="secondary">登录您的科研自动化账户</Text>

          <Form
            form={form}
            layout="vertical"
            initialValues={initialValues}
            onFinish={onFinish}
            style={{ marginTop: 32 }}
            size="large"
          >
            <Form.Item
              name="email"
              label="邮箱"
              rules={[
                { required: true, message: '请输入邮箱' },
                { type: 'email', message: '邮箱格式不正确' },
              ]}
            >
              <Input prefix={<MailOutlined />} placeholder="you@example.com" />
            </Form.Item>
            <Form.Item
              name="password"
              label="密码"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="请输入密码" />
            </Form.Item>
            <Form.Item style={{ marginBottom: 16 }}>
              <Button
                type="primary"
                htmlType="submit"
                block
                loading={loading}
              >
                登录
              </Button>
            </Form.Item>
          </Form>

          <Divider plain style={{ margin: '12px 0' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>或</Text>
          </Divider>

          <div style={{ textAlign: 'center' }}>
            <Text type="secondary">还没有账号？</Text>{' '}
            <Link to="/register">立即注册</Link>
          </div>

          <div
            style={{
              marginTop: 24,
              padding: 12,
              background: '#f8fafc',
              border: '1px dashed #cbd5e1',
              borderRadius: 6,
              fontSize: 12,
              color: '#64748b',
              textAlign: 'center',
            }}
          >
            测试账号：admin@rap.dev / admin123
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login
