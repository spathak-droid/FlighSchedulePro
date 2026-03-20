-- Enable RLS on all tenant-scoped tables
ALTER TABLE scheduling_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_state ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policies
CREATE POLICY tenant_isolation ON scheduling_policies
  USING (operator_id = current_setting('app.current_tenant')::integer);

CREATE POLICY tenant_isolation ON suggestions
  USING (operator_id = current_setting('app.current_tenant')::integer);

CREATE POLICY tenant_isolation ON prospects
  USING (operator_id = current_setting('app.current_tenant')::integer);

CREATE POLICY tenant_isolation ON notification_records
  USING (operator_id = current_setting('app.current_tenant')::integer);

CREATE POLICY tenant_isolation ON notification_templates
  USING (operator_id = current_setting('app.current_tenant')::integer);

CREATE POLICY tenant_isolation ON sync_state
  USING (operator_id = current_setting('app.current_tenant')::integer);

-- Audit events: tenant isolation + append-only (SELECT + INSERT only)
CREATE POLICY tenant_isolation ON audit_events
  FOR SELECT USING (operator_id = current_setting('app.current_tenant')::integer);

CREATE POLICY audit_insert ON audit_events
  FOR INSERT WITH CHECK (operator_id = current_setting('app.current_tenant')::integer);

-- Prevent updates and deletes on audit events
-- (No UPDATE or DELETE policies = denied by default when RLS is enabled)

-- Foreign key constraints (defined here instead of Drizzle schema for drizzle-kit CJS compatibility)
ALTER TABLE scheduling_policies ADD CONSTRAINT fk_scheduling_policies_operator FOREIGN KEY (operator_id) REFERENCES operators(id);
ALTER TABLE suggestions ADD CONSTRAINT fk_suggestions_operator FOREIGN KEY (operator_id) REFERENCES operators(id);
ALTER TABLE suggestions ADD CONSTRAINT fk_suggestions_prospect FOREIGN KEY (prospect_id) REFERENCES prospects(id);
ALTER TABLE prospects ADD CONSTRAINT fk_prospects_operator FOREIGN KEY (operator_id) REFERENCES operators(id);
ALTER TABLE notification_records ADD CONSTRAINT fk_notification_records_operator FOREIGN KEY (operator_id) REFERENCES operators(id);
ALTER TABLE notification_records ADD CONSTRAINT fk_notification_records_suggestion FOREIGN KEY (suggestion_id) REFERENCES suggestions(id);
ALTER TABLE notification_templates ADD CONSTRAINT fk_notification_templates_operator FOREIGN KEY (operator_id) REFERENCES operators(id);
ALTER TABLE sync_state ADD CONSTRAINT fk_sync_state_operator FOREIGN KEY (operator_id) REFERENCES operators(id);
