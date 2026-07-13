import { describe, it, expect, beforeEach, vi } from 'vitest';

// mock 数据库访问
vi.mock('../db/pool', () => ({
  query: vi.fn(),
  execute: vi.fn(),
}));

// mock WebSocket 服务：projectService 在 changeStage / broadcastPipelineUpdate 中动态 import
vi.mock('./wsService', () => ({
  wsService: {
    broadcast: vi.fn(),
    init: vi.fn(),
    sendToClient: vi.fn(),
    getClientCount: vi.fn(),
    close: vi.fn(),
  },
}));

import { query } from '../db/pool';
import { wsService } from './wsService';
import { projectService } from './projectService';
import { ApiError, STAGE_ORDER } from '../types';
import type { Project, ProjectRow, ProjectArtifacts } from '../types';

// 项目服务测试
describe('services/projectService', () => {
  const mockQuery = query as unknown as ReturnType<typeof vi.fn>;
  const mockBroadcast = wsService.broadcast as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  // 构造一个数据库行（snake_case）
  function makeRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
    return {
      id: 'p1',
      owner_id: 'u1',
      name: '测试项目',
      discipline: '计算机',
      question: '问题',
      description: '描述',
      stage: 'literature',
      status: 'draft',
      mode: 'auto',
      template: 'markdown',
      pipeline_status: 'idle',
      agent_id: null,
      current_step: null,
      artifacts: JSON.stringify({}),
      versions: JSON.stringify([]),
      hil_queue: JSON.stringify([]),
      created_at: new Date('2024-01-01T00:00:00Z'),
      updated_at: new Date('2024-01-01T00:00:00Z'),
      ...overrides,
    };
  }

  // ─────────────── 纯函数 ───────────────

  describe('toPipelineSummary', () => {
    it('构造正确摘要：hasDraft / sectionKeys / figureCount', () => {
      // 验证摘要字段映射
      const artifacts: ProjectArtifacts = {
        draftText: '初稿文本',
        paperSections: { abstract: 'a', introduction: 'b' },
        figures: [{ title: '图1' }, { title: '图2' }, { title: '图3' }],
      };
      const project = {
        id: 'p1',
        ownerId: 'u1',
        name: 'n',
        discipline: 'd',
        question: 'q',
        description: '',
        stage: 'literature',
        status: 'running',
        createdAt: '',
        updatedAt: '',
        versions: [],
        hilQueue: [],
        mode: 'auto',
        template: 'markdown',
        pipelineStatus: 'running',
        currentStep: 'literature',
        agentId: 'a1',
        artifacts,
      } as unknown as Project;

      const summary = projectService.toPipelineSummary(project);
      expect(summary.projectId).toBe('p1');
      expect(summary.hasDraft).toBe(true);
      expect(summary.sectionKeys).toEqual(['abstract', 'introduction']);
      expect(summary.figureCount).toBe(3);
      expect(summary.mode).toBe('auto');
      expect(summary.template).toBe('markdown');
      expect(summary.agentId).toBe('a1');
      expect(summary.currentStep).toBe('literature');
      expect(summary.step).toBe('literature');
    });

    it('draftText 为空字符串时 hasDraft=false', () => {
      // 验证空 draftText 不算有初稿
      const project = {
        id: 'p1',
        ownerId: 'u1',
        name: 'n',
        discipline: 'd',
        question: 'q',
        description: '',
        stage: 'literature',
        status: 'draft',
        createdAt: '',
        updatedAt: '',
        versions: [],
        hilQueue: [],
        mode: 'auto',
        template: 'markdown',
        pipelineStatus: 'idle',
        artifacts: { draftText: '' },
      } as unknown as Project;
      const summary = projectService.toPipelineSummary(project);
      expect(summary.hasDraft).toBe(false);
    });

    it('artifacts 为空对象时 figureCount=0 / sectionKeys=[]', () => {
      // 空产物场景
      const project = {
        id: 'p1',
        ownerId: 'u1',
        name: 'n',
        discipline: 'd',
        question: 'q',
        description: '',
        stage: 'literature',
        status: 'draft',
        createdAt: '',
        updatedAt: '',
        versions: [],
        hilQueue: [],
        mode: 'auto',
        template: 'markdown',
        pipelineStatus: 'idle',
        artifacts: {},
      } as unknown as Project;
      const summary = projectService.toPipelineSummary(project);
      expect(summary.figureCount).toBe(0);
      expect(summary.sectionKeys).toEqual([]);
      expect(summary.hasDraft).toBe(false);
    });

    it('figures 不是数组时 figureCount=0', () => {
      // 异常输入兜底
      const project = {
        id: 'p1',
        ownerId: 'u1',
        name: 'n',
        discipline: 'd',
        question: 'q',
        description: '',
        stage: 'literature',
        status: 'draft',
        createdAt: '',
        updatedAt: '',
        versions: [],
        hilQueue: [],
        mode: 'auto',
        template: 'markdown',
        pipelineStatus: 'idle',
        artifacts: { figures: { not: 'array' } as never },
      } as unknown as Project;
      const summary = projectService.toPipelineSummary(project);
      expect(summary.figureCount).toBe(0);
    });
  });

  // ─────────────── 业务方法 ───────────────

  describe('list', () => {
    it('返回项目列表', async () => {
      // 验证 list 调用并返回 Project[]
      mockQuery.mockResolvedValueOnce([makeRow({ id: 'p1' }), makeRow({ id: 'p2' })]);
      const list = await projectService.list();
      expect(list).toHaveLength(2);
      expect(list[0].id).toBe('p1');
      expect(list[1].id).toBe('p2');
    });

    it('空表返回空数组', async () => {
      mockQuery.mockResolvedValueOnce([]);
      const list = await projectService.list();
      expect(list).toEqual([]);
    });
  });

  describe('listByOwner', () => {
    it('按 ownerId 过滤', async () => {
      mockQuery.mockResolvedValueOnce([makeRow({ id: 'p1', owner_id: 'u1' })]);
      const list = await projectService.listByOwner('u1');
      expect(list).toHaveLength(1);
      // 验证 SQL 参数包含 ownerId
      const args = mockQuery.mock.calls[0];
      expect(args[1]).toEqual(['u1']);
    });
  });

  describe('getById', () => {
    it('不存在抛 ApiError(404)', async () => {
      // 仅设置一次 mock，避免污染后续测试
      mockQuery.mockResolvedValueOnce([]);
      try {
        await projectService.getById('missing');
        expect.fail('应抛出 ApiError(404)');
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError);
        expect((e as ApiError).statusCode).toBe(404);
      }
    });

    it('非 owner 非 admin 抛 403', async () => {
      mockQuery.mockResolvedValueOnce([makeRow({ id: 'p1', owner_id: 'u1' })]);
      await expect(
        projectService.getById('p1', { id: 'other', role: 'user' }),
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('owner 自身可访问', async () => {
      mockQuery.mockResolvedValueOnce([makeRow({ id: 'p1', owner_id: 'u1' })]);
      const project = await projectService.getById('p1', { id: 'u1', role: 'user' });
      expect(project.id).toBe('p1');
    });

    it('admin 可访问他人项目', async () => {
      mockQuery.mockResolvedValueOnce([makeRow({ id: 'p1', owner_id: 'u1' })]);
      const project = await projectService.getById('p1', { id: 'admin1', role: 'admin' });
      expect(project.id).toBe('p1');
    });

    it('不传 requester 时不做权限校验', async () => {
      mockQuery.mockResolvedValueOnce([makeRow({ id: 'p1', owner_id: 'u1' })]);
      const project = await projectService.getById('p1');
      expect(project.id).toBe('p1');
    });
  });

  describe('create', () => {
    it('生成 UUID，初始 stage=literature，插入首版本快照', async () => {
      // INSERT 调用 + getById 调用
      mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]); // INSERT
      mockQuery.mockResolvedValueOnce([makeRow({ id: 'new-id', stage: 'literature' })]); // getById

      const project = await projectService.create(
        {
          name: '新项目',
          discipline: '物理',
          question: '问什么',
          description: '描述',
        },
        'owner-1',
      );

      expect(project.id).toBe('new-id');
      expect(project.stage).toBe('literature');

      // 验证 INSERT 调用参数：stage 应为 'literature'，versions 应是包含首版本快照的数组
      const insertCall = mockQuery.mock.calls[0];
      const params = insertCall[1] as unknown[];
      // params 顺序：id, owner_id, name, discipline, question, description, stage, status, mode, template, pipeline_status, artifacts, versions, hil_queue, created_at, updated_at
      expect(params[6]).toBe('literature'); // stage
      expect(params[7]).toBe('draft'); // status
      expect(params[10]).toBe('idle'); // pipeline_status
      const versionsParam = JSON.parse(params[12] as string);
      expect(versionsParam).toHaveLength(1);
      expect(versionsParam[0].version).toBe(1);
      expect(versionsParam[0].stage).toBe('literature');
      expect(versionsParam[0].note).toBe('项目创建');
      expect(versionsParam[0].snapshot).toMatchObject({
        name: '新项目',
        discipline: '物理',
        question: '问什么',
        description: '描述',
      });
    });

    it('mode=manual 时透传 manual，否则默认 auto', async () => {
      mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockQuery.mockResolvedValueOnce([makeRow({ mode: 'manual' })]);
      await projectService.create(
        { name: 'n', discipline: 'd', question: 'q', mode: 'manual' },
        'u1',
      );
      const insertCall = mockQuery.mock.calls[0];
      const params = insertCall[1] as unknown[];
      expect(params[8]).toBe('manual'); // mode
    });

    it('template 缺省为 markdown', async () => {
      mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockQuery.mockResolvedValueOnce([makeRow({ template: 'markdown' })]);
      await projectService.create({ name: 'n', discipline: 'd', question: 'q' }, 'u1');
      const insertCall = mockQuery.mock.calls[0];
      const params = insertCall[1] as unknown[];
      expect(params[9]).toBe('markdown'); // template
    });
  });

  describe('update', () => {
    it('部分字段更新', async () => {
      // getById → UPDATE → getById（再次）
      mockQuery.mockResolvedValueOnce([makeRow({ name: 'old', stage: 'literature' })]);
      mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockQuery.mockResolvedValueOnce([makeRow({ name: 'new' })]);
      const project = await projectService.update('p1', { name: 'new' });
      expect(project.name).toBe('new');
      // 验证 UPDATE 中 name 用新值
      const updateCall = mockQuery.mock.calls[1];
      const params = updateCall[1] as unknown[];
      expect(params[0]).toBe('new');
      expect(params[1]).toBe('计算机'); // discipline 保留原值
    });

    it('未传 mode/template 时保留原值', async () => {
      mockQuery.mockResolvedValueOnce([makeRow({ mode: 'manual', template: 'ctex' })]);
      mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockQuery.mockResolvedValueOnce([makeRow({ mode: 'manual', template: 'ctex' })]);
      await projectService.update('p1', { name: 'x' });
      const updateCall = mockQuery.mock.calls[1];
      const params = updateCall[1] as unknown[];
      expect(params[6]).toBe('manual'); // mode
      expect(params[7]).toBe('ctex'); // template
    });

    it('更新后广播 pipeline_update 事件', async () => {
      // 验证 broadcastPipelineUpdate 被调用
      mockQuery.mockResolvedValueOnce([makeRow()]);
      mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockQuery.mockResolvedValueOnce([makeRow()]);
      await projectService.update('p1', { name: 'x' });
      // broadcast 是动态 import 后调用的，需要等微任务
      await new Promise((r) => setImmediate(r));
      expect(mockBroadcast).toHaveBeenCalled();
    });
  });

  describe('advance', () => {
    it('推进到下一阶段', async () => {
      // getById(literature) → UPDATE → getById
      mockQuery.mockResolvedValueOnce([makeRow({ stage: 'literature' })]);
      mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockQuery.mockResolvedValueOnce([makeRow({ stage: 'design' })]);
      const project = await projectService.advance('p1');
      expect(project.stage).toBe('design');
    });

    it('已在最后阶段抛 400', async () => {
      const lastStage = STAGE_ORDER[STAGE_ORDER.length - 1];
      mockQuery.mockResolvedValueOnce([makeRow({ stage: lastStage })]);
      await expect(projectService.advance('p1')).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it('推进时记录版本快照', async () => {
      mockQuery.mockResolvedValueOnce([
        makeRow({ stage: 'literature', versions: JSON.stringify([{ version: 1 }]) }),
      ]);
      mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockQuery.mockResolvedValueOnce([makeRow({ stage: 'design' })]);
      await projectService.advance('p1');
      const updateCall = mockQuery.mock.calls[1];
      const params = updateCall[1] as unknown[];
      const versions = JSON.parse(params[2] as string);
      expect(versions).toHaveLength(2);
      expect(versions[1].version).toBe(2);
      expect(versions[1].stage).toBe('design');
    });
  });

  describe('rollback', () => {
    it('按版本回滚；找不到抛 400', async () => {
      mockQuery.mockResolvedValueOnce([
        makeRow({ versions: JSON.stringify([{ version: 1, stage: 'literature' }]) }),
      ]);
      await expect(projectService.rollback('p1', { version: 999 })).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it('按版本回滚成功时恢复快照内容', async () => {
      const versions = [
        {
          version: 1,
          stage: 'literature',
          timestamp: '2024-01-01T00:00:00.000Z',
          note: '项目创建',
          snapshot: { name: '原始名', discipline: '原始学科', question: '原问题', description: '原描述' },
        },
      ];
      mockQuery.mockResolvedValueOnce([makeRow({ versions: JSON.stringify(versions), name: '现名' })]);
      mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockQuery.mockResolvedValueOnce([makeRow({ name: '原始名' })]);
      const project = await projectService.rollback('p1', { version: 1 });
      expect(project.name).toBe('原始名');
      // 验证 UPDATE SQL 中 name 字段使用快照值
      const updateCall = mockQuery.mock.calls[1];
      const params = updateCall[1] as unknown[];
      // changeStage 的 SQL：stage, status, versions, updated_at, id
      // 但是 changeStage 不更新 name/discipline/question/description
      // 只更新 stage / status / versions
      expect(params[0]).toBe('literature'); // 恢复到版本 1 的 stage
    });

    it('按阶段回滚', async () => {
      mockQuery.mockResolvedValueOnce([makeRow({ stage: 'experiment' })]);
      mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockQuery.mockResolvedValueOnce([makeRow({ stage: 'literature' })]);
      const project = await projectService.rollback('p1', { stage: 'literature' });
      expect(project.stage).toBe('literature');
      const updateCall = mockQuery.mock.calls[1];
      const params = updateCall[1] as unknown[];
      expect(params[0]).toBe('literature');
    });

    it('默认回退上一阶段', async () => {
      // 当前 experiment → 回退到 design
      mockQuery.mockResolvedValueOnce([makeRow({ stage: 'experiment' })]);
      mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockQuery.mockResolvedValueOnce([makeRow({ stage: 'design' })]);
      const project = await projectService.rollback('p1');
      expect(project.stage).toBe('design');
      const updateCall = mockQuery.mock.calls[1];
      const params = updateCall[1] as unknown[];
      expect(params[0]).toBe('design');
    });

    it('已在初始阶段抛 400', async () => {
      mockQuery.mockResolvedValueOnce([makeRow({ stage: 'literature' })]);
      await expect(projectService.rollback('p1')).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  describe('setMode', () => {
    it('切换 mode 并广播', async () => {
      mockQuery.mockResolvedValueOnce([makeRow({ mode: 'auto' })]);
      mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockQuery.mockResolvedValueOnce([makeRow({ mode: 'manual' })]);
      const project = await projectService.setMode('p1', 'manual');
      expect(project.mode).toBe('manual');
      const updateCall = mockQuery.mock.calls[1];
      const params = updateCall[1] as unknown[];
      expect(params[0]).toBe('manual');
      await new Promise((r) => setImmediate(r));
      expect(mockBroadcast).toHaveBeenCalled();
    });
  });

  describe('setTemplate', () => {
    it('切换 template 并广播', async () => {
      mockQuery.mockResolvedValueOnce([makeRow({ template: 'markdown' })]);
      mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockQuery.mockResolvedValueOnce([makeRow({ template: 'ctex' })]);
      const project = await projectService.setTemplate('p1', 'ctex');
      expect(project.template).toBe('ctex');
      const updateCall = mockQuery.mock.calls[1];
      const params = updateCall[1] as unknown[];
      expect(params[0]).toBe('ctex');
    });
  });

  describe('attachAgent', () => {
    it('绑定 agent_id 并广播', async () => {
      mockQuery.mockResolvedValueOnce([makeRow({ agent_id: null })]);
      mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockQuery.mockResolvedValueOnce([makeRow({ agent_id: 'agent-1' })]);
      const project = await projectService.attachAgent('p1', 'agent-1');
      expect(project.agentId).toBe('agent-1');
      const updateCall = mockQuery.mock.calls[1];
      const params = updateCall[1] as unknown[];
      expect(params[0]).toBe('agent-1');
    });
  });

  describe('remove', () => {
    it('不存在抛 404', async () => {
      mockQuery.mockResolvedValueOnce([]);
      await expect(projectService.remove('missing')).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('存在时执行 DELETE', async () => {
      mockQuery.mockResolvedValueOnce([makeRow()]);
      mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);
      await projectService.remove('p1');
      const deleteCall = mockQuery.mock.calls[1];
      expect(deleteCall[0]).toContain('DELETE');
    });
  });

  describe('setArtifacts', () => {
    it('合并设置流水线产物', async () => {
      mockQuery.mockResolvedValueOnce([
        makeRow({ artifacts: JSON.stringify({ draftText: '旧初稿' }) }),
      ]);
      mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockQuery.mockResolvedValueOnce([
        makeRow({ artifacts: JSON.stringify({ draftText: '旧初稿', discussion: '新讨论' }) }),
      ]);
      const project = await projectService.setArtifacts('p1', { discussion: '新讨论' });
      const updateCall = mockQuery.mock.calls[1];
      const params = updateCall[1] as unknown[];
      const merged = JSON.parse(params[0] as string);
      expect(merged).toEqual({ draftText: '旧初稿', discussion: '新讨论' });
      expect(project.id).toBe('p1');
    });
  });
});
