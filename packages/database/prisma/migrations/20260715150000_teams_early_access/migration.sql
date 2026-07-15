-- Widen the existing early-access product constraint so Teams pilot requests
-- can share the audited inbox without receiving Personal entitlements.
ALTER TABLE "EarlyAccessRequest"
  DROP CONSTRAINT "EarlyAccessRequest_product_check";

ALTER TABLE "EarlyAccessRequest"
  ADD CONSTRAINT "EarlyAccessRequest_product_check"
  CHECK ("product" IN ('PERSONAL_AI', 'PERSONAL_LOCAL', 'TEAMS'));
