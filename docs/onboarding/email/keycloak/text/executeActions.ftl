<#--
  RedactPlus Keycloak email theme: executeActions.ftl (plain text). FOR THE BACKEND TEAM.

  Generated from docs/onboarding/email/welcome-set-password.html in the Marketing-Site repository.
  Drop into ops/keycloak/themes/saferedact/email/text/executeActions.ftl (Admin-panel).

  Two journeys share Keycloak's execute-actions-email:
  - Website registration (this design): the backend sets the user attribute
    redactplus_onboarding=website-trial before calling execute-actions-email.
  - Everything else (Control Center invitations, password changes): unchanged. It falls through
    to the existing layout and the executeActionsBodyHtml message, exactly as today.

  Trial lines are optional user attributes the backend sets ONLY with confirmed values, already
  formatted for people (no raw ISO dates):
    redactplus_trial_start      one sentence, e.g. "It starts when you first sign in to RedactPlus Desktop."
    redactplus_trial_package    e.g. "Document + Media"
    redactplus_trial_starts_at  formatted, e.g. "<day> <month> <year>"
    redactplus_trial_ends_at    formatted, e.g. "<day> <month> <year>"
  Verify user.attributes access on the deployed Keycloak version before relying on it.

  ${link} is the action-token URL
  Keycloak generated; nothing else may produce it.
-->
<#assign rpOnboarding = (user.attributes.redactplus_onboarding)!"">
<#if rpOnboarding == "website-trial">
<#assign rpName = (((user.firstName)!"") + " " + ((user.lastName)!""))?trim>
<#if !rpName?has_content><#assign rpName = "there"></#if>
<#assign rpTrialStart = (user.attributes.redactplus_trial_start)!"">
<#assign rpTrialPackage = (user.attributes.redactplus_trial_package)!"">
<#assign rpTrialStartsAt = (user.attributes.redactplus_trial_starts_at)!"">
<#assign rpTrialEndsAt = (user.attributes.redactplus_trial_ends_at)!"">
<#assign rpTrialConfirmed = rpTrialPackage?has_content || rpTrialStartsAt?has_content || rpTrialEndsAt?has_content>
Welcome to RedactPlus

Hello ${rpName},

Thank you for registering. We've received your registration for ${(user.email)!""}. To finish setting up your account, choose your password using this secure link:

${link}

This link is personal and expires in ${linkExpirationFormatter(linkExpiration)}.

You'll use the same email address and password to sign in to RedactPlus Home and to the RedactPlus Desktop app.


YOUR SEVEN-DAY TRIAL

Your RedactPlus trial is temporary. It lasts seven days and then ends automatically. ${rpTrialStart}
<#if rpTrialConfirmed>
<#if rpTrialPackage?has_content>Package: ${rpTrialPackage}
</#if><#if rpTrialStartsAt?has_content>Starts:  ${rpTrialStartsAt}
</#if><#if rpTrialEndsAt?has_content>Ends:    ${rpTrialEndsAt}
</#if></#if>
When the seven days are over, the trial licence expires. To keep using RedactPlus, talk to us about a licence for your organisation.


Questions? Email support@redactplus.io. Replying to this message reaches the same team.


DIDN'T REGISTER?
Someone may have entered your email address by mistake. You can ignore this message: no password is set and nothing changes unless the link is used. If you keep receiving these emails, tell us at support@redactplus.io.

Anyone with the link above can set the password for this account, so don't forward it. RedactPlus will never ask for your password by email or phone.

--
${msg("emailFooterCompany")}
<#if msg("emailFooterAddress")?trim?has_content>${msg("emailFooterAddress")}
</#if>https://redactplus.io
Privacy Policy: ${msg("emailFooterPrivacyUrl")}
Terms of Use: ${msg("emailFooterTermsUrl")}
You received this email because this address was used to register for RedactPlus.
<#else>
<#outputformat "plainText">
<#assign requiredActionsText><#if requiredActions??><#list requiredActions><#items as reqActionItem>${msg("requiredAction.${reqActionItem}")}<#sep>, </#sep></#items></#list></#if></#assign>
</#outputformat>
${msg("executeActionsBody", link, linkExpiration, realmName, requiredActionsText, linkExpirationFormatter(linkExpiration))}
</#if>
