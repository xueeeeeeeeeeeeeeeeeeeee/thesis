import React, { useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Layout,
  Menu,
  Select,
  Avatar,
  Badge,
  Tooltip,
  Typography,
  Dropdown,
  Space,
  Tag,
  Modal,
} from 'antd'
import type { MenuProps } from 'antd'
import {
  DashboardOutlined,
  ExperimentOutlined,
  AuditOutlined,
  BookOutlined,
  ThunderboltOutlined,
  FileTextOutlined,
  BranchesOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  RobotOutlined,
  BellOutlined,
  UserOutlined,
  LogoutOutlined,
  ProfileOutlined,
  ProjectOutlined,
} from '@ant-design/icons'
import { useProjectStore } from '@/store/projectStore'
import { useAuthStore } from '@/store/authStore'
import { useUserStore } from '@/store/userStore'
import { getStage } from '@/constants'

const { Sider, Header, Content } = Layout
const { Text } = Typography

// 侧边栏菜单配置
const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: <Link to="/">仪表盘</Link> },
  {
    key: '/workbench',
    icon: <ThunderboltOutlined />,
    label: <Link to="/workbench">项目工作台</Link>,
  },
  {
    key: '/project-settings',
    icon: <ProjectOutlined />,
    label: <Link to="/project-settings">项目设置</Link>,
  },
  {
    key: '/hil',
    icon: <AuditOutlined />,
    label: <Link to="/hil">人审中断点</Link>,
  },
  {
    key: '/literature',
    icon: <BookOutlined />,
    label: <Link to="/literature">文献库</Link>,
  },
  {
    key: '/experiment',
    icon: <ExperimentOutlined />,
    label: <Link to="/experiment">实验监控</Link>,
  },
  {
    key: '/paper',
    icon: <FileTextOutlined />,
    label: <Link to="/paper">论文编辑器</Link>,
  },
  {
    key: '/version',
    icon: <BranchesOutlined />,
    label: <Link to="/version">版本管理</Link>,
  },
  {
    key: '/config',
    icon: <SettingOutlined />,
    label: <Link to="/config">系统配置</Link>,
  },
  {
    key: '/profile',
    icon: <ProfileOutlined />,
    label: <Link to="/profile">账号中心</Link>,
  },
]

const MainLayout: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)
  const { currentProject, projects, selectProject, hilQueue, setProjects, fetchProjects, loading } =
    useProjectStore()
  const { user, logout } = useAuthStore()
  const resetUserStore = useUserStore((s) => s.reset)

  useEffect(() => {
    if (projects.length === 0 && !loading) {
      void fetchProjects()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects.length])

  const selectedKey =
    menuItems.find((m) => m.key !== '/' && location.pathname.startsWith(m.key))
      ?.key ?? '/'

  const currentStage = currentProject
    ? getStage(currentProject.stage ?? currentProject.currentStage)
    : null

  const username = user?.username ?? '研究员'
  const avatarLetter = username.slice(0, 1).toUpperCase()

  const handleLogout = () => {
    Modal.confirm({
      title: '确认退出登录？',
      content: '退出后将返回登录页面。',
      okText: '退出',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        await logout()
        setProjects([])
        resetUserStore()
        navigate('/login', { replace: true })
      },
    })
  }

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: '用户中心',
      onClick: () => navigate('/profile'),
    },
    {
      key: 'config',
      icon: <SettingOutlined />,
      label: '系统配置',
      onClick: () => navigate('/config'),
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      danger: true,
      onClick: handleLogout,
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={220}
        style={{
          background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
          boxShadow: '2px 0 8px rgba(15, 23, 42, 0.08)',
        }}
      >
        <div
          style={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? '0' : '0 18px',
            color: '#fff',
            gap: 10,
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <RobotOutlined style={{ fontSize: 22, color: '#60a5fa' }} />
          {!collapsed && (
            <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: 1 }}>
              RAP<span style={{ color: '#60a5fa' }}>·</span>科研自动化
            </span>
          )}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          style={{
            background: 'transparent',
            borderRight: 0,
            marginTop: 8,
          }}
        />
        {!collapsed && (
          <div
            style={{
              position: 'absolute',
              bottom: 16,
              left: 0,
              right: 0,
              textAlign: 'center',
              color: 'rgba(255,255,255,0.35)',
              fontSize: 11,
            }}
          >
            Research Auto-Pilot v0.1
          </div>
        )}
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #e2e8f0',
            boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              style={{ fontSize: 16, cursor: 'pointer', color: '#64748b' }}
              onClick={() => setCollapsed((c) => !c)}
            >
              {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            </span>
            <Text type="secondary" style={{ fontSize: 13 }}>
              当前项目：
            </Text>
            <Select
              value={currentProject?.id}
              style={{ width: 280 }}
              placeholder="请选择项目"
              onChange={(id) => {
                const p = projects.find((x) => x.id === id)
                if (p) selectProject(p)
              }}
              options={projects.map((p) => ({
                value: p.id,
                label: `${p.name} · ${p.discipline}`,
              }))}
            />
            {currentStage && (
              <Tooltip title={currentStage.description}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '2px 10px',
                    borderRadius: 12,
                    background: `${currentStage.color}1a`,
                    color: currentStage.color,
                    fontSize: 12,
                    fontWeight: 500,
                    border: `1px solid ${currentStage.color}33`,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: currentStage.color,
                    }}
                  />
                  阶段：{currentStage.label}
                </span>
              </Tooltip>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Badge count={hilQueue.length} size="small">
              <BellOutlined style={{ fontSize: 18, color: '#64748b' }} />
            </Badge>
            <Dropdown
              menu={{ items: userMenuItems }}
              trigger={['click']}
              placement="bottomRight"
            >
              <Space style={{ cursor: 'pointer' }}>
                <Avatar
                  style={{ backgroundColor: '#2563eb', verticalAlign: 'middle' }}
                  size="small"
                  src={user?.avatar || undefined}
                >
                  {avatarLetter}
                </Avatar>
                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                  <Text style={{ fontSize: 13 }}>{username}</Text>
                  <Tag
                    color={user?.role === 'admin' ? 'red' : 'blue'}
                    style={{ fontSize: 10, marginRight: 0, padding: '0 4px', lineHeight: '16px' }}
                  >
                    {user?.role === 'admin' ? '管理员' : '用户'}
                  </Tag>
                </div>
              </Space>
            </Dropdown>
          </div>
        </Header>
        <Content style={{ minHeight: 'calc(100vh - 56px)' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}

export default MainLayout
