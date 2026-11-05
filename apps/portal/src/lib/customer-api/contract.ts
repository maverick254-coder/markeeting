import { z } from "zod";

/**
 * PROPOSED customer API contract — NOT YET VERIFIED against the Control Center.
 *
 * None of these endpoints exist today (Admin-panel origin/main 59a34dc). They are the
 * integration boundary the portal is built against, documented for the backend team in
 * docs/portal/backend-integration-boundary.md. Until PORTAL_CUSTOMER_API_URL is set the
 * portal calls nothing and reports licence status as unavailable.
 *
 * Authentication: `Authorization: Bearer <access token>` issued by the shared Keycloak realm
 * to the portal client. The backend identifies the customer from the token's `sub` and must
 * never accept an account identifier from the request.
 *
 *   GET  /v1/api/customer/me      -> customerProfileSchema
 *   POST /v1/api/customer/trial   -> trialProvisioningSchema   (not called by the portal yet)
 *
 * Every response is validated here. The portal displays licence state only as the backend
 * reported it and never derives, extends or caches entitlement decisions of its own.
 */

export const LICENCE_STATUSES = ["none", "trial", "active", "expired", "suspended"] as const;

export const customerProfileSchema = z.object({
  subject: z.string().min(1),
  email: z.string().email(),
  emailVerified: z.boolean(),
  displayName: z.string().nullable(),
  organisation: z
    .object({
      id: z.string().min(1),
      name: z.string().min(1),
      role: z.enum(["owner", "admin", "member"]),
    })
    .nullable(),
  licence: z.object({
    status: z.enum(LICENCE_STATUSES),
    /** Control Center licence type codes (LicenceTypes.cs). */
    licenceTypeCode: z.enum(["document", "document_media"]).nullable(),
    entitlements: z.array(z.enum(["Document", "Image", "Audio", "Video"])),
    termEndsAt: z.string().datetime({ offset: true }).nullable(),
    isTrial: z.boolean(),
  }),
  devices: z.object({ used: z.number().int().min(0), allowed: z.number().int().min(0) }).nullable(),
});

export const trialProvisioningSchema = z.object({
  status: z.enum(["provisioned", "pending", "existing"]),
  tenantId: z.string().nullable(),
  licenceTypeCode: z.enum(["document", "document_media"]).nullable(),
  startsAt: z.string().datetime({ offset: true }).nullable(),
  endsAt: z.string().datetime({ offset: true }).nullable(),
});

/** Error body the backend is asked to return with every 4xx/5xx. */
export const customerApiErrorSchema = z.object({
  error: z.string().min(1),
  message: z.string().optional(),
});

export type CustomerProfile = z.infer<typeof customerProfileSchema>;
export type TrialProvisioning = z.infer<typeof trialProvisioningSchema>;
