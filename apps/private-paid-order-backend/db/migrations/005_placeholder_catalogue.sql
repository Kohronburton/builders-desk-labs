BEGIN;

-- Synthetic records exist only so staging/local integration has a concrete contract.
-- `public_metadata.placeholder=true` makes them impossible to treat as approved production catalogue data.
INSERT INTO app.catalogue_items(kind, code, label, active, public_metadata, version) VALUES
  ('package', 'PACKAGE_STANDARD', 'Synthetic Standard Package', true, '{"placeholder":true,"maxPeople":2,"productBranches":["NO_PRODUCT"],"templateCodes":["SCENE_MODERN_01"],"styleCodes":["STYLE_CONVERSATIONAL"],"voiceCodes":["VOICE_CUSTOMER_SUPPLIED"]}'::jsonb, 1),
  ('template', 'SCENE_MODERN_01', 'Synthetic Modern Scene', true, '{"placeholder":true}'::jsonb, 1),
  ('style', 'STYLE_CONVERSATIONAL', 'Synthetic Conversational Style', true, '{"placeholder":true}'::jsonb, 1),
  ('voice', 'VOICE_CUSTOMER_SUPPLIED', 'Synthetic Customer-Supplied Voice', true, '{"placeholder":true}'::jsonb, 1),
  ('product_branch', 'NO_PRODUCT', 'Synthetic No-Product Branch', true, '{"placeholder":true}'::jsonb, 1)
ON CONFLICT (kind, code, version) DO NOTHING;

COMMIT;
