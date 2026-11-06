<#--
  RedactPlus Keycloak email theme: executeActions.ftl (HTML). FOR THE BACKEND TEAM.

  Generated from docs/onboarding/email/welcome-set-password.html in the Marketing-Site repository.
  Drop into ops/keycloak/themes/saferedact/email/html/executeActions.ftl (Admin-panel).

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

  Values are auto-escaped by Keycloak's HTML output format. ${link} is the action-token URL
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
<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Welcome to RedactPlus — Set Up Your Account</title>
<style>
  @media only screen and (max-width: 620px) {
    .rp-shell { padding: 16px 8px !important; }
    .rp-pad { padding-left: 22px !important; padding-right: 22px !important; }
    .rp-h1 { font-size: 24px !important; line-height: 30px !important; }
    .rp-btn a { display: block !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:#F5F5F4; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">

<!-- Inbox preview text: shown beside the subject, hidden in the message. -->
<div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:#F5F5F4; opacity:0;">
  Set up your password to finish creating your RedactPlus account.&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F5F5F4;">
  <tr>
    <td class="rp-shell" align="center" style="padding:32px 16px;">

      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; background-color:#FFFFFF; border:1px solid #E7E5E4; border-radius:16px; overflow:hidden;">

        <!-- Masthead: logo on white, brand-orange rule. -->
        <tr>
          <td class="rp-pad" style="padding:28px 40px 22px 40px;">
            <img src="https://redactplus.io/images/brand/redactplus-email-logo.png" width="160" height="40" alt="RedactPlus" style="display:block; width:160px; height:auto; max-width:160px; border:0; outline:none; text-decoration:none; font-family:Arial,Helvetica,sans-serif; font-size:20px; font-weight:700; color:#1C1917;">
          </td>
        </tr>
        <tr>
          <td style="height:3px; line-height:3px; font-size:0; background-color:#FF735C;">&nbsp;</td>
        </tr>

        <!-- Message -->
        <tr>
          <td class="rp-pad" style="padding:36px 40px 8px 40px; font-family:'Segoe UI',Helvetica,Arial,sans-serif; color:#1C1917;">
            <h1 class="rp-h1" style="margin:0 0 16px 0; font-size:26px; line-height:32px; font-weight:700; letter-spacing:-0.4px; color:#1C1917;">Welcome to RedactPlus</h1>
            <p style="margin:0 0 14px 0; font-size:16px; line-height:25px; color:#1C1917;">Hello ${rpName},</p>
            <p style="margin:0 0 14px 0; font-size:16px; line-height:25px; color:#44403C;">Thank you for registering. We’ve received your registration for <strong style="color:#1C1917;">${(user.email)!""}</strong>. To finish setting up your account, choose your password using the secure link below.</p>
            <p style="margin:0 0 4px 0; font-size:16px; line-height:25px; color:#44403C;">You’ll use the same email address and password to sign in to RedactPlus Home and to the RedactPlus Desktop app.</p>
          </td>
        </tr>

        <!-- Call to action (bulletproof button; VML for Outlook). -->
        <tr>
          <td class="rp-pad rp-btn" align="left" style="padding:24px 40px 8px 40px;">
            <!--[if mso]>
            <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${link}" style="height:48px; v-text-anchor:middle; width:240px;" arcsize="50%" stroke="f" fillcolor="#FF735C">
              <w:anchorlock/>
              <center style="color:#1C1917; font-family:'Segoe UI',Arial,sans-serif; font-size:16px; font-weight:bold;">Set up your password</center>
            </v:roundrect>
            <![endif]-->
            <!--[if !mso]><!-->
            <a href="${link}" target="_blank" rel="noopener" style="display:inline-block; background-color:#FF735C; color:#1C1917; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:16px; line-height:20px; font-weight:700; text-decoration:none; text-align:center; padding:14px 30px; border-radius:999px; mso-hide:all;">Set up your password</a>
            <!--<![endif]-->
          </td>
        </tr>
        <tr>
          <td class="rp-pad" style="padding:12px 40px 28px 40px; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:13px; line-height:20px; color:#57534E;">
            This link is personal and expires in ${linkExpirationFormatter(linkExpiration)}. If the button doesn’t work, copy this address into your browser:<br>
            <a href="${link}" target="_blank" rel="noopener" style="color:#C2412A; text-decoration:underline; word-break:break-all;">${link}</a>
          </td>
        </tr>

        <!-- Trial -->
        <tr>
          <td class="rp-pad" style="padding:0 40px 28px 40px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FAFAF9; border:1px solid #E7E5E4; border-radius:12px;">
              <tr>
                <td style="padding:20px 22px; font-family:'Segoe UI',Helvetica,Arial,sans-serif; color:#1C1917;">
                  <p style="margin:0 0 6px 0; font-size:12px; line-height:16px; font-weight:700; letter-spacing:1.2px; text-transform:uppercase; color:#C2412A;">Your seven-day trial</p>
                  <p style="margin:0 0 10px 0; font-size:15px; line-height:23px; color:#44403C;">Your RedactPlus trial is temporary. It lasts seven days and then ends automatically. ${rpTrialStart}</p>
                  <#if rpTrialConfirmed>
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 10px 0;">
                    <#if rpTrialPackage?has_content>
                    <tr>
                      <td style="padding:3px 16px 3px 0; font-size:14px; line-height:20px; color:#57534E; white-space:nowrap;">Package</td>
                      <td style="padding:3px 0; font-size:14px; line-height:20px; color:#1C1917; font-weight:600;">${rpTrialPackage}</td>
                    </tr>
                    </#if>
                    <#if rpTrialStartsAt?has_content>
                    <tr>
                      <td style="padding:3px 16px 3px 0; font-size:14px; line-height:20px; color:#57534E; white-space:nowrap;">Starts</td>
                      <td style="padding:3px 0; font-size:14px; line-height:20px; color:#1C1917; font-weight:600;">${rpTrialStartsAt}</td>
                    </tr>
                    </#if>
                    <#if rpTrialEndsAt?has_content>
                    <tr>
                      <td style="padding:3px 16px 3px 0; font-size:14px; line-height:20px; color:#57534E; white-space:nowrap;">Ends</td>
                      <td style="padding:3px 0; font-size:14px; line-height:20px; color:#1C1917; font-weight:600;">${rpTrialEndsAt}</td>
                    </tr>
                    </#if>
                  </table>
                  </#if>
                  <p style="margin:0; font-size:14px; line-height:21px; color:#57534E;">When the seven days are over, the trial licence expires. To keep using RedactPlus, talk to us about a licence for your organisation.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Help -->
        <tr>
          <td class="rp-pad" style="padding:0 40px 30px 40px; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:15px; line-height:23px; color:#44403C;">
            Questions? Email us at <a href="mailto:support@redactplus.io" style="color:#C2412A; text-decoration:underline;">support@redactplus.io</a>. Replying to this message reaches the same team.
          </td>
        </tr>

        <!-- Security notice -->
        <tr>
          <td class="rp-pad" style="padding:0 40px;">
            <div style="height:1px; line-height:1px; font-size:0; background-color:#E7E5E4;">&nbsp;</div>
          </td>
        </tr>
        <tr>
          <td class="rp-pad" style="padding:20px 40px 24px 40px; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:12px; line-height:19px; color:#78716C;">
            <strong style="color:#57534E;">Didn’t register?</strong> Someone may have entered your email address by mistake. You can ignore this message: no password is set and nothing changes unless the link is used. If you keep receiving these emails, tell us at <a href="mailto:support@redactplus.io" style="color:#78716C; text-decoration:underline;">support@redactplus.io</a>.<br><br>
            Anyone with the link above can set the password for this account, so don’t forward it. RedactPlus will never ask for your password by email or phone.
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td class="rp-pad" style="background-color:#FAFAF9; border-top:1px solid #E7E5E4; padding:20px 40px 24px 40px; font-family:'Segoe UI',Helvetica,Arial,sans-serif; font-size:11px; line-height:18px; color:#78716C;">
            <strong style="color:#57534E;">${msg("emailFooterCompany")}</strong><br>
            <#if msg("emailFooterAddress")?trim?has_content>${msg("emailFooterAddress")}<br></#if>
            <a href="https://redactplus.io" style="color:#78716C; text-decoration:underline;">redactplus.io</a>
            &nbsp;&middot;&nbsp;
            <a href="${msg("emailFooterPrivacyUrl")}" style="color:#78716C; text-decoration:underline;">Privacy Policy</a>
            &nbsp;&middot;&nbsp;
            <a href="${msg("emailFooterTermsUrl")}" style="color:#78716C; text-decoration:underline;">Terms of Use</a><br>
            You received this email because this address was used to register for RedactPlus.
          </td>
        </tr>

      </table>
      <!--[if mso]></td></tr></table><![endif]-->

    </td>
  </tr>
</table>
</body>
</html>
<#else>
<#-- Unchanged default: Keycloak's base executeActions.ftl, using this theme's layout and messages. -->
<#outputformat "plainText">
<#assign requiredActionsText><#if requiredActions??><#list requiredActions><#items as reqActionItem>${msg("requiredAction.${reqActionItem}")}<#sep>, </#sep></#items></#list></#if></#assign>
</#outputformat>
<#import "template.ftl" as layout>
<@layout.emailLayout>
${kcSanitize(msg("executeActionsBodyHtml", link, linkExpiration, realmName, requiredActionsText, linkExpirationFormatter(linkExpiration)))?no_esc}
</@layout.emailLayout>
</#if>
