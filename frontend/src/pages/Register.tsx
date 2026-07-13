import React from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Form, Input, Button, Select, Typography, message, Divider } from 'antd'
import {
  RobotOutlined,
  MailOutlined,
  LockOutlined,
  UserOutlined,
  AppstoreOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '@/store/authStore'
import { DISCIPLINES } from '@/constants'

const { Title, Text, Paragraph } = Typography

const Register: React.FC = () => {
  const navigate = useNavigate()
  const { register, loading } = useAuthStore()
  const [form] = Form.useForm()

  const onFinish = async (values: {
    email: string
    username: string
    password: string
    discipline: string
  }) => {
    const ok = await register({
      email: values.email,
      username: values.username,
      password: values.password,
      discipline: values.discipline,
    })
    if (ok) {
      message.success('注册成功，已自动登录')
      navigate('/', { replace: true })
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
            'linear-gradient(135deg, #0f172a 0%, #4c1d95 50%, #9333ea 100%)',
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
            left: -80,
            width: 320,
            height: 320,
            borderRadius: '50%',
            background: 'rgba(196, 181, 253, 0.15)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -120,
            right: -60,
            width: 260,
            height: 260,
            borderRadius: '50%',
            background: 'rgba(37, 99, 235, 0.12)',
          }}
        />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 480 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
            <RobotOutlined style={{ fontSize: 40, color: '#c4b5fd' }} />
            <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: 2 }}>
              RAP<span style={{ color: '#c4b5fd' }}>·</span>科研自动化平台
            </span>
          </div>
          <Title level={2} style={{ color: '#fff', marginBottom: 16 }}>
            加入 RAP
          </Title>
          <Paragraph style={{ color: 'rgba(255,255,255,0.85)', fontSize: 16, lineHeight: 1.8 }}>
            创建账户，开启您的自动化科研之旅。
            平台支持多学科适配，覆盖 NLP / CV / Bio / 材料 / 化学 / 物理等领域。
          </Paragraph>
          <div style={{ marginTop: 40, color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
            <div>• 注册即送 8 阶段流水线权限</div>
            <div style={{ marginTop: 4 }}>• 多智能体协作 · 全流程可视</div>
            <div style={{ marginTop: 4 }}>• 支持自部署 · 数据完全私有</div>
          </div>
        </div>
      </div>

      {/* 右侧：注册表单 */}
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
            创建账户
          </Title>
          <Text type="secondary">填写信息以注册新账户</Text>

          <Form
            form={form}
            layout="vertical"
            onFinish={onFinish}
            style={{ marginTop: 24 }}
            size="large"
            initialValues={{ discipline: 'NLP' }}
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
              name="username"
              label="用户名"
              rules={[
                { required: true, message: '请输入用户名' },
                { min: 2, message: '用户名至少 2 个字符' },
                { max: 20, message: '用户名最多 20 个字符' },
              ]}
            >
              <Input prefix={<UserOutlined />} placeholder="显示名称" />
            </Form.Item>
            <Form.Item
              name="discipline"
              label="学科方向"
              rules={[{ required: true, message: '请选择学科' }]}
            >
              <Select
                suffixIcon={<AppstoreOutlined />}
                options={DISCIPLINES.map((d) => ({
                  value: d.key,
                  label: `${d.key} · ${d.label}`,
                }))}
              />
            </Form.Item>
            <Form.Item
              name="password"
              label="密码"
              rules={[
                { required: true, message: '请输入密码' },
                { min: 6, message: '密码至少 6 位' },
              ]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="至少 6 位" />
            </Form.Item>
            <Form.Item
              name="confirmPassword"
              label="确认密码"
              dependencies={['password']}
              rules={[
                { required: true, message: '请确认密码' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) {
                      return Promise.resolve()
                    }
                    return Promise.reject(new Error('两次输入的密码不一致'))
                  },
                }),
              ]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="再次输入密码" />
            </Form.Item>
            <Form.Item style={{ marginBottom: 16 }}>
              <Button
                type="primary"
                htmlType="submit"
                block
                loading={loading}
              >
                注册
              </Button>
            </Form.Item>
          </Form>

          <Divider plain style={{ margin: '12px 0' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>或</Text>
          </Divider>

          <div style={{ textAlign: 'center' }}>
            <Text type="secondary">已有账号？</Text>{' '}
            <Link to="/login">去登录</Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Register
