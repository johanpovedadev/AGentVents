-- Esquema "social" del agente de redes. Vive en la misma base Neon que
-- lion-platform-api, pero en su propio esquema: el agente nunca toca las tablas
-- del CRM y el CRM solo lee estas. Toda tabla con datos de cliente lleva
-- tenant_id (el id del tenant en Lion Platform) — multi-tenant obligatorio.

CREATE SCHEMA IF NOT EXISTS social;

-- Cuentas que se siguen: las propias del tenant y las de su competencia.
CREATE TABLE IF NOT EXISTS social.account (
    id            BIGSERIAL PRIMARY KEY,
    tenant_id     BIGINT       NOT NULL,
    platform      VARCHAR(20)  NOT NULL CHECK (platform IN ('instagram', 'youtube', 'tiktok')),
    handle        VARCHAR(100) NOT NULL,
    external_id   VARCHAR(100),
    is_competitor BOOLEAN      NOT NULL DEFAULT FALSE,
    active        BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, platform, handle)
);
CREATE INDEX IF NOT EXISTS account_tenant_idx ON social.account (tenant_id) WHERE active;

-- Foto diaria de la cuenta. Las redes no dan histórico: este histórico es nuestro.
CREATE TABLE IF NOT EXISTS social.account_snapshot (
    account_id  BIGINT  NOT NULL REFERENCES social.account (id) ON DELETE CASCADE,
    day         DATE    NOT NULL,
    followers   BIGINT,
    media_count BIGINT,
    PRIMARY KEY (account_id, day)
);

-- Cada publicación o video.
CREATE TABLE IF NOT EXISTS social.media (
    id                BIGSERIAL PRIMARY KEY,
    account_id        BIGINT       NOT NULL REFERENCES social.account (id) ON DELETE CASCADE,
    platform_media_id VARCHAR(100) NOT NULL,
    media_type        VARCHAR(30),
    caption           TEXT,
    published_at      TIMESTAMPTZ,
    duration_s        INTEGER,
    permalink         TEXT,
    UNIQUE (account_id, platform_media_id)
);

-- Foto diaria de las métricas de cada publicación. NULL = la red no lo entrega
-- (por ejemplo alcance de un competidor); nunca se guarda 0 en su lugar.
CREATE TABLE IF NOT EXISTS social.media_snapshot (
    media_id     BIGINT  NOT NULL REFERENCES social.media (id) ON DELETE CASCADE,
    day          DATE    NOT NULL,
    views        BIGINT,
    likes        BIGINT,
    comments     BIGINT,
    shares       BIGINT,
    saves        BIGINT,
    reach        BIGINT,
    avg_watch_s  NUMERIC(10, 2),
    skip_rate    NUMERIC(6, 4),
    PRIMARY KEY (media_id, day)
);

-- Registro de cada corrida del recolector: qué se hizo, qué falló y por qué.
CREATE TABLE IF NOT EXISTS social.job_run (
    id          BIGSERIAL PRIMARY KEY,
    job         VARCHAR(40) NOT NULL,
    started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    status      VARCHAR(20) NOT NULL DEFAULT 'RUNNING',
    summary     JSONB
);
