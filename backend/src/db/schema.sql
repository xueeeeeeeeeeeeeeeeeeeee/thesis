-- RAP 系统数据库 Schema（MySQL 8.0+）
-- 字符集 utf8mb4，支持 emoji / 中文

-- =========================================================
-- 用户表
-- =========================================================
CREATE TABLE IF NOT EXISTS `users` (
  `id`            VARCHAR(36)  NOT NULL,
  `email`         VARCHAR(255) NOT NULL,
  `username`      VARCHAR(100) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `avatar`        VARCHAR(500) NULL,
  `role`          VARCHAR(10)  NOT NULL DEFAULT 'user',
  `discipline`    VARCHAR(50)  NOT NULL DEFAULT '综合',
  `api_keys`      JSON         NULL,
  `created_at`    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================================
-- 项目表
--  - versions / hil_queue / artifacts 用 JSON 列存，保持接口与内存版一致
-- =========================================================
CREATE TABLE IF NOT EXISTS `projects` (
  `id`              VARCHAR(36)  NOT NULL,
  `owner_id`        VARCHAR(36)  NOT NULL,
  `name`            VARCHAR(255) NOT NULL,
  `discipline`      VARCHAR(50)  NOT NULL,
  `question`        TEXT         NOT NULL,
  `description`     TEXT         NULL,
  `stage`           VARCHAR(20)  NOT NULL DEFAULT 'literature',
  `status`          VARCHAR(20)  NOT NULL DEFAULT 'draft',
  `mode`            VARCHAR(10)  NOT NULL DEFAULT 'auto',
  `template`        VARCHAR(20)  NOT NULL DEFAULT 'markdown',
  `pipeline_status` VARCHAR(20)  NOT NULL DEFAULT 'idle',
  `agent_id`        VARCHAR(100) NULL,
  `current_step`    VARCHAR(50)  NULL,
  `artifacts`       JSON         NULL,
  `versions`        JSON         NULL,
  `hil_queue`       JSON         NULL,
  `created_at`      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_projects_owner` (`owner_id`),
  KEY `idx_projects_stage` (`stage`),
  KEY `idx_projects_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
