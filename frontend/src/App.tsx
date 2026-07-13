import React, { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import MainLayout from '@/layouts/MainLayout'
import Dashboard from '@/pages/Dashboard'
import Workbench from '@/pages/Workbench'
import HILReview from '@/pages/HILReview'
import Literature from '@/pages/Literature'
import Experiment from '@/pages/Experiment'
import PaperEditor from '@/pages/PaperEditor'
import Version from '@/pages/Version'
import Config from '@/pages/Config'
import Profile from '@/pages/Profile'
import ProjectSettings from '@/pages/ProjectSettings'
import Login from '@/pages/Login'
import Register from '@/pages/Register'
import DraftPreview from '@/pages/DraftPreview'
import RequireAuth from '@/components/RequireAuth'
import { useAuthStore } from '@/store/authStore'
import { wsClient } from '@/services/ws'
import { applyPipelineUpdate, usePipelineStore } from '@/store/pipelineStore'
import type { StageKey, PipelineStatus } from '@/types'

const App: React.FC = () => {
  const initialize = useAuthStore((s) => s.initialize)
  const token = useAuthStore((s) => s.token)

  // 启动时恢复会话
  useEffect(() => {
    void initialize()
  }, [initialize])

  // 登录后建立 WS 连接，订阅 pipeline_update / hil_required
  useEffect(() => {
    if (!token) return
    wsClient.connect()

    const offUpdate = wsClient.on('pipeline_update', (raw) => {
      const data = raw as {
        status?: PipelineStatus
        // 兼容后端旧字段 step 和新字段 currentStep
        currentStep?: StageKey
        step?: StageKey
        agentId?: string
        artifacts?: Record<string, unknown>
        draftText?: string
      }
      applyPipelineUpdate({
        status: data.status,
        currentStep: data.currentStep ?? (data.step as StageKey | undefined) ?? null,
        agentId: data.agentId ?? null,
        artifacts: (data.artifacts ?? {}) as never,
        draftText: data.draftText ?? usePipelineStore.getState().draftText,
      })
    })

    const offHil = wsClient.on('hil_required', (raw) => {
      const data = raw as {
        stage: StageKey
        message: string
        agentProposal?: string
        title?: string
        experiment_design?: Record<string, unknown>
      }
      if (!data?.stage) return
      applyPipelineUpdate({
        hilPending: {
          stage: data.stage,
          message: data.message ?? '需要人工审阅',
          agentProposal: data.agentProposal ?? '',
          title: data.title,
          experimentDesign: data.experiment_design,
        },
      })
    })

    return () => {
      offUpdate()
      offHil()
    }
  }, [token])

  return (
    <Routes>
      {/* 公开路由 */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* 受保护路由 */}
      <Route
        path="/"
        element={
          <RequireAuth>
            <MainLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="workbench" element={<Workbench />} />
        <Route path="project-settings" element={<ProjectSettings />} />
        <Route path="project-settings/:id" element={<ProjectSettings />} />
        <Route path="hil" element={<HILReview />} />
        <Route path="literature" element={<Literature />} />
        <Route path="experiment" element={<Experiment />} />
        <Route path="paper" element={<PaperEditor />} />
        <Route path="version" element={<Version />} />
        <Route path="config" element={<Config />} />
        <Route path="profile" element={<Profile />} />
        <Route path="draft" element={<DraftPreview />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
