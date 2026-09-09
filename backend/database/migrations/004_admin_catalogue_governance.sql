-- A catalogue editor can prepare product records without being able to publish
-- crop protection advice. Product and mapping approvals remain separate roles.
INSERT INTO roles(code, name, description)
VALUES ('catalog_editor', 'Catalogue Editor', 'Prepare product-master and crop-map changes for approval.')
ON CONFLICT (code) DO NOTHING;

CREATE INDEX IF NOT EXISTS inspection_images_storage_provider_idx
    ON inspection_images(storage_provider, retention_status, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS approval_requests_catalogue_idx
    ON approval_requests(entity_type, status, requested_at DESC);
