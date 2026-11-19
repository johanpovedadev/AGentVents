-- Mensajes directos de redes (Instagram Direct y Messenger de la página de Facebook).
-- Johan, 19 nov 2026: "necesitamos escuchar también los mensajes de redes".
-- Multi-tenant: cada mensaje lleva el tenant dueño de la cuenta conectada.
-- Idempotente: el id del mensaje en Meta es único por tenant y red, así que
-- reprocesar la misma conversación nunca duplica.

CREATE TABLE IF NOT EXISTS social.message (
    id                  BIGSERIAL PRIMARY KEY,
    tenant_id           BIGINT       NOT NULL,
    platform            VARCHAR(20)  NOT NULL CHECK (platform IN ('instagram', 'facebook')),
    conversation_id     VARCHAR(200) NOT NULL,
    platform_message_id VARCHAR(200) NOT NULL,
    contact_id          VARCHAR(100) NOT NULL,
    contact_name        VARCHAR(200),
    direction           VARCHAR(10)  NOT NULL CHECK (direction IN ('INBOUND', 'OUTBOUND')),
    body                TEXT,
    sent_at             TIMESTAMPTZ  NOT NULL,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, platform, platform_message_id)
);
CREATE INDEX IF NOT EXISTS message_conversation_idx ON social.message (tenant_id, platform, conversation_id, sent_at);
