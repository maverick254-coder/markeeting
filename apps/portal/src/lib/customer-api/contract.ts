import { z } from "zod";

/**
 * The customer portal API of the Control Center.
 *
 * VERIFIED in backend source: Admin-panel origin/main 7026a19 (6 Nov 2026),
 * src/SafeRedact.ControlCenter.Api/TrialApi.cs (PortalProfile, PortalLicence, PortalTrial,
 * PortalCredit) and Docs/TRIAL-INTEGRATION.md. Evidence and status:
 * docs/onboarding/verified-integration-contract.md in the marketing repository.
 *
 *   GET   {api}/portal/me     -> portalProfileSchema, or 404 { code: "account_not_found" }
 *   PATCH {api}/portal/me     { displayName }   (not called by the portal yet)
 *
 * Authentication: `Authorization: Bearer <access token>` issued by realm `saferedact` to the
 * `redactplus-portal` client. The API validates the issuer and requires `azp` to be that client,
 * and finds the account by the token's `sub` (or, once, by a verified email). It never takes an
 * account identifier from the request.
 *
 * Every response is validated here. The portal shows licence and trial state only as the backend
 * reported it and never derives, extends or caches entitlement decisions of its own.
 */

const isoDate = z.string().datetime({ offset: true });

export const portalCreditSchema = z.object({
  bucket: z.enum(["documents", "video_and_images", "audio"]),
  name: z.string().min(1).max(100),
  granted: z.number().nonnegative(),
  used: z.number().nonnegative(),
  remaining: z.number().nonnegative(),
});

export const portalProfileSchema = z.object({
  email: z.string().email(),
  displayName: z.string().max(200),
  /** The organisation, or for a trial the name the person typed (never the shared trial organisation). */
  organisation: z.string().max(200),
  provisioned: z.boolean(),
  /** Null for someone without a licence. */
  licence: z
    .object({
      code: z.string().max(64).nullable(),
      type: z.string().max(100),
      package: z.string().max(200),
      active: z.boolean(),
      validUntil: isoDate,
    })
    .nullable(),
  /** Null for a paying customer. */
  trial: z
    .object({
      status: z.enum(["not_started", "active", "ended", "blocked"]),
      /** True once the desktop application has been signed in to, which starts the term. */
      activated: z.boolean(),
      registeredAt: isoDate,
      /** Before the first desktop sign-in: the date the trial will start by itself. */
      startsAt: isoDate,
      endsAt: isoDate,
      credits: z.array(portalCreditSchema).max(10),
    })
    .nullable(),
});

/** The API's error body (PortalError). */
export const portalErrorSchema = z.object({
  code: z.string().min(1).max(64),
  message: z.string().max(500).optional(),
});

export type PortalProfile = z.infer<typeof portalProfileSchema>;
export type PortalCredit = z.infer<typeof portalCreditSchema>;
