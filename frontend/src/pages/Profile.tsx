import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card,
  Form,
  Input,
  Button,
  Select,
  Typography,
  Space,
  Divider,
  message,
  Tag,
  Modal,
} from 'antd'
import {
  UserOutlined,
  LockOutlined,
  KeyOutlined,
  LogoutOutlined,
  MailOutlined,
  SaveOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons'
import PageContainer from '@/components/PageContainer'
import { useAuthStore } from '@/store/authStore'
import { useProjectStore } from '@/store/projectStore'
import { useUserStore } from '@/store/userStore'
import { updateMeApi, changePasswordApi } from '@/services/auth'
import { DISCIPLINES } from '@/constants'
import type { SafeUser } from '@/types'

const { Text, Paragraph } = Typography

const Profile: React.FC = () => {
  const navigate = useNavigate()
  const { user, logout, updateUser } = useAuthStore()
  const resetProjects = useProjectStore((s) => s.setProjects)
  const resetUserStore = useUserStore((s) => s.reset)

  const [profileForm] = Form.useForm()
  const [passwordForm] = Form.useForm()
  const [apiKeyForm] = Form.useForm()
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [savingKeys, setSavingKeys] = useState(false)

  useEffect(() => {
    if (user) {
      profileForm.setFieldsValue({
        username: user.username,
        discipline: user.discipline,
        avatar: user.avatar ?? '',
      })
      apiKeyForm.setFieldsValue({
        deepseek: user.apiKeys?.deepseek ?? '',
        kimi: user.apiKeys?.kimi ?? '',
        qwen: user.apiKeys?.qwen ?? '',
      })
    }
  }, [user, profileForm, apiKeyForm])

  if (!user) {
    return (
      <PageContainer title="账号中心" breadcrumb={[{ title: '首页' }, { title: '账号中心' }]}>
        <Card>用户信息加载中…</Card>
      </PageContainer>
    )
  }

  const handleSaveProfile = async (values: {
    username: string
    discipline: string
    avatar?: string
  }) => {
    setSavingProfile(true)
    try {
      const res = await updateMeApi({
        username: values.username,
        discipline: values.discipline,
        avatar: values.avatar,
      })
      if (res?.code === 0 && res.data?.user) {
        updateUser(res.data.user)
        message.success('基本信息已保存')
      }
    } catch {
      // 错误已由拦截器提示
    } finally {
      setSavingProfile(false)
    }
  }

  const handleChangePassword = async (values: {
    oldPassword: string
    newPassword: string
  }) => {
    setSavingPassword(true)
    try {
      const res = await changePasswordApi({
        oldPassword: values.oldPassword,
        newPassword: values.newPassword,
      })
      if (res?.code === 0) {
        message.success('密码修改成功')
        passwordForm.resetFields()
      }
    } catch {
      // ignore
    } finally {
      setSavingPassword(false)
    }
  }

  const handleSaveApiKeys = async (values: {
    deepseek?: string
    kimi?: string
    qwen?: string
  }) => {
    setSavingKeys(true)
    try {
      // 只在用户实际修改了字段时才提交该字段（避免把掩码值覆盖回后端）
      const payload: Partial<SafeUser> = { apiKeys: {} }
      const current = user.apiKeys ?? {}
      ;(Object.keys(values) as Array<keyof typeof values>).forEach((k) => {
        const v = values[k]
        if (v && v !== current[k]) {
          payload.apiKeys![k] = v
        }
      })
      const res = await updateMeApi(payload)
      if (res?.code === 0 && res.data?.user) {
        updateUser(res.data.user)
        message.success('API Key 已保存')
      }
    } catch {
      // ignore
    } finally {
      setSavingKeys(false)
    }
  }

  const handleLogout = () => {
    Modal.confirm({
      title: '确认退出登录？',
      content: '退出后将返回登录页面。',
      okText: '退出',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        await logout()
        resetProjects([])
        resetUserStore()
        navigate('/login', { replace: true })
      },
    })
  }

  return (
    <PageContainer
      title="账号中心"
      breadcrumb={[{ title: '首页' }, { title: '账号中心' }]}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* 1. 基本信息 */}
        <Card
          title={<span><UserOutlined /> 基本信息</span>}
          className="rap-card-shadow"
          variant="borderless"
        >
          <Form
            form={profileForm}
            layout="vertical"
            onFinish={handleSaveProfile}
            style={{ maxWidth: 560 }}
          >
            <Form.Item label="邮箱（只读）">
              <Input prefix={<MailOutlined />} value={user.email} disabled />
            </Form.Item>
            <Form.Item
              name="username"
              label="用户名"
              rules={[{ required: true, message: '请输入用户名' }]}
            >
              <Input prefix={<UserOutlined />} placeholder="显示名称" />
            </Form.Item>
            <Form.Item
              name="discipline"
              label="学科方向"
              rules={[{ required: true, message: '请选择学科' }]}
            >
              <Select
                options={DISCIPLINES.map((d) => ({
                  value: d.key,
                  label: `${d.key} · ${d.label}`,
                }))}
              />
            </Form.Item>
            <Form.Item name="avatar" label="头像 URL">
              <Input placeholder="https://..." />
            </Form.Item>
            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                icon={<SaveOutlined />}
                loading={savingProfile}
              >
                保存基本信息
              </Button>
            </Form.Item>
          </Form>
          <Divider style={{ margin: '8px 0' }} />
          <Space>
            <Text type="secondary" style={{ fontSize: 12 }}>角色：</Text>
            <Tag color={user.role === 'admin' ? 'red' : 'blue'}>
              {user.role === 'admin' ? '管理员' : '普通用户'}
            </Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>
              注册时间：{new Date(user.createdAt).toLocaleString('zh-CN')}
            </Text>
          </Space>
        </Card>

        {/* 2. 修改密码 */}
        <Card
          title={<span><LockOutlined /> 修改密码</span>}
          className="rap-card-shadow"
          variant="borderless"
        >
          <Form
            form={passwordForm}
            layout="vertical"
            onFinish={handleChangePassword}
            style={{ maxWidth: 560 }}
          >
            <Form.Item
              name="oldPassword"
              label="旧密码"
              rules={[{ required: true, message: '请输入旧密码' }]}
            >
              <Input.Password placeholder="当前密码" />
            </Form.Item>
            <Form.Item
              name="newPassword"
              label="新密码"
              rules={[
                { required: true, message: '请输入新密码' },
                { min: 6, message: '新密码至少 6 位' },
              ]}
            >
              <Input.Password placeholder="至少 6 位" />
            </Form.Item>
            <Form.Item
              name="confirmPassword"
              label="确认新密码"
              dependencies={['newPassword']}
              rules={[
                { required: true, message: '请确认新密码' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('newPassword') === value) {
                      return Promise.resolve()
                    }
                    return Promise.reject(new Error('两次输入的密码不一致'))
                  },
                }),
              ]}
            >
              <Input.Password placeholder="再次输入新密码" />
            </Form.Item>
            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                icon={<CheckCircleOutlined />}
                loading={savingPassword}
              >
                提交修改
              </Button>
            </Form.Item>
          </Form>
        </Card>

        {/* 3. API Key 管理 */}
        <Card
          title={<span><KeyOutlined /> API Key 管理</span>}
          className="rap-card-shadow"
          variant="borderless"
        >
          <Paragraph type="secondary" style={{ fontSize: 13 }}>
            各 LLM 供应商的 API Key。后端返回的 Key 已掩码处理；如需更新，请输入完整 Key 后保存。
            留空则不修改该字段。
          </Paragraph>
          <Form
            form={apiKeyForm}
            layout="vertical"
            onFinish={handleSaveApiKeys}
            style={{ maxWidth: 560 }}
          >
            <Form.Item
              name="deepseek"
              label="DeepSeek API Key"
              tooltip="用于 DeepSeek-R1 / V3 等模型"
            >
              <Input.Password
                placeholder="sk-..."
                visibilityToggle
              />
            </Form.Item>
            <Form.Item
              name="kimi"
              label="Kimi (Moonshot) API Key"
              tooltip="用于 Kimi-K2 等长上下文模型"
            >
              <Input.Password
                placeholder="sk-..."
                visibilityToggle
              />
            </Form.Item>
            <Form.Item
              name="qwen"
              label="通义千问 (Qwen) API Key"
              tooltip="用于 qwen-max / qwen-turbo 等模型"
            >
              <Input.Password
                placeholder="sk-..."
                visibilityToggle
              />
            </Form.Item>
            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                icon={<SaveOutlined />}
                loading={savingKeys}
              >
                保存 API Key
              </Button>
            </Form.Item>
          </Form>
        </Card>

        {/* 4. 危险操作 */}
        <Card
          title="危险操作"
          className="rap-card-shadow"
          variant="borderless"
          styles={{ body: { padding: 16 } }}
        >
          <Space>
            <Button
              danger
              type="dashed"
              icon={<LogoutOutlined />}
              onClick={handleLogout}
            >
              退出登录
            </Button>
            <Text type="secondary" style={{ fontSize: 12 }}>
              退出后将清除本地登录状态并返回登录页
            </Text>
          </Space>
        </Card>
      </Space>
    </PageContainer>
  )
}

export default Profile
