import { describe, it, expect } from 'vitest'
import {
  STAGES,
  HIL_STAGES,
  DRAFT_TEMPLATES,
  DISCIPLINES,
  PROJECT_STATUS_MAP,
  EXPERIMENT_STATUS_MAP,
  HIL_STATUS_MAP,
  getStage,
  getStageIndex,
} from './index'

// 常量与纯函数测试：覆盖阶段定义、映射表完整性、getStage/getStageIndex 兜底逻辑
describe('constants/index', () => {
  describe('STAGES', () => {
    it('长度为 8，首末阶段分别为 literature / submit', () => {
      expect(STAGES).toHaveLength(8)
      expect(STAGES[0].key).toBe('literature')
      expect(STAGES[STAGES.length - 1].key).toBe('submit')
    })

    it('每个阶段都包含 key/label/description/color 四个字段', () => {
      STAGES.forEach((s) => {
        expect(typeof s.key).toBe('string')
        expect(typeof s.label).toBe('string')
        expect(typeof s.description).toBe('string')
        expect(typeof s.color).toBe('string')
      })
    })

    it('阶段 key 唯一', () => {
      const keys = STAGES.map((s) => s.key)
      expect(new Set(keys).size).toBe(keys.length)
    })
  })

  describe('getStage', () => {
    it('根据 key 返回正确阶段对象', () => {
      const stage = getStage('literature')
      expect(stage.key).toBe('literature')
      expect(stage.label).toBe('文献')
    })

    it('未知 key 返回兜底默认值，label 等于 key', () => {
      const stage = getStage('unknown-stage')
      expect(stage.key).toBe('unknown-stage')
      expect(stage.label).toBe('unknown-stage')
      expect(stage.description).toBe('')
    })

    it('空字符串返回 STAGES[0]', () => {
      expect(getStage('')).toEqual(STAGES[0])
    })

    it('undefined 返回 STAGES[0]', () => {
      expect(getStage(undefined as any)).toEqual(STAGES[0])
    })

    it('null 返回 STAGES[0]', () => {
      expect(getStage(null as any)).toEqual(STAGES[0])
    })
  })

  describe('getStageIndex', () => {
    it('literature 索引为 0', () => {
      expect(getStageIndex('literature')).toBe(0)
    })

    it('submit 索引为 7', () => {
      expect(getStageIndex('submit')).toBe(7)
    })

    it('未知 key 返回 0', () => {
      expect(getStageIndex('unknown')).toBe(0)
    })

    it('空值返回 0', () => {
      expect(getStageIndex(undefined as any)).toBe(0)
      expect(getStageIndex('')).toBe(0)
      expect(getStageIndex(null as any)).toBe(0)
    })
  })

  describe('HIL_STAGES', () => {
    it('长度为 4', () => {
      expect(HIL_STAGES).toHaveLength(4)
    })

    it('包含 design/experiment/discuss/figure 四个 key', () => {
      const keys = HIL_STAGES.map((s) => s.key)
      expect(keys).toEqual(['design', 'experiment', 'discuss', 'figure'])
    })

    it('每项包含 label/reason/description/afterStage', () => {
      HIL_STAGES.forEach((s) => {
        expect(typeof s.label).toBe('string')
        expect(typeof s.reason).toBe('string')
        expect(typeof s.description).toBe('string')
        expect(typeof s.afterStage).toBe('string')
      })
    })
  })

  describe('DRAFT_TEMPLATES', () => {
    it('包含 markdown/ctex/ieee/journal 四种模板', () => {
      const keys = DRAFT_TEMPLATES.map((t) => t.key)
      expect(keys).toEqual(
        expect.arrayContaining(['markdown', 'ctex', 'ieee', 'journal']),
      )
      expect(keys).toHaveLength(4)
    })

    it('每项包含 ext 与 description', () => {
      DRAFT_TEMPLATES.forEach((t) => {
        expect(typeof t.ext).toBe('string')
        expect(typeof t.description).toBe('string')
        expect(t.ext.length).toBeGreaterThan(0)
      })
    })
  })

  describe('DISCIPLINES', () => {
    it('非空且每项字段完整', () => {
      expect(DISCIPLINES.length).toBeGreaterThan(0)
      DISCIPLINES.forEach((d) => {
        expect(typeof d.key).toBe('string')
        expect(typeof d.label).toBe('string')
        expect(typeof d.desc).toBe('string')
      })
    })
  })

  describe('PROJECT_STATUS_MAP', () => {
    it('包含核心状态 key', () => {
      const keys = Object.keys(PROJECT_STATUS_MAP)
      expect(keys).toEqual(
        expect.arrayContaining([
          'running',
          'paused',
          'idle',
          'error',
          'done',
          'draft',
          'completed',
          'archived',
        ]),
      )
    })

    it('每个状态包含 label 与 color', () => {
      Object.values(PROJECT_STATUS_MAP).forEach((v) => {
        expect(typeof v.label).toBe('string')
        expect(typeof v.color).toBe('string')
      })
    })
  })

  describe('EXPERIMENT_STATUS_MAP', () => {
    it('包含核心状态 key', () => {
      const keys = Object.keys(EXPERIMENT_STATUS_MAP)
      expect(keys).toEqual(
        expect.arrayContaining([
          'running',
          'queued',
          'completed',
          'failed',
          'killed',
        ]),
      )
    })
  })

  describe('HIL_STATUS_MAP', () => {
    it('包含核心状态 key', () => {
      const keys = Object.keys(HIL_STATUS_MAP)
      expect(keys).toEqual(
        expect.arrayContaining([
          'pending',
          'approved',
          'edited',
          'rolled_back',
          'aborted',
        ]),
      )
    })
  })
})
